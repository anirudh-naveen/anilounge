/**
 * In-site notifications for the profile-menu inbox.
 *
 * Layer: service. Social actions (friend requests, comments, replies) and language
 * warnings call `notify`;
 * it never throws, so a failed notification cannot undo the action that caused it.
 */

import { query } from '../../config/postgres.js'

export const NOTIFICATION_KINDS = [
  'friend_request',
  'friend_accepted',
  'post_comment',
  'comment_reply',
  'language_warning',
]

/**
 * Record a notification for `userId`. Self-notifications are skipped.
 *
 * @param {string} userId - Recipient.
 * @param {string} kind - One of NOTIFICATION_KINDS.
 * @param {{ actorId?: string, postId?: string, commentId?: string, detail?: object }} [refs]
 *   `detail` holds kind-specific fields (stored as JSON).
 * @returns {Promise<void>}
 */
export async function notify(
  userId,
  kind,
  { actorId = null, postId = null, commentId = null, detail = null } = {},
) {
  if (!userId || (actorId && String(actorId) === String(userId))) return
  try {
    await query(
      `INSERT INTO notifications (user_id, kind, actor_id, post_id, comment_id, detail)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, kind, actorId, postId, commentId, detail ? JSON.stringify(detail) : null],
    )
  } catch (error) {
    console.error(`Notification (${kind}) failed:`, error.message)
  }
}
