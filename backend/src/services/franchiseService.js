/**
 * Franchise detail page: the franchise row with every member title in watch order.
 */
import { query } from '../../config/postgres.js'
import { loadWorksById } from '../models/Content.js'
import { watchOrder } from '../utils/franchiseOrder.js'

/**
 * @param {string} id - Franchise content id.
 * @returns {Promise<object|null>} `{ _id, name, nicknames, about, imagePath, rating, works }`,
 *   `works` in watch order; null when no franchise has this id.
 */
export async function getFranchise(id) {
  const { rows } = await query(
    `SELECT c.id, c.name, c.about, c.image_path,
            (SELECT array_agg(k.name ORDER BY k.name) FROM content_akas k
             WHERE k.content_id = c.id) AS nicknames
     FROM franchises f JOIN content c ON c.id = f.content_id
     WHERE f.content_id = $1`,
    [id],
  )
  const franchise = rows[0]
  if (!franchise) return null

  const members = await query('SELECT member_id FROM franchise_members WHERE franchise_id = $1', [
    id,
  ])
  const memberIds = members.rows.map((row) => String(row.member_id))
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

  return {
    _id: String(franchise.id),
    name: franchise.name,
    nicknames: franchise.nicknames || [],
    about: franchise.about || '',
    imagePath: franchise.image_path || '',
    rating: works[0]?.franchiseRating ?? null,
    works: watchOrder(works, edges),
  }
}
