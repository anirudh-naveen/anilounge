/**
 * Favorites: a ranked top 10 per category (titles, characters, voice actors, studios).
 *
 * Layer: service. Rows live in `favorites`; `position` ranks them per user (one
 * sequence across categories, so reordering one category reuses its own slots). New
 * favorites go to the end of their category. Rows without a position (older rows,
 * catalog merges) sort after ranked ones, newest first.
 */
import { query, withTransaction } from '../../config/postgres.js'
import { WATCHABLE_KINDS } from '../db/kinds.js'
import { isUuid } from '../db/ids.js'
import { HttpError } from '../utils/httpError.js'

export const FAVORITES_MAX = 10

/** `ORDER BY` for favorites as `f`: the owner's ranking. */
export const FAVORITE_ORDER_SQL = 'f.position ASC NULLS LAST, f.added_at DESC'

const CATEGORY_LABELS = {
  title: 'titles',
  character: 'characters',
  voice: 'voice actors',
  studio: 'studios',
}

/**
 * Category a content kind is ranked in: every watchable kind counts as a title.
 * @param {string} kind - `content.kind`.
 * @returns {string}
 */
export function favoriteCategory(kind) {
  return WATCHABLE_KINDS.includes(kind) ? 'title' : kind
}

/**
 * Content kinds sharing a category.
 * @param {string} category
 * @returns {string[]}
 */
function categoryKinds(category) {
  return category === 'title' ? WATCHABLE_KINDS : [category]
}

/**
 * Favorite a content row, last in its category. A no-op when it is already a favorite.
 * @param {string} userId
 * @param {string} contentId
 * @param {string} kind - The row's `content.kind`.
 * @returns {Promise<boolean>} Whether a row was added.
 * @throws {HttpError} 409 when the category already holds FAVORITES_MAX.
 */
export async function addFavorite(userId, contentId, kind) {
  const category = favoriteCategory(kind)
  const { rowCount } = await query(
    `INSERT INTO favorites (user_id, content_id, position)
     SELECT $1, $2, COALESCE((SELECT max(position) FROM favorites WHERE user_id = $1), 0) + 1
     WHERE (
       SELECT count(*) FROM favorites f JOIN content c ON c.id = f.content_id
       WHERE f.user_id = $1 AND c.kind = ANY($3::text[])
     ) < ${FAVORITES_MAX}
     ON CONFLICT (user_id, content_id) DO NOTHING`,
    [userId, contentId, categoryKinds(category)],
  )
  if (rowCount) return true
  const { rows } = await query('SELECT 1 FROM favorites WHERE user_id = $1 AND content_id = $2', [
    userId,
    contentId,
  ])
  if (rows.length) return false
  throw new HttpError(
    409,
    `Your top ${FAVORITES_MAX} ${CATEGORY_LABELS[category]} is full. Remove one from your profile first.`,
    'favorites_full',
  )
}

/**
 * Rank one category of the user's favorites. `ids` must be exactly that category's
 * favorites, in the new order.
 * @param {string} userId
 * @param {unknown} ids
 * @returns {Promise<string[]>} The ids in their saved order.
 * @throws {HttpError} 400 for a list that isn't one whole category.
 */
export async function reorderFavorites(userId, ids) {
  if (!Array.isArray(ids) || !ids.length || !ids.every((id) => isUuid(id))) {
    throw new HttpError(400, 'Send the favorites to reorder.')
  }
  const order = ids.map(String)
  if (new Set(order).size !== order.length) throw new HttpError(400, 'Each favorite once, please.')

  return withTransaction(async () => {
    const { rows } = await query(
      `SELECT f.content_id, f.position, c.kind FROM favorites f
       JOIN content c ON c.id = f.content_id
       WHERE f.user_id = $1
       ORDER BY ${FAVORITE_ORDER_SQL}
       FOR UPDATE OF f`,
      [userId],
    )
    const byId = new Map(rows.map((row) => [String(row.content_id), row]))
    const first = byId.get(order[0])
    const category = first && favoriteCategory(first.kind)
    const inCategory = rows.filter((row) => favoriteCategory(row.kind) === category)
    const matches =
      category &&
      inCategory.length === order.length &&
      order.every((id) => byId.has(id) && favoriteCategory(byId.get(id).kind) === category)
    if (!matches) throw new HttpError(400, 'Those favorites changed. Refresh and try again.')

    // Reuse the category's own slots (ranked first), so other categories keep theirs.
    const max = rows.reduce((top, row) => Math.max(top, row.position || 0), 0)
    let next = max
    const slots = inCategory.map((row) => row.position ?? ++next)
    slots.sort((a, b) => a - b)
    await query(
      `UPDATE favorites f SET position = o.position
       FROM unnest($2::uuid[], $3::int[]) AS o(content_id, position)
       WHERE f.user_id = $1 AND f.content_id = o.content_id`,
      [userId, order, slots],
    )
    return order
  })
}

export default { addFavorite, reorderFavorites, favoriteCategory, FAVORITES_MAX }
