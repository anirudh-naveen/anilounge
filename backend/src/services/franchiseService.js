/**
 * Franchise detail page: the franchise row with every member title in watch order,
 * series listed season by season, plus everyone in and behind them. Admins can set
 * the watch order by hand and add titles from the page.
 */
import { query, withTransaction } from '../../config/postgres.js'
import { isUuid } from '../db/ids.js'
import { HttpError } from '../utils/httpError.js'
import { WATCHABLE_KINDS } from '../utils/adminContent.js'
import { describeRow, logAction } from './adminLog.js'
import { loadWorksById } from '../models/Content.js'
import { watchOrder } from '../utils/franchiseOrder.js'
import { characterPortraitPath } from '../utils/entities.js'

/**
 * @param {string} id - Franchise content id.
 * @returns {Promise<object|null>} `{ _id, name, nicknames, about, imagePath, rating, works,
 *   customOrder, characters, staff }`, `works` in watch order (the admin's, when set);
 *   null when no franchise has this id.
 */
export async function getFranchise(id) {
  const { rows } = await query(
    `SELECT c.id, c.name, c.about, c.image_path, f.watch_order::text[] AS watch_order,
            (SELECT array_agg(k.name ORDER BY k.name) FROM content_akas k
             WHERE k.content_id = c.id) AS nicknames
     FROM franchises f JOIN content c ON c.id = f.content_id
     WHERE f.content_id = $1`,
    [id],
  )
  const franchise = rows[0]
  if (!franchise) return null

  // A series with seasons is watched season by season (its relations to the
  // franchise's movies are its seasons'), so its seasons stand in for it.
  const members = await query(
    `SELECT COALESCE(sn.content_id, fm.member_id)::text AS member_id,
            fm.member_id::text AS own_id
     FROM franchise_members fm
     LEFT JOIN seasons sn ON sn.series_id = fm.member_id
     WHERE fm.franchise_id = $1`,
    [id],
  )
  const memberIds = members.rows.map((row) => row.member_id)
  // Credits sit on a series row as well as on its seasons.
  const creditIds = [...new Set(members.rows.flatMap((row) => [row.member_id, row.own_id]))]
  const worksById = await loadWorksById(memberIds)
  const works = [...worksById.values()]
  const edges = memberIds.length
    ? (
        await query(
          `SELECT from_id, to_id, kind FROM content_relations
           WHERE from_id = ANY($1::uuid[]) AND to_id = ANY($1::uuid[])
             AND kind IN ('sequel', 'prequel')`,
          [memberIds],
        )
      ).rows
    : []
  const [characters, staff] = await Promise.all([
    franchiseCharacters(creditIds),
    franchiseStaff(creditIds),
  ])

  return {
    _id: String(franchise.id),
    name: franchise.name,
    nicknames: franchise.nicknames || [],
    about: franchise.about || '',
    imagePath: franchise.image_path || '',
    rating: works[0]?.franchiseRating ?? null,
    works: withAdminOrder(watchOrder(works, edges), franchise.watch_order),
    customOrder: Boolean(franchise.watch_order?.length),
    characters,
    staff,
  }
}

/**
 * Every character in the franchise's titles: main characters first, then by how
 * many titles they appear in.
 * @param {string[]} workIds
 * @returns {Promise<Array<{ _id: string, name: string, imagePath: string, role: string }>>}
 */
async function franchiseCharacters(workIds) {
  if (!workIds.length) return []
  const { rows } = await query(
    `SELECT c.id::text AS id, c.name, c.image_path,
            min(CASE a.role WHEN 'main' THEN 0 WHEN 'supporting' THEN 1 ELSE 2 END) AS rank,
            count(DISTINCT a.work_id)::int AS works, max(a.importance) AS importance
     FROM appearances a JOIN content c ON c.id = a.character_id
     WHERE a.work_id = ANY($1::uuid[])
     GROUP BY c.id, c.name, c.image_path
     ORDER BY rank, works DESC, importance DESC, c.name`,
    [workIds],
  )
  return rows.map((row) => ({
    _id: row.id,
    name: row.name,
    imagePath: characterPortraitPath(row.image_path),
    role: ['Main', 'Supporting', 'Cameo'][row.rank] || '',
  }))
}

/**
 * Everyone who worked on the franchise's titles, key staff first (by credit
 * order), then episode staff by how many episodes they worked on; one row per
 * person with each of their roles.
 * @param {string[]} workIds
 * @returns {Promise<Array<{ _id: string, name: string, imagePath: string, roles: string[] }>>}
 */
async function franchiseStaff(workIds) {
  if (!workIds.length) return []
  const { rows } = await query(
    `WITH credits AS (
       SELECT sc.person_id, sc.role, sc.position, 0 AS episodes
       FROM staff_credits sc WHERE sc.work_id = ANY($1::uuid[])
       UNION ALL
       SELECT ec.person_id, ec.role, 1000, count(DISTINCT ec.episode_id)::int
       FROM episode_credits ec JOIN episodes e ON e.id = ec.episode_id
       WHERE e.season_id = ANY($1::uuid[])
       GROUP BY ec.person_id, ec.role
     ), roles AS (
       SELECT person_id, role, min(position) AS position, sum(episodes)::int AS episodes
       FROM credits GROUP BY person_id, role
     )
     SELECT p.id::text AS id, p.name, p.image_path,
            json_agg(json_build_object('role', r.role, 'episodes', r.episodes)
                     ORDER BY r.position, r.episodes DESC, r.role) AS roles
     FROM roles r JOIN content p ON p.id = r.person_id
     GROUP BY p.id, p.name, p.image_path
     ORDER BY min(r.position), max(r.episodes) DESC, p.name`,
    [workIds],
  )
  return rows.map((row) => ({
    _id: row.id,
    name: row.name,
    imagePath: row.image_path || '',
    // "Episode Director (4 episodes)" for episode credits, the role alone otherwise.
    roles: row.roles.map(({ role, episodes }) =>
      episodes ? `${role} (${episodes} episode${episodes === 1 ? '' : 's'})` : role,
    ),
  }))
}

/**
 * Titles the admin placed come first in their order; titles added since keep their
 * computed order after them.
 * @param {object[]} works - In computed watch order.
 * @param {string[] | null} order - Admin watch order (work ids).
 * @returns {object[]}
 */
export function withAdminOrder(works, order) {
  if (!order?.length) return works
  const rank = new Map(order.map((id, index) => [String(id), index]))
  const placed = works.filter((work) => rank.has(String(work._id)))
  placed.sort((left, right) => rank.get(String(left._id)) - rank.get(String(right._id)))
  return [...placed, ...works.filter((work) => !rank.has(String(work._id)))]
}

/**
 * @param {string} id
 * @returns {Promise<string>} The franchise's name.
 */
async function franchiseName(id) {
  if (!isUuid(String(id || ''))) throw new HttpError(400, 'Invalid franchise.')
  const { rows } = await query(
    `SELECT c.name FROM franchises f JOIN content c ON c.id = f.content_id
     WHERE f.content_id = $1`,
    [id],
  )
  if (!rows[0]) throw new HttpError(404, 'Franchise not found.')
  return rows[0].name
}

/**
 * Set a franchise's watch order for everyone, or clear it back to the computed order.
 * @param {object} actor - `req.user`.
 * @param {string} id - Franchise id.
 * @param {unknown} workIds - Every title on the page, in the new order; empty resets.
 * @returns {Promise<void>}
 */
export async function setFranchiseWatchOrder(actor, id, workIds) {
  const name = await franchiseName(id)
  const order = Array.isArray(workIds) ? workIds.map(String) : []
  if (!order.length) {
    await query('UPDATE franchises SET watch_order = NULL WHERE content_id = $1', [id])
    await logAction('content', actor, `Reset the watch order of ${describeRow('franchise', name)}`)
    return
  }
  const current = new Set((await getFranchise(id)).works.map((work) => String(work._id)))
  if (
    order.length !== current.size ||
    new Set(order).size !== order.length ||
    !order.every((workId) => current.has(workId))
  ) {
    throw new HttpError(400, 'The titles changed; reload and try again.')
  }
  await query('UPDATE franchises SET watch_order = $2::uuid[] WHERE content_id = $1', [id, order])
  await logAction(
    'content',
    actor,
    `Reordered the watch order of ${describeRow('franchise', name)}`,
  )
}

/**
 * Add a movie, series, or special to a franchise (a season adds its series). A title
 * in another franchise moves here; with a custom watch order, it goes at the end.
 * @param {object} actor - `req.user`.
 * @param {string} id - Franchise id.
 * @param {string} workId
 * @returns {Promise<void>}
 */
export async function addFranchiseWork(actor, id, workId) {
  const name = await franchiseName(id)
  if (!isUuid(String(workId || ''))) throw new HttpError(400, 'Invalid title.')
  const { rows } = await query(
    `SELECT COALESCE(sn.series_id, c.id)::text AS id, w.kind, w.name
     FROM content c
     LEFT JOIN seasons sn ON sn.content_id = c.id
     JOIN content w ON w.id = COALESCE(sn.series_id, c.id)
     WHERE c.id = $1`,
    [workId],
  )
  const work = rows[0]
  if (!work || !WATCHABLE_KINDS.includes(work.kind)) throw new HttpError(400, 'Not a title.')
  await withTransaction(async () => {
    await query('DELETE FROM franchise_members WHERE member_id = $1', [work.id])
    await query('INSERT INTO franchise_members (franchise_id, member_id) VALUES ($1, $2)', [
      id,
      work.id,
    ])
  })
  await logAction(
    'content',
    actor,
    `Added ${describeRow(work.kind, work.name)} to ${describeRow('franchise', name)}`,
  )
}
