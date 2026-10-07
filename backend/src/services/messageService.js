/**
 * Direct messages between friends, plus the friend requests shown beside them.
 *
 * Layer: service. A `messages` row runs from `sender_id` to `recipient_id`; a
 * conversation is every row between two users. Only friends can send, but history
 * stays readable after an unfriend. Opening a thread marks the other user's messages
 * as read. Pending friend requests appear in the Messages tab so a request's note
 * reads like an opening message; accepting turns that note into the first message
 * (see `friendService.acceptFriendRequest`). Throws `HttpError` for user-facing failures.
 *
 * Blocked language is masked, not rejected: the message goes out with those words
 * starred (`f***`) and the sender gets a language warning (see
 * `languageWarningService.js`). Text the mask can't fully clean is refused, and still
 * counts as a warning. When both people turned on Settings → Communication → Allow
 * profanity, curses pass unmasked between them; slurs are always masked and warned.
 */

import { query } from '../../config/postgres.js'
import { isUuid } from '../db/ids.js'
import { HttpError } from '../utils/httpError.js'
import { cleanUserText } from '../utils/userText.js'
import {
  liveLinkSql,
  listFriends,
  publicUser,
  relationshipBetween,
  requestExpiresAt,
} from './friendService.js'
import { maskLanguage, screenText } from './languageWarningService.js'

export { maskLanguage }

export const MESSAGE_MAX = 2000
export const THREAD_PAGE_SIZE = 50
const CONVERSATION_LIMIT = 100
/** Per-sender burst limit: at most SEND_BURST_MAX messages in SEND_BURST_SECONDS. */
export const SEND_BURST_MAX = 20
export const SEND_BURST_SECONDS = 60

/**
 * SQL condition for rows between `$a` and `$b` in either direction. Matches the
 * `messages_pair_idx` expression index.
 * @param {string} a - Placeholder, e.g. `$1`.
 * @param {string} b - Placeholder, e.g. `$2`.
 * @returns {string}
 */
export function pairSql(a, b) {
  return `LEAST(sender_id, recipient_id) = LEAST(${a}::uuid, ${b}::uuid)
      AND GREATEST(sender_id, recipient_id) = GREATEST(${a}::uuid, ${b}::uuid)`
}

/**
 * Client shape for a message row, from the viewer's side.
 * @param {{ id: string, sender_id: string, body: string, created_at: Date, read_at: Date | null }} row
 * @param {string} viewerId
 * @returns {{ id: string, body: string, at: Date, fromMe: boolean, readAt: Date | null }}
 */
export function messageEntry(row, viewerId) {
  return {
    id: String(row.id),
    body: row.body,
    at: row.created_at,
    fromMe: String(row.sender_id) === String(viewerId),
    readAt: row.read_at || null,
  }
}

/**
 * Validate and clean a message body. Language is checked separately (`screenText`).
 * @param {unknown} value
 * @returns {string}
 * @throws {HttpError} 400 when empty or too long.
 */
export function cleanMessageBody(value) {
  const body = cleanUserText(value)
  if (!body) throw new HttpError(400, "Messages can't be empty.")
  if (body.length > MESSAGE_MAX) {
    throw new HttpError(400, `Messages must be ${MESSAGE_MAX} characters or fewer.`)
  }
  return body
}

/**
 * Whether both users turned on Allow profanity.
 * @param {string} a
 * @param {string} b
 * @returns {Promise<boolean>}
 */
export async function bothAllowProfanity(a, b) {
  const { rows } = await query(
    `SELECT count(*)::int AS count FROM users WHERE id = ANY($1::uuid[]) AND allow_profanity`,
    [[a, b]],
  )
  return rows[0]?.count === 2
}

/**
 * Settings → Communication for the signed-in user.
 * @param {string} userId
 * @returns {Promise<{ allowProfanity: boolean }>}
 */
export async function getCommunicationSettings(userId) {
  const { rows } = await query('SELECT allow_profanity FROM users WHERE id = $1', [userId])
  return { allowProfanity: Boolean(rows[0]?.allow_profanity) }
}

/**
 * Save Settings → Communication.
 * @param {string} userId
 * @param {{ allowProfanity?: unknown }} changes
 * @returns {Promise<{ allowProfanity: boolean }>}
 * @throws {HttpError} 400 when `allowProfanity` is not a boolean.
 */
export async function setCommunicationSettings(userId, { allowProfanity } = {}) {
  if (typeof allowProfanity !== 'boolean') {
    throw new HttpError(400, 'allowProfanity must be true or false.')
  }
  await query('UPDATE users SET allow_profanity = $2 WHERE id = $1', [userId, allowProfanity])
  return { allowProfanity }
}

/**
 * Load another user who can appear in a conversation.
 * @param {string} userId
 * @returns {Promise<{ id: string, username: string, profile_picture: string | null }>}
 * @throws {HttpError} 404 when missing.
 */
async function loadUser(userId) {
  if (!isUuid(userId)) throw new HttpError(404, 'User not found.')
  const { rows } = await query(
    `SELECT id, username, profile_picture FROM users WHERE id = $1 AND NOT pending_signup`,
    [userId],
  )
  if (!rows[0]) throw new HttpError(404, 'User not found.')
  return rows[0]
}

/**
 * Conversations (newest first) and incoming friend requests for the Messages tab.
 *
 * @param {string} userId
 * @returns {Promise<{ conversations: object[], requests: object[] }>}
 */
export async function listConversations(userId) {
  const { rows } = await query(
    `WITH mine AS (
       SELECT id, sender_id, body, created_at,
              CASE WHEN sender_id = $1 THEN recipient_id ELSE sender_id END AS other_id
       FROM messages
       WHERE sender_id = $1 OR recipient_id = $1
     ),
     latest AS (
       SELECT DISTINCT ON (other_id) * FROM mine ORDER BY other_id, created_at DESC
     ),
     unread AS (
       SELECT sender_id AS other_id, count(*)::int AS unread
       FROM messages WHERE recipient_id = $1 AND read_at IS NULL
       GROUP BY sender_id
     )
     SELECT l.sender_id, l.body, l.created_at,
            u.id, u.username, u.profile_picture,
            COALESCE(un.unread, 0) AS unread,
            EXISTS (
              SELECT 1 FROM friendships f
              WHERE f.status = 'accepted'
                AND ((f.follower_id = $1 AND f.followee_id = l.other_id)
                  OR (f.follower_id = l.other_id AND f.followee_id = $1))
            ) AS can_message
     FROM latest l
     JOIN users u ON u.id = l.other_id
     LEFT JOIN unread un ON un.other_id = l.other_id
     ORDER BY l.created_at DESC
     LIMIT ${CONVERSATION_LIMIT}`,
    [userId],
  )
  const { incoming } = await listFriends(userId)
  return {
    conversations: rows.map((row) => ({
      user: publicUser(row),
      lastMessage: {
        body: row.body,
        at: row.created_at,
        fromMe: String(row.sender_id) === String(userId),
      },
      unread: row.unread,
      canMessage: row.can_message,
    })),
    requests: incoming,
  }
}

/**
 * Messages between the viewer and `otherId`, oldest first, a page at a time. Without
 * a cursor this is the newest page; `before` pages back and `after` fetches anything
 * newer (for polling). Marks the other user's messages to the viewer as read.
 *
 * @param {string} userId
 * @param {string} otherId
 * @param {{ before?: unknown, after?: unknown }} [cursor] - Message ids.
 * @returns {Promise<{ user: object, relationship: string, canMessage: boolean, request: object | null, messages: object[], hasMore: boolean }>}
 * @throws {HttpError} 400 bad cursor or self, 404 unknown user.
 */
export async function getThread(userId, otherId, { before, after } = {}) {
  if (String(userId) === String(otherId)) {
    throw new HttpError(400, "You can't message yourself.")
  }
  const other = await loadUser(otherId)
  const cursorId = before || after
  if (cursorId && !isUuid(cursorId)) throw new HttpError(400, 'Invalid message cursor.')

  const params = [userId, other.id]
  let cursorSql = ''
  if (cursorId) {
    params.push(cursorId)
    cursorSql = `AND created_at ${before ? '<' : '>'}
      (SELECT created_at FROM messages WHERE id = $3 AND ${pairSql('$1', '$2')})`
  }
  // `after` reads forward from the cursor; otherwise read back from the newest.
  const { rows } = await query(
    `SELECT id, sender_id, body, created_at, read_at FROM messages
     WHERE ${pairSql('$1', '$2')} ${cursorSql}
     ORDER BY created_at ${after ? 'ASC' : 'DESC'}, id ${after ? 'ASC' : 'DESC'}
     LIMIT ${THREAD_PAGE_SIZE + 1}`,
    params,
  )
  const hasMore = !after && rows.length > THREAD_PAGE_SIZE
  const page = rows.slice(0, THREAD_PAGE_SIZE)
  if (!after) page.reverse()

  await query(
    `UPDATE messages SET read_at = now()
     WHERE recipient_id = $1 AND sender_id = $2 AND read_at IS NULL`,
    [userId, other.id],
  )

  const relationship = await relationshipBetween(userId, other.id)
  return {
    user: publicUser(other),
    relationship,
    canMessage: relationship === 'friends',
    /** Both allow profanity: curses go through unmasked in this chat. */
    profanityAllowed: await bothAllowProfanity(userId, other.id),
    request: await pendingRequest(userId, other.id, relationship),
    messages: page.map((row) => messageEntry(row, userId)),
    hasMore,
  }
}

/**
 * The open friend request between two users, if any, with its note.
 * @param {string} userId
 * @param {string} otherId
 * @param {string} relationship - From `relationshipBetween`.
 * @returns {Promise<{ message: string, at: Date, expiresAt: Date, fromMe: boolean } | null>}
 */
async function pendingRequest(userId, otherId, relationship) {
  if (relationship !== 'incoming' && relationship !== 'outgoing') return null
  const fromMe = relationship === 'outgoing'
  const { rows } = await query(
    `SELECT message, created_at FROM friendships
     WHERE follower_id = $1 AND followee_id = $2 AND status = 'pending' AND ${liveLinkSql()}`,
    fromMe ? [userId, otherId] : [otherId, userId],
  )
  if (!rows[0]) return null
  return {
    message: rows[0].message || '',
    at: rows[0].created_at,
    expiresAt: requestExpiresAt(rows[0].created_at),
    fromMe,
  }
}

/**
 * Send a direct message to a friend. Blocked language is masked and earns the
 * sender a language warning.
 *
 * @param {{ _id: string, username: string }} sender
 * @param {string} otherId - Recipient.
 * @param {unknown} body
 * @returns {Promise<{ message: { id: string, body: string, at: Date, fromMe: true, readAt: null }, warning: object | null }>}
 *   `warning` is set when the message was masked (see `screenText`).
 * @throws {HttpError} 400 bad body, unmaskable language, or self; 403 not friends;
 *   404 unknown user; 429 burst.
 */
export async function sendMessage(sender, otherId, body) {
  const userId = sender._id
  if (String(userId) === String(otherId)) {
    throw new HttpError(400, "You can't message yourself.")
  }
  const text = cleanMessageBody(body)
  const other = await loadUser(otherId)
  if ((await relationshipBetween(userId, other.id)) !== 'friends') {
    throw new HttpError(403, 'You can only message friends.', 'NOT_FRIENDS')
  }
  const { rows: recent } = await query(
    `SELECT count(*)::int AS count FROM messages
     WHERE sender_id = $1 AND created_at > now() - make_interval(secs => $2)`,
    [userId, SEND_BURST_SECONDS],
  )
  if ((recent[0]?.count || 0) >= SEND_BURST_MAX) {
    throw new HttpError(429, "You're sending messages too fast. Wait a moment and try again.")
  }

  const { fields, warning } = await screenText(
    sender,
    'message',
    { body: text },
    { allowCurses: await bothAllowProfanity(userId, other.id) },
  )

  const { rows } = await query(
    `INSERT INTO messages (sender_id, recipient_id, body)
     VALUES ($1, $2, $3)
     RETURNING id, sender_id, body, created_at, read_at`,
    [userId, other.id, fields.body],
  )
  return { message: messageEntry(rows[0], userId), warning }
}

/**
 * Unread messages and open incoming friend requests, for the profile-menu badge.
 * @param {string} userId
 * @returns {Promise<{ messages: number, requests: number }>}
 */
export async function countUnread(userId) {
  const { rows } = await query(
    `SELECT
       (SELECT count(*)::int FROM messages WHERE recipient_id = $1 AND read_at IS NULL) AS messages,
       (SELECT count(*)::int FROM friendships
        WHERE followee_id = $1 AND status = 'pending' AND ${liveLinkSql()}) AS requests`,
    [userId],
  )
  return { messages: rows[0]?.messages || 0, requests: rows[0]?.requests || 0 }
}

export default {
  pairSql,
  messageEntry,
  cleanMessageBody,
  maskLanguage,
  bothAllowProfanity,
  getCommunicationSettings,
  setCommunicationSettings,
  listConversations,
  getThread,
  sendMessage,
  countUnread,
}
