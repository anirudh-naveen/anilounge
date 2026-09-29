/**
 * Admin page operations: search and edit catalog rows (titles, characters, voice
 * actors, studios), list users, set roles, mute, and ban.
 *
 * Layer: domain service used by `controllers/adminController.js`. Throws `HttpError`
 * for expected failures. Title edits go through `Content.save` so the subtype tables
 * stay consistent; person/studio edits update their rows directly. Both are recorded
 * in `content.admin_overrides` so the catalog sync keeps them (see `utils/adminContent.js`).
 *
 * Permissions: admins edit content and mute regular users. Only the creator adds or
 * removes admins and bans users (checked again here, not only in the routes).
 */

import { query, startSession } from '../../config/postgres.js'
import { isCatalogId, isUuid } from '../db/ids.js'
import { appearanceRoleToApi, contentTypeFromKind } from '../db/kinds.js'
import Content, { loadAdminOverrides } from '../models/Content.js'
import {
  isAdminUser,
  isCreatorUser,
  isOwnerEmail,
  parseAdminEmails,
} from '../middleware/adminOnly.js'
import {
  EDITABLE_KINDS,
  applyAdminOverrides,
  ENTITY_KINDS,
  WATCHABLE_KINDS,
  fieldsForKind,
  mergeOverrides,
  parseContentEdits,
  readEditableFields,
} from '../utils/adminContent.js'
import { isMuted, muteEndsAt, MUTE_DURATIONS } from '../utils/accountStatus.js'
import { HttpError } from '../utils/httpError.js'
import { escapeLike } from './friendService.js'
import { revokeAllSessions } from './sessionService.js'
import {
  LIVE_NOTICE_SQL,
  NOTICE_TTL_DAYS,
  clearSyncNotices,
  noticesTableReady,
  pruneExpiredNotices,
} from './syncGuard.js'

const PAGE_SIZE = 25
/** Most linked rows returned per group in the editor. */
const LINK_LIMIT = 60
/** Roles the creator can hand out from the admin page ('creator' is set by script only). */
export const ASSIGNABLE_ROLES = ['user', 'admin']
export const USER_FILTERS = ['all', 'staff', 'muted', 'banned']

/**
 * @param {unknown} value
 * @returns {number} 1-based page number.
 */
function pageNumber(value) {
  const page = Number.parseInt(String(value ?? ''), 10)
  return Number.isInteger(page) && page > 0 ? Math.min(page, 10000) : 1
}

/**
 * Run `fn` in a transaction; its `query` calls (including model saves) join it.
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function inTransaction(fn) {
  const session = await startSession()
  try {
    await session.startTransaction()
    const result = await fn()
    await session.commitTransaction()
    return result
  } catch (error) {
    await session.abortTransaction()
    throw error
  } finally {
    session.endSession()
  }
}

/**
 * @param {string} reason
 * @returns {string | null} Trimmed reason (max 300 characters) or null.
 */
function cleanReason(reason) {
  const text = typeof reason === 'string' ? reason.trim().slice(0, 300) : ''
  return text || null
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

/**
 * Search one kind of catalog row by name (native names and aliases too). With no
 * term, the most recently updated rows come first.
 * @param {{ q?: string, type?: string, page?: unknown }} params - `type` is a content kind.
 * @returns {Promise<{ items: object[], page: number, pageSize: number, total: number }>}
 */
export async function searchContent({ q, type, page } = {}) {
  const kind = EDITABLE_KINDS.includes(type) ? type : 'movie'
  const term = typeof q === 'string' ? q.trim().slice(0, 100) : ''
  const current = pageNumber(page)
  const params = [kind]
  let where = 'c.kind = $1'
  if (term) {
    params.push(`%${escapeLike(term)}%`)
    where += ` AND (c.name ILIKE $2 OR c.native_name ILIKE $2
      OR ch.english_name ILIKE $2 OR vo.english_name ILIKE $2
      OR EXISTS (SELECT 1 FROM content_akas a WHERE a.content_id = c.id AND a.name ILIKE $2))`
  }
  const order = term
    ? `(lower(c.name) = lower($${params.push(term)})) DESC, c.name`
    : 'c.updated_at DESC'
  const joins = `
    LEFT JOIN movies m ON m.content_id = c.id
    LEFT JOIN series s ON s.content_id = c.id
    LEFT JOIN specials sp ON sp.content_id = c.id
    LEFT JOIN characters ch ON ch.content_id = c.id
    LEFT JOIN voices vo ON vo.content_id = c.id`

  const [{ rows }, count] = await Promise.all([
    query(
      `SELECT c.id, c.kind, c.name, c.image_path,
              COALESCE(ch.english_name, vo.english_name) AS english_name,
              COALESCE(m.release_date, s.release_date, sp.release_date) AS release_date,
              (c.admin_overrides - '_aliases') <> '{}'::jsonb AS edited
       FROM content c ${joins}
       WHERE ${where}
       ORDER BY ${order}
       LIMIT ${PAGE_SIZE} OFFSET ${(current - 1) * PAGE_SIZE}`,
      params,
    ),
    query(
      `SELECT count(*)::int AS n FROM content c ${joins} WHERE ${where}`,
      params.slice(0, term ? 2 : 1),
    ),
  ])

  return {
    items: rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      title: row.name,
      subtitle: row.english_name && row.english_name !== row.name ? row.english_name : null,
      imagePath: row.image_path,
      releaseDate: row.release_date,
      edited: Boolean(row.edited),
    })),
    page: current,
    pageSize: PAGE_SIZE,
    total: count.rows[0].n,
  }
}

/**
 * @param {object} row - `{ id, kind, name, image_path, note? }`
 * @returns {{ id: string, kind: string, name: string, imagePath: string | null, note: string | null }}
 */
function linkView(row) {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    imagePath: row.image_path || null,
    note: row.note || null,
  }
}

/**
 * Rows connected to a catalog row, grouped for the editor so an admin can jump
 * between a title and its cast, voice actors, studios, and related titles.
 * @param {string} id
 * @param {string} kind
 * @returns {Promise<Array<{ key: string, label: string, items: object[] }>>}
 */
async function loadLinks(id, kind) {
  const run = async (sql) => (await query(sql, [id])).rows.map(linkView)
  const cols = 'c.id, c.kind, c.name, c.image_path'

  if (WATCHABLE_KINDS.includes(kind)) {
    const [characters, voices, studios, related] = await Promise.all([
      run(`SELECT ${cols}, a.role AS note FROM appearances a
           JOIN content c ON c.id = a.character_id
           WHERE a.work_id = $1 ORDER BY a.importance DESC, c.name LIMIT ${LINK_LIMIT}`),
      run(`SELECT ${cols}, string_agg(DISTINCT ch.name, ', ') AS note FROM appearances a
           JOIN voice_credits v ON v.appearance_id = a.id
           JOIN content c ON c.id = v.voice_id
           JOIN content ch ON ch.id = a.character_id
           WHERE a.work_id = $1 GROUP BY c.id ORDER BY c.name LIMIT ${LINK_LIMIT}`),
      run(`SELECT ${cols} FROM studio_credits sc JOIN content c ON c.id = sc.studio_id
           WHERE sc.work_id = $1 ORDER BY c.name`),
      run(`SELECT DISTINCT ON (c.id) ${cols}, r.kind AS note FROM (
             SELECT to_id AS other, kind FROM content_relations WHERE from_id = $1
             UNION ALL
             SELECT fm2.member_id, 'franchise' FROM franchise_members fm
             JOIN franchise_members fm2 ON fm2.franchise_id = fm.franchise_id
             WHERE fm.member_id = $1 AND fm2.member_id <> $1
           ) r JOIN content c ON c.id = r.other
           WHERE c.kind IN ('movie', 'series', 'special')
           ORDER BY c.id LIMIT ${LINK_LIMIT}`),
    ])
    for (const row of characters) row.note = appearanceRoleToApi(row.note)
    return [
      { key: 'characters', label: 'Characters', items: characters },
      { key: 'voices', label: 'Voice actors', items: voices },
      { key: 'studios', label: 'Studios', items: studios },
      { key: 'related', label: 'Related titles', items: related },
    ]
  }

  if (kind === 'character') {
    const [works, voices] = await Promise.all([
      run(`SELECT ${cols}, a.role AS note FROM appearances a JOIN content c ON c.id = a.work_id
           WHERE a.character_id = $1 ORDER BY c.name LIMIT ${LINK_LIMIT}`),
      run(`SELECT DISTINCT ON (c.id) ${cols}, v.language AS note FROM appearances a
           JOIN voice_credits v ON v.appearance_id = a.id JOIN content c ON c.id = v.voice_id
           WHERE a.character_id = $1 ORDER BY c.id LIMIT ${LINK_LIMIT}`),
    ])
    for (const row of works) row.note = appearanceRoleToApi(row.note)
    return [
      { key: 'works', label: 'Appears in', items: works },
      { key: 'voices', label: 'Voiced by', items: voices },
    ]
  }

  if (kind === 'voice') {
    const [characters, works] = await Promise.all([
      run(`SELECT DISTINCT ON (c.id) ${cols}, w.name AS note FROM voice_credits v
           JOIN appearances a ON a.id = v.appearance_id
           JOIN content c ON c.id = a.character_id JOIN content w ON w.id = a.work_id
           WHERE v.voice_id = $1 ORDER BY c.id LIMIT ${LINK_LIMIT}`),
      run(`SELECT DISTINCT ON (c.id) ${cols} FROM voice_credits v
           JOIN appearances a ON a.id = v.appearance_id JOIN content c ON c.id = a.work_id
           WHERE v.voice_id = $1 ORDER BY c.id LIMIT ${LINK_LIMIT}`),
    ])
    return [
      { key: 'characters', label: 'Characters voiced', items: characters },
      { key: 'works', label: 'Titles', items: works },
    ]
  }

  const works = await run(`SELECT ${cols} FROM studio_credits sc JOIN content c ON c.id = sc.work_id
    WHERE sc.studio_id = $1 ORDER BY c.name LIMIT ${LINK_LIMIT}`)
  return [{ key: 'works', label: 'Titles', items: works }]
}

/**
 * Load a catalog row for editing.
 * @param {string} id
 * @returns {Promise<{ id: string, kind: string, contentType: string | null, fields: string[],
 *   values: Record<string, unknown>, locked: string[], links: object[] }>}
 */
export async function getEditableContent(id) {
  if (!isCatalogId(id)) throw new HttpError(400, 'Invalid content id.')
  const { rows } = await query('SELECT id, kind FROM content WHERE id = $1', [id])
  const row = rows[0]
  if (!row || !EDITABLE_KINDS.includes(row.kind)) throw new HttpError(404, 'Content not found.')
  const { kind } = row

  let values
  if (WATCHABLE_KINDS.includes(kind)) {
    const doc = await Content.findById(row.id)
    if (!doc) throw new HttpError(404, 'Content not found.')
    values = readEditableFields(doc, kind)
  } else {
    const { rows: entityRows } = await query(
      `SELECT c.name, c.native_name, c.about, c.image_path,
              COALESCE(ch.english_name, vo.english_name) AS english_name
       FROM content c
       LEFT JOIN characters ch ON ch.content_id = c.id
       LEFT JOIN voices vo ON vo.content_id = c.id
       WHERE c.id = $1`,
      [row.id],
    )
    const entity = entityRows[0]
    values = readEditableFields(
      {
        name: entity.name,
        englishName: entity.english_name,
        nativeName: entity.native_name,
        about: entity.about,
        imagePath: entity.image_path,
      },
      kind,
    )
  }

  const [overrides, links] = await Promise.all([
    loadAdminOverrides(row.id),
    loadLinks(row.id, kind),
  ])
  const fields = fieldsForKind(kind)
  return {
    id: String(row.id),
    kind,
    contentType: WATCHABLE_KINDS.includes(kind) ? contentTypeFromKind(kind) : null,
    fields,
    values,
    locked: fields.filter((field) => Object.prototype.hasOwnProperty.call(overrides, field)),
    links,
  }
}

/**
 * Write person/studio fields straight to their rows (the sync's Entity.save
 * re-applies the same overrides later).
 * @param {string} id
 * @param {string} kind
 * @param {Record<string, unknown>} overrides - Full override set after the edit.
 * @param {Record<string, unknown>} values - Fields changed in this edit.
 * @returns {Promise<void>}
 */
async function writeEntityFields(id, kind, overrides, values) {
  const columns = {
    name: 'name',
    nativeName: 'native_name',
    about: 'about',
    imagePath: 'image_path',
  }
  const sets = []
  const params = [id]
  for (const [field, column] of Object.entries(columns)) {
    if (!(field in values)) continue
    params.push(values[field])
    sets.push(`${column} = $${params.length}`)
  }
  if (sets.length) {
    await query(`UPDATE content SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, params)
  }
  if ('englishName' in values && (kind === 'character' || kind === 'voice')) {
    const table = kind === 'character' ? 'characters' : 'voices'
    await query(`UPDATE ${table} SET english_name = $2 WHERE content_id = $1`, [
      id,
      values.englishName,
    ])
  }
  const aliases = Array.isArray(overrides._aliases) ? overrides._aliases : []
  if (aliases.length) {
    await query(
      `INSERT INTO content_akas (content_id, name) SELECT $1, unnest($2::text[])
       ON CONFLICT DO NOTHING`,
      [id, aliases],
    )
  }
}

/**
 * Apply an admin edit. Edited fields are locked against the sync; `unlock` hands
 * fields back to it (their current value stays until the next sync changes it).
 * @param {string} id
 * @param {{ changes?: Record<string, unknown>, unlock?: unknown }} body
 * @returns {Promise<ReturnType<typeof getEditableContent>>}
 */
export async function updateContent(id, { changes = {}, unlock = [] } = {}) {
  if (!isCatalogId(id)) throw new HttpError(400, 'Invalid content id.')

  await inTransaction(async () => {
    const { rows } = await query(
      'SELECT id, kind, name, admin_overrides FROM content WHERE id = $1 FOR UPDATE',
      [id],
    )
    const row = rows[0]
    if (!row || !EDITABLE_KINDS.includes(row.kind)) throw new HttpError(404, 'Content not found.')
    const { kind } = row

    const { values, errors } = parseContentEdits(changes, kind)
    if (errors.length) throw new HttpError(400, errors.join('. '))
    const fields = new Set(fieldsForKind(kind))
    const unlockList = Array.isArray(unlock) ? unlock.filter((field) => fields.has(field)) : []
    if (!Object.keys(values).length && !unlockList.length) {
      throw new HttpError(400, 'Nothing to change.')
    }

    const overrides = mergeOverrides(row.admin_overrides, {
      values,
      unlock: unlockList,
      kind,
      oldName: row.name,
    })
    await query('UPDATE content SET admin_overrides = $2 WHERE id = $1', [
      row.id,
      JSON.stringify(overrides),
    ])

    if (ENTITY_KINDS.includes(kind)) {
      await writeEntityFields(row.id, kind, overrides, values)
    } else {
      const doc = await Content.findById(row.id)
      // save() re-reads admin_overrides and applies them, including the new values.
      await doc.save()
    }
    // A hand edit answers any sync notice for the same field.
    await clearSyncNotices(row.id, Object.keys(values))
  })

  return getEditableContent(id)
}

// ---------------------------------------------------------------------------
// Sync notices
// ---------------------------------------------------------------------------

export const NOTICE_OUTCOMES = ['changed', 'blocked']
const MAX_BATCH = 100

/**
 * Sync notices from the last 14 days, newest first.
 * @param {{ outcome?: string, page?: unknown }} params - `outcome` filters to changed|blocked.
 * @returns {Promise<{ items: object[], page: number, pageSize: number, total: number }>}
 */
export async function listSyncChanges({ outcome, page } = {}) {
  const current = pageNumber(page)
  if (!(await noticesTableReady())) return { items: [], page: 1, pageSize: PAGE_SIZE, total: 0 }
  await pruneExpiredNotices()
  const params = []
  let where = LIVE_NOTICE_SQL.replace('created_at', 'n.created_at')
  if (NOTICE_OUTCOMES.includes(outcome)) {
    params.push(outcome)
    where += ` AND n.outcome = $1`
  }
  const [{ rows }, count] = await Promise.all([
    query(
      `SELECT n.id, n.content_id, n.field, n.outcome, n.old_value, n.new_value, n.created_at,
              c.kind, c.name, c.image_path
       FROM content_sync_changes n
       JOIN content c ON c.id = n.content_id
       WHERE ${where}
       ORDER BY n.created_at DESC, c.name, n.field
       LIMIT ${PAGE_SIZE} OFFSET ${(current - 1) * PAGE_SIZE}`,
      params,
    ),
    query(`SELECT count(*)::int AS n FROM content_sync_changes n WHERE ${where}`, params),
  ])
  return {
    items: rows.map((row) => ({
      id: row.id,
      contentId: row.content_id,
      kind: row.kind,
      name: row.name,
      imagePath: row.image_path,
      field: row.field,
      outcome: row.outcome,
      oldValue: row.old_value,
      newValue: row.new_value,
      createdAt: row.created_at,
      expiresAt: new Date(new Date(row.created_at).getTime() + NOTICE_TTL_DAYS * 86400000),
    })),
    page: current,
    pageSize: PAGE_SIZE,
    total: count.rows[0].n,
  }
}

/** @returns {Promise<number>} Live notices (0 before the schema is applied). */
export async function countSyncChanges() {
  if (!(await noticesTableReady())) return 0
  const { rows } = await query(
    `SELECT count(*)::int AS n FROM content_sync_changes WHERE ${LIVE_NOTICE_SQL}`,
  )
  return rows[0].n
}

/**
 * @param {unknown} ids
 * @returns {string[]} Valid notice ids (at most MAX_BATCH).
 */
function noticeIds(ids) {
  const list = (Array.isArray(ids) ? ids : [ids]).map(String).filter((id) => isUuid(id))
  if (!list.length) throw new HttpError(400, 'No notices given.')
  if (list.length > MAX_BATCH) throw new HttpError(400, `At most ${MAX_BATCH} at a time.`)
  return [...new Set(list)]
}

/**
 * Take the sync's value for a field an admin had locked: unlock it and write the value.
 * @param {string} contentId
 * @param {string} kind
 * @param {string} field
 * @param {unknown} value
 * @returns {Promise<void>}
 */
async function applySyncValue(contentId, kind, field, value) {
  const { values, errors } = parseContentEdits({ [field]: value }, kind)
  if (errors.length) throw new HttpError(400, `Can't apply ${field}: ${errors.join('. ')}`)
  const overrides = await loadAdminOverrides(contentId)
  delete overrides[field]
  await query('UPDATE content SET admin_overrides = $2 WHERE id = $1', [
    contentId,
    JSON.stringify(overrides),
  ])
  if (ENTITY_KINDS.includes(kind)) {
    await writeEntityFields(contentId, kind, overrides, values)
  } else {
    const doc = await Content.findById(contentId)
    if (!doc) throw new HttpError(404, 'Content not found.')
    applyAdminOverrides(doc, values, kind)
    doc.$acceptFields = [field]
    await doc.save()
  }
}

/**
 * Act on sync notices:
 * - 'revert' a 'changed' notice: put the old value back and lock the field;
 * - 'apply' a 'blocked' notice: unlock the field and take the sync's value;
 * - 'dismiss': just remove the notice.
 * @param {object} actor - The signed-in admin (`req.user`), for the log.
 * @param {unknown} ids
 * @param {'revert' | 'apply' | 'dismiss'} action
 * @returns {Promise<{ done: number }>}
 */
export async function resolveSyncChanges(actor, ids, action) {
  const list = noticeIds(ids)
  let done = 0
  if (action === 'dismiss') {
    const result = await query('DELETE FROM content_sync_changes WHERE id = ANY($1::uuid[])', [
      list,
    ])
    done = result.rowCount || 0
  } else {
    const wanted = action === 'revert' ? 'changed' : 'blocked'
    for (const id of list) {
      const { rows } = await query(
        `SELECT n.content_id, n.field, n.outcome, n.old_value, n.new_value, c.kind
         FROM content_sync_changes n JOIN content c ON c.id = n.content_id
         WHERE n.id = $1`,
        [id],
      )
      const notice = rows[0]
      if (!notice || notice.outcome !== wanted) continue
      if (action === 'revert') {
        // Same path as a hand edit: writes, locks, and clears the notice.
        await updateContent(notice.content_id, { changes: { [notice.field]: notice.old_value } })
      } else {
        await inTransaction(() =>
          applySyncValue(notice.content_id, notice.kind, notice.field, notice.new_value),
        )
        await query('DELETE FROM content_sync_changes WHERE id = $1', [id])
      }
      done += 1
    }
  }
  console.log(`Admin ${actor._id} ${action} on ${done} sync notice(s)`)
  return { done }
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

const USER_COLUMNS = `u.id, u.username, u.email, u.profile_picture, u.role, u.is_demo,
  u.email_verified_at, u.created_at, u.last_active_at, u.muted_until, u.mute_reason,
  u.banned_at, u.ban_reason`

/**
 * @param {object} row - users row.
 * @param {Set<string>} owners - ADMIN_EMAILS.
 * @returns {object}
 */
function adminUserView(row, owners) {
  const role = ['admin', 'creator'].includes(row.role) ? row.role : 'user'
  const user = {
    email: row.email,
    role,
    emailVerified: Boolean(row.email_verified_at),
    bannedAt: row.banned_at,
    isDemo: () => Boolean(row.is_demo),
  }
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    profilePicture: row.profile_picture || null,
    role,
    isOwner: isOwnerEmail(user, owners),
    isAdmin: isAdminUser(user, owners),
    emailVerified: user.emailVerified,
    isDemo: Boolean(row.is_demo),
    createdAt: row.created_at,
    lastActiveAt: row.last_active_at,
    mutedUntil: isMuted({ mutedUntil: row.muted_until }) ? row.muted_until : null,
    muteReason: isMuted({ mutedUntil: row.muted_until }) ? row.mute_reason : null,
    bannedAt: row.banned_at || null,
    banReason: row.ban_reason || null,
  }
}

/**
 * List accounts, optionally filtered by username/email and status.
 * @param {{ q?: string, filter?: string, page?: unknown }} params
 * @returns {Promise<{ items: object[], page: number, pageSize: number, total: number }>}
 */
export async function listUsers({ q, filter, page } = {}) {
  const term = typeof q === 'string' ? q.trim().slice(0, 100) : ''
  const owners = parseAdminEmails()
  const current = pageNumber(page)
  const params = []
  const clauses = ['NOT u.pending_signup']
  if (term) {
    params.push(`%${escapeLike(term)}%`)
    clauses.push(`(u.username ILIKE $${params.length} OR u.email ILIKE $${params.length})`)
  }
  if (filter === 'staff') {
    params.push([...owners])
    clauses.push(
      `(u.role IN ('admin', 'creator') OR lower(u.email) = ANY($${params.length}::text[]))`,
    )
  } else if (filter === 'muted') {
    clauses.push('u.muted_until > now()')
  } else if (filter === 'banned') {
    clauses.push('u.banned_at IS NOT NULL')
  }
  const where = clauses.join(' AND ')

  const [{ rows }, count] = await Promise.all([
    query(
      `SELECT ${USER_COLUMNS}
       FROM users u
       WHERE ${where}
       ORDER BY CASE u.role WHEN 'creator' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, lower(u.username)
       LIMIT ${PAGE_SIZE} OFFSET ${(current - 1) * PAGE_SIZE}`,
      params,
    ),
    query(`SELECT count(*)::int AS n FROM users u WHERE ${where}`, params),
  ])

  return {
    items: rows.map((row) => adminUserView(row, owners)),
    page: current,
    pageSize: PAGE_SIZE,
    total: count.rows[0].n,
  }
}

/**
 * Load a moderation target, refusing the actor themselves and unknown ids.
 * @param {{ _id: string }} actor
 * @param {string} targetId
 * @returns {Promise<object>} users row.
 */
async function loadTarget(actor, targetId) {
  if (!isUuid(String(targetId || ''))) throw new HttpError(400, 'Invalid user id.')
  if (String(actor._id) === String(targetId)) {
    throw new HttpError(400, "You can't do that to your own account.")
  }
  const { rows } = await query(
    `SELECT ${USER_COLUMNS}, u.pending_signup FROM users u WHERE u.id = $1`,
    [targetId],
  )
  const target = rows[0]
  if (!target || target.pending_signup) throw new HttpError(404, 'User not found.')
  if (target.role === 'creator') throw new HttpError(403, "The creator's account can't be changed.")
  return target
}

/**
 * @param {string} userId
 * @param {Set<string>} owners
 * @returns {Promise<object>} Fresh user view.
 */
async function reloadUser(userId, owners) {
  const { rows } = await query(`SELECT ${USER_COLUMNS} FROM users u WHERE u.id = $1`, [userId])
  return adminUserView(rows[0], owners)
}

/**
 * Creator only: make a user an admin or a regular user.
 * @param {object} actor - The signed-in user (`req.user`).
 * @param {string} targetId
 * @param {unknown} role - 'user' | 'admin'
 * @returns {Promise<object>} The updated user view.
 */
export async function setUserRole(actor, targetId, role) {
  if (!isCreatorUser(actor)) throw new HttpError(403, 'Only the creator can add or remove admins.')
  if (!ASSIGNABLE_ROLES.includes(role)) {
    throw new HttpError(400, `Role must be one of ${ASSIGNABLE_ROLES.join(', ')}.`)
  }
  const owners = parseAdminEmails()
  const target = await loadTarget(actor, targetId)
  if (target.is_demo) throw new HttpError(400, "The demo account's role can't be changed.")
  if (isOwnerEmail(target, owners)) {
    throw new HttpError(400, 'This account is an owner (ADMIN_EMAILS) and is always an admin.')
  }
  if (role === 'admin' && !target.email_verified_at) {
    throw new HttpError(400, 'Only accounts with a verified email can be admins.')
  }
  if (role === 'admin' && target.banned_at) {
    throw new HttpError(400, 'Unban this account before making it an admin.')
  }

  await query('UPDATE users SET role = $2 WHERE id = $1', [target.id, role])
  console.log(`Creator ${actor._id} set role of user ${target.id} to ${role}`)
  return reloadUser(target.id, owners)
}

/**
 * Mute a user for a set time, or lift a mute (`duration` 'off'). Admins can mute
 * regular users; the creator can also mute admins.
 * @param {object} actor - The signed-in admin (`req.user`).
 * @param {string} targetId
 * @param {{ duration?: unknown, reason?: unknown }} body - `duration` is a MUTE_DURATIONS key or 'off'.
 * @returns {Promise<object>} The updated user view.
 */
export async function muteUser(actor, targetId, { duration, reason } = {}) {
  const owners = parseAdminEmails()
  const target = await loadTarget(actor, targetId)
  if (adminUserView(target, owners).isAdmin && !isCreatorUser(actor)) {
    throw new HttpError(403, 'Only the creator can mute an admin.')
  }

  if (duration === 'off') {
    await query('UPDATE users SET muted_until = NULL, mute_reason = NULL WHERE id = $1', [
      target.id,
    ])
    console.log(`Admin ${actor._id} unmuted user ${target.id}`)
    return reloadUser(target.id, owners)
  }

  const until = muteEndsAt(String(duration))
  if (!until) {
    throw new HttpError(
      400,
      `Duration must be one of ${[...Object.keys(MUTE_DURATIONS), 'off'].join(', ')}.`,
    )
  }
  await query('UPDATE users SET muted_until = $2, mute_reason = $3 WHERE id = $1', [
    target.id,
    until,
    cleanReason(reason),
  ])
  console.log(`Admin ${actor._id} muted user ${target.id} until ${until.toISOString()}`)
  return reloadUser(target.id, owners)
}

/**
 * Creator only: ban (and sign out everywhere) or unban a user. Banning an admin
 * also removes their admin role.
 * @param {object} actor - The signed-in user (`req.user`).
 * @param {string} targetId
 * @param {{ banned?: unknown, reason?: unknown }} body
 * @returns {Promise<object>} The updated user view.
 */
export async function setBan(actor, targetId, { banned, reason } = {}) {
  if (!isCreatorUser(actor)) throw new HttpError(403, 'Only the creator can ban users.')
  if (typeof banned !== 'boolean') throw new HttpError(400, 'banned must be true or false.')
  const owners = parseAdminEmails()
  const target = await loadTarget(actor, targetId)
  if (target.is_demo) throw new HttpError(400, "The demo account can't be banned.")
  if (banned && isOwnerEmail(target, owners)) {
    throw new HttpError(400, 'Remove this email from ADMIN_EMAILS before banning it.')
  }

  if (banned) {
    await inTransaction(async () => {
      await query(
        `UPDATE users SET banned_at = now(), ban_reason = $2,
           role = CASE WHEN role = 'admin' THEN 'user' ELSE role END
         WHERE id = $1`,
        [target.id, cleanReason(reason)],
      )
      await revokeAllSessions(target.id)
    })
    console.log(`Creator ${actor._id} banned user ${target.id}`)
  } else {
    await query('UPDATE users SET banned_at = NULL, ban_reason = NULL WHERE id = $1', [target.id])
    console.log(`Creator ${actor._id} unbanned user ${target.id}`)
  }
  return reloadUser(target.id, owners)
}

/**
 * Public list of staff accounts for the creator/admin badges next to usernames.
 * Owners from ADMIN_EMAILS show as admins.
 * @returns {Promise<Array<{ id: string, username: string, role: 'creator' | 'admin' }>>}
 */
export async function listStaff() {
  const owners = [...parseAdminEmails()]
  const { rows } = await query(
    `SELECT id, username, role FROM users
     WHERE banned_at IS NULL AND NOT is_demo AND email_verified_at IS NOT NULL
       AND (role IN ('admin', 'creator') OR lower(email) = ANY($1::text[]))`,
    [owners],
  )
  return rows.map((row) => ({
    id: String(row.id),
    username: row.username,
    role: row.role === 'creator' ? 'creator' : 'admin',
  }))
}

export default {
  searchContent,
  getEditableContent,
  updateContent,
  listSyncChanges,
  countSyncChanges,
  resolveSyncChanges,
  listUsers,
  setUserRole,
  muteUser,
  setBan,
  listStaff,
}
