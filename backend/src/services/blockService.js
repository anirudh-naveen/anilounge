/**
 * Blocking other users.
 *
 * Layer: service. A `user_blocks` row runs from the blocker to the blocked user.
 * Blocking ends any friendship or open request between the two (so direct messages,
 * which need a friendship, stop too). Afterwards neither can send the other a friend
 * request, they don't find each other in user search, and neither's actions notify the
 * other. The blocker no longer sees the blocked user's forum posts, and their comments
 * show as hidden. The blocked user is not told. Throws `HttpError` for user-facing failures.
 */

import { query, withTransaction } from '../../config/postgres.js'
import { isUuid } from '../db/ids.js'
import { HttpError } from '../utils/httpError.js'

/**
 * SQL that is true when the viewer (a `$n::uuid` parameter, possibly null) has
 * blocked the author in `authorColumn`.
 * @param {string} viewerParam - e.g. `'$1'`.
 * @param {string} authorColumn - e.g. `'p.user_id'`.
 * @returns {string}
 */
export function blockedByViewerSql(viewerParam, authorColumn) {
  return `EXISTS (SELECT 1 FROM user_blocks ub
    WHERE ub.blocker_id = ${viewerParam}::uuid AND ub.blocked_id = ${authorColumn})`
}

/**
 * SQL that is true when either user (columns or parameters) has blocked the other.
 * @param {string} a
 * @param {string} b
 * @returns {string}
 */
export function blockedEitherWaySql(a, b) {
  return `EXISTS (SELECT 1 FROM user_blocks ub
    WHERE (ub.blocker_id = ${a} AND ub.blocked_id = ${b})
       OR (ub.blocker_id = ${b} AND ub.blocked_id = ${a}))`
}

/**
 * Whether either user has blocked the other.
 * @param {string} a
 * @param {string} b
 * @returns {Promise<boolean>}
 */
export async function isBlockedEitherWay(a, b) {
  if (!a || !b) return false
  const { rows } = await query(`SELECT ${blockedEitherWaySql('$1::uuid', '$2::uuid')} AS blocked`, [
    a,
    b,
  ])
  return Boolean(rows[0]?.blocked)
}

/**
 * Whether `blockerId` has blocked `blockedId`.
 * @param {string} blockerId
 * @param {string} blockedId
 * @returns {Promise<boolean>}
 */
export async function hasBlocked(blockerId, blockedId) {
  if (!blockerId || !blockedId) return false
  const { rows } = await query(
    'SELECT 1 FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2',
    [blockerId, blockedId],
  )
  return rows.length > 0
}

/**
 * Block a user: record it, end any friendship or request between the two, mark their
 * messages to the blocker read, and drop unread notifications between them.
 *
 * @param {string} blockerId
 * @param {string} blockedId
 * @returns {Promise<{ id: string, username: string }>} The blocked user.
 * @throws {HttpError} 400 self, 404 unknown user.
 */
export async function blockUser(blockerId, blockedId) {
  if (String(blockerId) === String(blockedId)) {
    throw new HttpError(400, "You can't block yourself.")
  }
  if (!isUuid(blockedId)) throw new HttpError(404, 'User not found.')
  const { rows } = await query(
    'SELECT id, username FROM users WHERE id = $1 AND NOT pending_signup',
    [blockedId],
  )
  if (!rows[0]) throw new HttpError(404, 'User not found.')

  await withTransaction(async () => {
    await query(
      `INSERT INTO user_blocks (blocker_id, blocked_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [blockerId, blockedId],
    )
    await query(
      `DELETE FROM friendships
       WHERE (follower_id = $1 AND followee_id = $2) OR (follower_id = $2 AND followee_id = $1)`,
      [blockerId, blockedId],
    )
    // Their unread messages would otherwise badge the inbox with no way to open them.
    await query(
      `UPDATE messages SET read_at = now()
       WHERE sender_id = $2 AND recipient_id = $1 AND read_at IS NULL`,
      [blockerId, blockedId],
    )
    await query(
      `DELETE FROM notifications
       WHERE read_at IS NULL
         AND ((user_id = $1 AND actor_id = $2) OR (user_id = $2 AND actor_id = $1))`,
      [blockerId, blockedId],
    )
  })
  return { id: String(rows[0].id), username: rows[0].username }
}

/**
 * Unblock a user. Unblocking someone who isn't blocked is not an error.
 * @param {string} blockerId
 * @param {string} blockedId
 * @returns {Promise<void>}
 */
export async function unblockUser(blockerId, blockedId) {
  if (!isUuid(blockedId)) throw new HttpError(404, 'User not found.')
  await query('DELETE FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2', [
    blockerId,
    blockedId,
  ])
}

/**
 * Users `userId` has blocked, newest first.
 * @param {string} userId
 * @returns {Promise<Array<{ id: string, username: string, profilePicture: string | null, blockedAt: Date }>>}
 */
export async function listBlocked(userId) {
  const { rows } = await query(
    `SELECT u.id, u.username, u.profile_picture, ub.created_at
     FROM user_blocks ub JOIN users u ON u.id = ub.blocked_id
     WHERE ub.blocker_id = $1
     ORDER BY ub.created_at DESC`,
    [userId],
  )
  return rows.map((row) => ({
    id: String(row.id),
    username: row.username,
    profilePicture: row.profile_picture || null,
    blockedAt: row.created_at,
  }))
}

export default {
  blockUser,
  unblockUser,
  listBlocked,
  hasBlocked,
  isBlockedEitherWay,
}
