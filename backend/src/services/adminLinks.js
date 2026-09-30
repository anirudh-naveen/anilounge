/**
 * Admin link editing: which characters are in a title (and in what order and role),
 * who voices them, and which studios made it.
 *
 * Layer: domain service used by `adminService` / `adminController`. Three link types:
 * - appearance (work ↔ character): `admin_locked` rows keep their role/order and are
 *   never deleted by the sync;
 * - voice_credit (work + character ↔ voice actor) and studio_credit (work ↔ studio):
 *   `admin_added` rows are never deleted by the sync.
 * Removed links go into `admin_link_removals` so the sync does not add them back.
 * Every change is written to the admin log.
 */

import { query } from '../../config/postgres.js'
import { isUuid } from '../db/ids.js'
import { appearanceRole, appearanceRoleToApi } from '../db/kinds.js'
import { HttpError } from '../utils/httpError.js'
import { WATCHABLE_KINDS } from '../utils/adminContent.js'
import { describeRow, logAction } from './adminLog.js'

export const LINK_TYPES = ['appearance', 'voice_credit', 'studio_credit']
export const APPEARANCE_ROLES = ['main', 'supporting', 'cameo']
const RELATED_LIMIT = 60

const COLS = 'c.id, c.kind, c.name, c.image_path'
const ROLE_ORDER = `CASE a.role WHEN 'main' THEN 0 WHEN 'supporting' THEN 1 ELSE 2 END`

/**
 * @param {object} row - `{ id, kind, name, image_path }` plus extras.
 * @param {object} [extra]
 * @returns {object} Editor link item.
 */
function item(row, extra = {}) {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    imagePath: row.image_path || null,
    note: null,
    ...extra,
  }
}

/**
 * Linked rows for the editor, grouped, with what an admin can do to each group:
 * `link` on an item means it can be removed; `orderable` / `roleEditable` groups can
 * be reordered / have roles changed; `add` describes how to add to the group.
 * @param {string} id
 * @param {string} kind
 * @returns {Promise<object[]>}
 */
export async function loadManagedLinks(id, kind) {
  const run = async (sql) => (await query(sql, [id])).rows

  if (WATCHABLE_KINDS.includes(kind)) {
    const [characters, voices, studios, related] = await Promise.all([
      run(`SELECT ${COLS}, a.role, a.position FROM appearances a
           JOIN content c ON c.id = a.character_id
           WHERE a.work_id = $1
           ORDER BY a.position NULLS LAST, ${ROLE_ORDER}, a.importance DESC, c.name`),
      run(`SELECT ${COLS}, ch.id AS character_id, ch.name AS character_name,
                  string_agg(DISTINCT vc.language, ', ') AS languages
           FROM appearances a
           JOIN voice_credits vc ON vc.appearance_id = a.id
           JOIN content c ON c.id = vc.voice_id
           JOIN content ch ON ch.id = a.character_id
           WHERE a.work_id = $1
           GROUP BY c.id, ch.id ORDER BY ch.name, c.name`),
      run(`SELECT ${COLS} FROM studio_credits sc JOIN content c ON c.id = sc.studio_id
           WHERE sc.work_id = $1 ORDER BY c.name`),
      run(`SELECT DISTINCT ON (c.id) ${COLS}, r.kind AS note FROM (
             SELECT to_id AS other, kind FROM content_relations WHERE from_id = $1
             UNION ALL
             SELECT fm2.member_id, 'franchise' FROM franchise_members fm
             JOIN franchise_members fm2 ON fm2.franchise_id = fm.franchise_id
             WHERE fm.member_id = $1 AND fm2.member_id <> $1
           ) r JOIN content c ON c.id = r.other
           WHERE c.kind IN ('movie', 'series', 'special')
           ORDER BY c.id LIMIT ${RELATED_LIMIT}`),
    ])
    return [
      {
        key: 'characters',
        label: 'Characters',
        orderable: true,
        roleEditable: true,
        items: characters.map((row) =>
          item(row, {
            role: row.role,
            note: appearanceRoleToApi(row.role),
            link: { type: 'appearance', workId: id, characterId: row.id },
          }),
        ),
        add: {
          search: 'character',
          link: { type: 'appearance', workId: id },
          targetKey: 'characterId',
        },
      },
      {
        key: 'voices',
        label: 'Voice actors',
        items: voices.map((row) =>
          item(row, {
            note: `as ${row.character_name}${row.languages ? ` (${row.languages})` : ''}`,
            link: {
              type: 'voice_credit',
              workId: id,
              characterId: row.character_id,
              voiceId: row.id,
            },
          }),
        ),
        add: {
          search: 'voice',
          link: { type: 'voice_credit', workId: id },
          targetKey: 'voiceId',
          pick: {
            key: 'characterId',
            label: 'as',
            options: characters.map((row) => ({ id: row.id, name: row.name })),
          },
        },
      },
      {
        key: 'studios',
        label: 'Studios',
        items: studios.map((row) =>
          item(row, { link: { type: 'studio_credit', workId: id, studioId: row.id } }),
        ),
        add: {
          search: 'studio',
          link: { type: 'studio_credit', workId: id },
          targetKey: 'studioId',
        },
      },
      {
        key: 'related',
        label: 'Related titles',
        items: related.map((row) => item(row, { note: row.note })),
      },
    ]
  }

  if (kind === 'character') {
    const [works, voices] = await Promise.all([
      run(`SELECT ${COLS}, a.role FROM appearances a JOIN content c ON c.id = a.work_id
           WHERE a.character_id = $1 ORDER BY c.name`),
      run(`SELECT ${COLS}, w.id AS work_id, w.name AS work_name,
                  string_agg(DISTINCT vc.language, ', ') AS languages
           FROM appearances a
           JOIN voice_credits vc ON vc.appearance_id = a.id
           JOIN content c ON c.id = vc.voice_id
           JOIN content w ON w.id = a.work_id
           WHERE a.character_id = $1
           GROUP BY c.id, w.id ORDER BY w.name, c.name`),
    ])
    return [
      {
        key: 'works',
        label: 'Appears in',
        items: works.map((row) =>
          item(row, {
            note: appearanceRoleToApi(row.role),
            link: { type: 'appearance', workId: row.id, characterId: id },
          }),
        ),
        add: { search: 'work', link: { type: 'appearance', characterId: id }, targetKey: 'workId' },
      },
      {
        key: 'voices',
        label: 'Voiced by',
        items: voices.map((row) =>
          item(row, {
            note: `in ${row.work_name}${row.languages ? ` (${row.languages})` : ''}`,
            link: { type: 'voice_credit', workId: row.work_id, characterId: id, voiceId: row.id },
          }),
        ),
        add: {
          search: 'voice',
          link: { type: 'voice_credit', characterId: id },
          targetKey: 'voiceId',
          pick: {
            key: 'workId',
            label: 'in',
            options: works.map((row) => ({ id: row.id, name: row.name })),
          },
        },
      },
    ]
  }

  if (kind === 'voice') {
    const [characters, works] = await Promise.all([
      run(`SELECT ${COLS}, w.id AS work_id, w.name AS work_name FROM voice_credits vc
           JOIN appearances a ON a.id = vc.appearance_id
           JOIN content c ON c.id = a.character_id JOIN content w ON w.id = a.work_id
           WHERE vc.voice_id = $1
           GROUP BY c.id, w.id ORDER BY c.name, w.name`),
      run(`SELECT DISTINCT ${COLS} FROM voice_credits vc
           JOIN appearances a ON a.id = vc.appearance_id JOIN content c ON c.id = a.work_id
           WHERE vc.voice_id = $1 ORDER BY c.name`),
    ])
    return [
      {
        key: 'characters',
        label: 'Characters voiced',
        hint: 'To add a role, open the character or title and add this voice actor there.',
        items: characters.map((row) =>
          item(row, {
            note: `in ${row.work_name}`,
            link: { type: 'voice_credit', workId: row.work_id, characterId: row.id, voiceId: id },
          }),
        ),
      },
      { key: 'works', label: 'Titles', items: works.map((row) => item(row)) },
    ]
  }

  const works = await run(`SELECT ${COLS} FROM studio_credits sc JOIN content c ON c.id = sc.work_id
    WHERE sc.studio_id = $1 ORDER BY c.name`)
  return [
    {
      key: 'works',
      label: 'Titles',
      items: works.map((row) =>
        item(row, { link: { type: 'studio_credit', workId: row.id, studioId: id } }),
      ),
      add: { search: 'work', link: { type: 'studio_credit', studioId: id }, targetKey: 'workId' },
    },
  ]
}

/**
 * Validate a link payload and load the rows it names.
 * @param {object} link - `{ type, workId, characterId?, voiceId?, studioId? }`
 * @returns {Promise<{ type: string, work: object, other: object, voice: object | null }>}
 */
async function resolveLink(link) {
  const type = link?.type
  if (!LINK_TYPES.includes(type)) throw new HttpError(400, 'Unknown link type.')
  const otherId = type === 'studio_credit' ? link.studioId : link.characterId
  const ids = [link.workId, otherId, ...(type === 'voice_credit' ? [link.voiceId] : [])]
  if (!ids.every((value) => isUuid(String(value || '')))) throw new HttpError(400, 'Invalid link.')

  const { rows } = await query('SELECT id, kind, name FROM content WHERE id = ANY($1::uuid[])', [
    ids,
  ])
  const byId = new Map(rows.map((row) => [String(row.id), row]))
  const work = byId.get(String(link.workId))
  const other = byId.get(String(otherId))
  const voice = type === 'voice_credit' ? byId.get(String(link.voiceId)) : null
  const expected = type === 'studio_credit' ? 'studio' : 'character'
  if (!work || !WATCHABLE_KINDS.includes(work.kind))
    throw new HttpError(400, 'Pick a movie, series, or special.')
  if (!other || other.kind !== expected) throw new HttpError(400, `Pick a ${expected}.`)
  if (type === 'voice_credit' && (!voice || voice.kind !== 'voice')) {
    throw new HttpError(400, 'Pick a voice actor.')
  }
  return { type, work, other, voice }
}

/**
 * @param {{ type: string, work: object, other: object, voice: object | null }} resolved
 * @param {string} [joiner] - 'to' / 'from' / 'in'.
 * @returns {string} e.g. `character "Fern" to series "Frieren"`.
 */
function describeLink({ type, work, other, voice }, joiner = 'in') {
  const where = describeRow(work.kind, work.name)
  if (type === 'voice_credit') {
    return `${describeRow('voice', voice.name)} (as ${describeRow('character', other.name)}) ${joiner} ${where}`
  }
  return `${describeRow(other.kind, other.name)} ${joiner} ${where}`
}

/**
 * Forget a removal so the link can exist again.
 * @param {string} kind
 * @param {string} workId
 * @param {string} otherId
 * @param {string | null} voiceId
 * @returns {Promise<void>}
 */
async function forgetRemoval(kind, workId, otherId, voiceId = null) {
  await query(
    `DELETE FROM admin_link_removals
     WHERE link_kind = $1 AND work_id = $2 AND other_id = $3
       AND voice_id IS NOT DISTINCT FROM $4::uuid`,
    [kind, workId, otherId, voiceId],
  )
}

/**
 * Add a link (idempotent) and protect it from the sync.
 * @param {object} actor - `req.user`.
 * @param {object} link - `{ type, workId, characterId?, voiceId?, studioId?, role? }`
 * @returns {Promise<void>}
 */
export async function addLink(actor, link) {
  const resolved = await resolveLink(link)
  const { type, work, other, voice } = resolved

  if (type === 'appearance') {
    const role = APPEARANCE_ROLES.includes(link.role) ? link.role : 'supporting'
    await query('INSERT INTO characters (content_id) VALUES ($1) ON CONFLICT DO NOTHING', [
      other.id,
    ])
    // New characters go to the end of an admin-ordered cast; otherwise the sync order holds.
    await query(
      `INSERT INTO appearances (id, work_id, character_id, role, importance, admin_locked, position)
       SELECT gen_random_uuid(), $1, $2, $3, 0, true,
              (SELECT max(position) + 1 FROM appearances WHERE work_id = $1)
       ON CONFLICT (work_id, character_id) DO UPDATE SET admin_locked = true`,
      [work.id, other.id, appearanceRole(role)],
    )
    await forgetRemoval('appearance', work.id, other.id)
  } else if (type === 'voice_credit') {
    const { rows } = await query(
      'SELECT id FROM appearances WHERE work_id = $1 AND character_id = $2',
      [work.id, other.id],
    )
    if (!rows[0]) {
      throw new HttpError(400, `Add ${other.name} to ${work.name} before adding a voice actor.`)
    }
    await query('INSERT INTO voices (content_id) VALUES ($1) ON CONFLICT DO NOTHING', [voice.id])
    await query(
      `INSERT INTO voice_credits (appearance_id, voice_id, language, admin_added)
       SELECT $1, $2, NULL, true
       WHERE NOT EXISTS (SELECT 1 FROM voice_credits WHERE appearance_id = $1 AND voice_id = $2)`,
      [rows[0].id, voice.id],
    )
    await query(
      'UPDATE voice_credits SET admin_added = true WHERE appearance_id = $1 AND voice_id = $2',
      [rows[0].id, voice.id],
    )
    await forgetRemoval('voice_credit', work.id, other.id, voice.id)
  } else {
    await query('INSERT INTO studios (content_id) VALUES ($1) ON CONFLICT DO NOTHING', [other.id])
    await query(
      `INSERT INTO studio_credits (work_id, studio_id, admin_added) VALUES ($1, $2, true)
       ON CONFLICT (work_id, studio_id) DO UPDATE SET admin_added = true`,
      [work.id, other.id],
    )
    await forgetRemoval('studio_credit', work.id, other.id)
  }
  await logAction('content', actor, `Added ${describeLink(resolved, 'to')}`)
}

/**
 * Remove a link and keep the sync from adding it back. Removing a character from a
 * title also removes its voice credits there.
 * @param {object} actor - `req.user`.
 * @param {object} link
 * @returns {Promise<void>}
 */
export async function removeLink(actor, link) {
  const resolved = await resolveLink(link)
  const { type, work, other, voice } = resolved

  if (type === 'appearance') {
    await query('DELETE FROM appearances WHERE work_id = $1 AND character_id = $2', [
      work.id,
      other.id,
    ])
  } else if (type === 'voice_credit') {
    await query(
      `DELETE FROM voice_credits vc USING appearances a
       WHERE vc.appearance_id = a.id AND a.work_id = $1 AND a.character_id = $2 AND vc.voice_id = $3`,
      [work.id, other.id, voice.id],
    )
  } else {
    await query('DELETE FROM studio_credits WHERE work_id = $1 AND studio_id = $2', [
      work.id,
      other.id,
    ])
  }
  await query(
    `INSERT INTO admin_link_removals (link_kind, work_id, other_id, voice_id)
     VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
    [type, work.id, other.id, voice?.id || null],
  )
  await logAction('content', actor, `Removed ${describeLink(resolved, 'from')}`)
}

/**
 * Set a title's cast order. `characterIds` must be exactly the title's characters.
 * @param {object} actor - `req.user`.
 * @param {string} workId
 * @param {unknown} characterIds
 * @returns {Promise<void>}
 */
export async function reorderCast(actor, workId, characterIds) {
  if (!isUuid(String(workId || ''))) throw new HttpError(400, 'Invalid title.')
  const order = Array.isArray(characterIds) ? characterIds.map(String) : []
  const { rows } = await query(
    `SELECT a.character_id::text AS id, w.kind, w.name
     FROM appearances a JOIN content w ON w.id = a.work_id WHERE a.work_id = $1`,
    [workId],
  )
  const current = new Set(rows.map((row) => row.id))
  if (
    order.length !== current.size ||
    new Set(order).size !== order.length ||
    !order.every((id) => current.has(id))
  ) {
    throw new HttpError(400, 'The cast changed; reload and try again.')
  }
  await query(
    `UPDATE appearances a SET position = t.pos::int, admin_locked = true
     FROM unnest($2::uuid[]) WITH ORDINALITY AS t(character_id, pos)
     WHERE a.work_id = $1 AND a.character_id = t.character_id`,
    [workId, order],
  )
  await logAction(
    'content',
    actor,
    `Reordered the cast of ${describeRow(rows[0].kind, rows[0].name)}`,
  )
}

/**
 * Change a character's role (Main / Supporting / Cameo) in a title.
 * @param {object} actor - `req.user`.
 * @param {{ workId?: string, characterId?: string, role?: string }} body
 * @returns {Promise<void>}
 */
export async function setAppearanceRole(actor, { workId, characterId, role } = {}) {
  if (!APPEARANCE_ROLES.includes(role))
    throw new HttpError(400, 'Role must be main, supporting, or cameo.')
  const resolved = await resolveLink({ type: 'appearance', workId, characterId })
  const result = await query(
    `UPDATE appearances SET role = $3, admin_locked = true WHERE work_id = $1 AND character_id = $2`,
    [workId, characterId, role],
  )
  if (!result.rowCount) throw new HttpError(404, 'That character is not in this title.')
  await logAction('content', actor, `Set ${describeLink(resolved)} to ${appearanceRoleToApi(role)}`)
}

export default { loadManagedLinks, addLink, removeLink, reorderCast, setAppearanceRole }
