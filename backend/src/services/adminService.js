/**
 * Admin page operations: search and edit watchable content, list users and set roles.
 *
 * Layer: domain service used by `controllers/adminController.js`. Throws `HttpError`
 * for expected failures. Content edits go through `Content.save` so the subtype
 * tables stay consistent, and are recorded in `content.admin_overrides` so the
 * catalog sync keeps them (see `utils/adminContent.js`).
 */

import { query, startSession } from '../../config/postgres.js'
import { isCatalogId, isUuid } from '../db/ids.js'
import { WATCHABLE_KINDS, contentTypeFromKind } from '../db/kinds.js'
import Content, { loadAdminOverrides } from '../models/Content.js'
import { isAdminUser, isOwnerEmail, parseAdminEmails } from '../middleware/adminOnly.js'
import {
  CONTENT_FIELDS,
  fieldsForKind,
  parseContentEdits,
  readEditableFields,
} from '../utils/adminContent.js'
import { HttpError } from '../utils/httpError.js'
import { escapeLike } from './friendService.js'

const PAGE_SIZE = 25
export const ROLES = ['user', 'admin']

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
 * Search movies, series, and specials by title, newest-edited first when no term.
 * @param {{ q?: string, type?: string, page?: unknown }} params
 * @returns {Promise<{ items: object[], page: number, pageSize: number, total: number }>}
 */
export async function searchContent({ q, type, page } = {}) {
  const term = typeof q === 'string' ? q.trim().slice(0, 100) : ''
  const kinds = WATCHABLE_KINDS.includes(type) ? [type] : WATCHABLE_KINDS
  const current = pageNumber(page)
  const params = [kinds]
  let where = 'c.kind = ANY($1::text[])'
  if (term) {
    params.push(`%${escapeLike(term)}%`)
    where += ` AND (c.name ILIKE $2 OR c.native_name ILIKE $2
      OR EXISTS (SELECT 1 FROM content_akas a WHERE a.content_id = c.id AND a.name ILIKE $2))`
  }
  const order = term
    ? `(lower(c.name) = lower($${params.push(term)})) DESC, c.name`
    : 'c.updated_at DESC'

  const [{ rows }, count] = await Promise.all([
    query(
      `SELECT c.id, c.kind, c.name, c.image_path, c.updated_at,
              COALESCE(m.release_date, s.release_date, sp.release_date) AS release_date,
              c.admin_overrides <> '{}'::jsonb AS edited
       FROM content c
       LEFT JOIN movies m ON m.content_id = c.id
       LEFT JOIN series s ON s.content_id = c.id
       LEFT JOIN specials sp ON sp.content_id = c.id
       WHERE ${where}
       ORDER BY ${order}
       LIMIT ${PAGE_SIZE} OFFSET ${(current - 1) * PAGE_SIZE}`,
      params,
    ),
    query(`SELECT count(*)::int AS n FROM content c WHERE ${where}`, params.slice(0, term ? 2 : 1)),
  ])

  return {
    items: rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      contentType: contentTypeFromKind(row.kind),
      title: row.name,
      posterPath: row.image_path,
      releaseDate: row.release_date,
      updatedAt: row.updated_at,
      edited: Boolean(row.edited),
    })),
    page: current,
    pageSize: PAGE_SIZE,
    total: count.rows[0].n,
  }
}

/**
 * Load a watchable for editing: its editable values and which ones are locked.
 * @param {string} id
 * @returns {Promise<{ id: string, kind: string, contentType: string, fields: string[],
 *   values: Record<string, unknown>, locked: string[] }>}
 */
export async function getEditableContent(id) {
  if (!isCatalogId(id)) throw new HttpError(400, 'Invalid content id.')
  const doc = await Content.findById(id)
  if (!doc) throw new HttpError(404, 'Content not found.')
  const kind = doc.contentType === 'tv' ? 'series' : doc.contentType
  const overrides = await loadAdminOverrides(doc._id)
  const fields = fieldsForKind(kind)
  return {
    id: String(doc._id),
    kind,
    contentType: doc.contentType,
    fields,
    values: readEditableFields(doc, kind),
    locked: fields.filter((field) => Object.prototype.hasOwnProperty.call(overrides, field)),
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
  const unlockList = Array.isArray(unlock) ? unlock.filter((f) => f in CONTENT_FIELDS) : []

  await inTransaction(async () => {
    const doc = await Content.findById(id)
    if (!doc) throw new HttpError(404, 'Content not found.')
    const kind = doc.contentType === 'tv' ? 'series' : doc.contentType

    const { values, errors } = parseContentEdits(changes, kind)
    if (errors.length) throw new HttpError(400, errors.join('. '))
    if (!Object.keys(values).length && !unlockList.length) {
      throw new HttpError(400, 'Nothing to change.')
    }

    const { rows } = await query(
      `SELECT admin_overrides FROM content WHERE id = $1 FOR UPDATE`,
      [doc._id],
    )
    const overrides = { ...(rows[0]?.admin_overrides || {}) }
    for (const field of unlockList) delete overrides[field]
    Object.assign(overrides, values)

    // Keep the old title as an alias so the sync still recognizes this row by name.
    const oldTitle = doc.englishTitle || doc.title
    if (values.title && oldTitle && values.title !== oldTitle) {
      doc.alternativeTitles = [...new Set([...(doc.alternativeTitles || []), oldTitle])]
    }

    await query('UPDATE content SET admin_overrides = $2 WHERE id = $1', [
      doc._id,
      JSON.stringify(overrides),
    ])
    // save() re-reads admin_overrides and applies them, including the new values.
    await doc.save()
  })

  return getEditableContent(id)
}

/**
 * @param {object} row - users row.
 * @param {Set<string>} owners - ADMIN_EMAILS.
 * @returns {object}
 */
function adminUserView(row, owners) {
  const user = {
    email: row.email,
    role: row.role === 'admin' ? 'admin' : 'user',
    emailVerified: Boolean(row.email_verified_at),
    isDemo: () => Boolean(row.is_demo),
  }
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    profilePicture: row.profile_picture || null,
    role: user.role,
    isOwner: isOwnerEmail(user, owners),
    isAdmin: isAdminUser(user, owners),
    emailVerified: user.emailVerified,
    isDemo: Boolean(row.is_demo),
    createdAt: row.created_at,
    lastActiveAt: row.last_active_at,
  }
}

/**
 * List accounts, optionally filtered by username/email or to admins only.
 * @param {{ q?: string, admins?: unknown, page?: unknown }} params
 * @returns {Promise<{ items: object[], page: number, pageSize: number, total: number }>}
 */
export async function listUsers({ q, admins, page } = {}) {
  const term = typeof q === 'string' ? q.trim().slice(0, 100) : ''
  const owners = parseAdminEmails()
  const current = pageNumber(page)
  const params = []
  const clauses = ['NOT u.pending_signup']
  if (term) {
    params.push(`%${escapeLike(term)}%`)
    clauses.push(`(u.username ILIKE $${params.length} OR u.email ILIKE $${params.length})`)
  }
  if (admins === 'true' || admins === true) {
    params.push([...owners])
    clauses.push(`(u.role = 'admin' OR lower(u.email) = ANY($${params.length}::text[]))`)
  }
  const where = clauses.join(' AND ')

  const [{ rows }, count] = await Promise.all([
    query(
      `SELECT u.id, u.username, u.email, u.profile_picture, u.role, u.is_demo,
              u.email_verified_at, u.created_at, u.last_active_at
       FROM users u
       WHERE ${where}
       ORDER BY (u.role = 'admin') DESC, lower(u.username)
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
 * Set another user's role. Admins cannot change their own role (so nobody locks
 * themselves out), and ADMIN_EMAILS owners and the demo account cannot be changed.
 * @param {{ _id: string }} actor - The signed-in admin.
 * @param {string} targetId
 * @param {unknown} role
 * @returns {Promise<object>} The updated user view.
 */
export async function setUserRole(actor, targetId, role) {
  if (!ROLES.includes(role)) throw new HttpError(400, `Role must be one of ${ROLES.join(', ')}.`)
  if (!isUuid(String(targetId || ''))) throw new HttpError(400, 'Invalid user id.')
  if (String(actor._id) === String(targetId)) {
    throw new HttpError(400, "You can't change your own role.")
  }

  const owners = parseAdminEmails()
  const { rows } = await query(
    `SELECT id, username, email, is_demo, email_verified_at, pending_signup FROM users WHERE id = $1`,
    [targetId],
  )
  const target = rows[0]
  if (!target || target.pending_signup) throw new HttpError(404, 'User not found.')
  if (target.is_demo) throw new HttpError(400, "The demo account's role can't be changed.")
  if (isOwnerEmail(target, owners)) {
    throw new HttpError(400, 'This account is an owner (ADMIN_EMAILS) and is always an admin.')
  }
  if (role === 'admin' && !target.email_verified_at) {
    throw new HttpError(400, 'Only accounts with a verified email can be admins.')
  }

  const updated = await query(
    `UPDATE users SET role = $2 WHERE id = $1
     RETURNING id, username, email, profile_picture, role, is_demo, email_verified_at,
               created_at, last_active_at`,
    [targetId, role],
  )
  console.log(`Admin ${actor._id} set role of user ${targetId} to ${role}`)
  return adminUserView(updated.rows[0], owners)
}

export default { searchContent, getEditableContent, updateContent, listUsers, setUserRole }
