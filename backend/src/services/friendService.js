/**
 * Friend requests, friendships, and user lookup for friending.
 *
 * Layer: service. A `friendships` row runs from the requester (`follower_id`) to the
 * recipient (`followee_id`); `pending` is an open request and `accepted` is a
 * friendship in both directions. Accepting a request that carried a note turns the
 * note into the first direct message. Throws `HttpError` for user-facing failures.
 *
 * Requests expire after FRIEND_REQUEST_TTL_DAYS: every read ignores older pending
 * rows, and an hourly job deletes them (on by default in production; override with
 * FRIEND_REQUEST_CLEANUP_ENABLED and FRIEND_REQUEST_CLEANUP_CRON). New requests email
 * the recipient from notify@ unless they opted out.
 *
 * Re-request cooldown: when a request ends without a friendship (the sender cancels
 * or the recipient declines), or the sender later unfriends them, the sender gets a
 * strike against that recipient and cannot request them again for 5 minutes, doubling
 * with every strike (5m, 10m, 20m, ...). Strikes never reset, so cancel-and-resend
 * cannot be used to flood someone's inbox.
 */

import cron from 'node-cron'
import { query, withTransaction } from '../../config/postgres.js'
import { withJobLock } from '../utils/jobLock.js'
import { isUuid } from '../db/ids.js'
import { escapeLike } from '../db/mongoFilter.js'
import { HttpError } from '../utils/httpError.js'
import { moderationMessage } from '../utils/moderation.js'
import { cleanUserText } from '../utils/userText.js'
import { sendFriendRequestEmail } from './emailService.js'
import { unsubscribeUrl } from './emailPreferenceService.js'
import { notify } from './notificationService.js'

export const FRIEND_NOTE_MAX = 300
export const FRIEND_REQUEST_TTL_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000
const SEARCH_LIMIT_MAX = 20
const DEFAULT_CLEANUP_CRON = '30 * * * *'
export const COOLDOWN_BASE_MINUTES = 5
/** Caps the doubling (5 min × 2^30 is about 10,000 years) so timestamps stay valid. */
const COOLDOWN_MAX_DOUBLINGS = 30

/**
 * SQL condition for rows that still count: friendships, and requests younger than
 * the TTL. Expired requests read as if they were already deleted.
 * @param {string} [alias] - Table alias, e.g. `f`.
 * @returns {string}
 */
export function liveLinkSql(alias = '') {
  const col = (name) => (alias ? `${alias}.${name}` : name)
  return `(${col('status')} = 'accepted' OR (${col('status')} = 'pending' AND ${col(
    'created_at',
  )} > now() - interval '${FRIEND_REQUEST_TTL_DAYS} days'))`
}

/**
 * When a request sent at `sentAt` expires.
 * @param {Date | string} sentAt
 * @returns {Date}
 */
export function requestExpiresAt(sentAt) {
  return new Date(new Date(sentAt).getTime() + FRIEND_REQUEST_TTL_DAYS * DAY_MS)
}

/**
 * Public identity for a user row (`id`, `username`, `profile_picture`).
 * @param {{ id: string, username: string, profile_picture?: string | null }} row
 * @returns {{ id: string, username: string, profilePicture: string | null }}
 */
export function publicUser(row) {
  return {
    id: String(row.id),
    username: row.username,
    profilePicture: row.profile_picture || null,
  }
}

/**
 * How `viewerId` relates to `otherId`, from the viewer's side.
 * @param {string} viewerId
 * @param {string} otherId
 * @returns {Promise<'self' | 'friends' | 'outgoing' | 'incoming' | 'none'>}
 */
export async function relationshipBetween(viewerId, otherId) {
  if (String(viewerId) === String(otherId)) return 'self'
  const { rows } = await query(
    `SELECT follower_id, status FROM friendships
     WHERE ((follower_id = $1 AND followee_id = $2) OR (follower_id = $2 AND followee_id = $1))
       AND ${liveLinkSql()}`,
    [viewerId, otherId],
  )
  return relationshipFromRows(rows, viewerId)
}

/**
 * @param {Array<{ follower_id: string, status: string }>} rows - Rows between two users.
 * @param {string} viewerId
 * @returns {'friends' | 'outgoing' | 'incoming' | 'none'}
 */
export function relationshipFromRows(rows, viewerId) {
  if (rows.some((row) => row.status === 'accepted')) return 'friends'
  const pending = rows.find((row) => row.status === 'pending')
  if (!pending) return 'none'
  return String(pending.follower_id) === String(viewerId) ? 'outgoing' : 'incoming'
}

/**
 * IDs of everyone with an accepted friendship with `userId`.
 * @param {string} userId
 * @returns {Promise<string[]>}
 */
export async function friendIds(userId) {
  const { rows } = await query(
    `SELECT CASE WHEN follower_id = $1 THEN followee_id ELSE follower_id END AS friend_id
     FROM friendships
     WHERE status = 'accepted' AND (follower_id = $1 OR followee_id = $1)`,
    [userId],
  )
  return [...new Set(rows.map((row) => String(row.friend_id)))]
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {Promise<boolean>}
 */
export async function areFriends(a, b) {
  return (await relationshipBetween(a, b)) === 'friends'
}

/**
 * Friends plus open requests in each direction, newest first.
 * @param {string} userId
 * @returns {Promise<{ friends: object[], incoming: object[], outgoing: object[] }>}
 */
export async function listFriends(userId) {
  const { rows } = await query(
    `SELECT f.follower_id, f.status, f.message, f.created_at, f.responded_at,
            u.id, u.username, u.profile_picture
     FROM friendships f
     JOIN users u ON u.id = CASE WHEN f.follower_id = $1 THEN f.followee_id ELSE f.follower_id END
     WHERE (f.follower_id = $1 OR f.followee_id = $1) AND ${liveLinkSql('f')}
     ORDER BY COALESCE(f.responded_at, f.created_at) DESC`,
    [userId],
  )
  const result = { friends: [], incoming: [], outgoing: [] }
  const seenFriends = new Set()
  for (const row of rows) {
    const user = publicUser(row)
    if (row.status === 'accepted') {
      if (seenFriends.has(user.id)) continue
      seenFriends.add(user.id)
      result.friends.push({ user, since: row.responded_at || row.created_at })
    } else if (String(row.follower_id) === String(userId)) {
      result.outgoing.push(requestEntry(user, row))
    } else {
      result.incoming.push(requestEntry(user, row))
    }
  }
  result.friends.sort((a, b) => a.user.username.localeCompare(b.user.username))
  return result
}

/**
 * @param {object} user - `publicUser` shape.
 * @param {{ message?: string | null, created_at: Date }} row
 * @returns {{ user: object, message: string, at: Date, expiresAt: Date }}
 */
function requestEntry(user, row) {
  return {
    user,
    message: row.message || '',
    at: row.created_at,
    expiresAt: requestExpiresAt(row.created_at),
  }
}

/**
 * Number of friend requests waiting on `userId`.
 * @param {string} userId
 * @returns {Promise<number>}
 */
export async function countIncomingRequests(userId) {
  const { rows } = await query(
    `SELECT count(*)::int AS count FROM friendships
     WHERE followee_id = $1 AND status = 'pending' AND ${liveLinkSql()}`,
    [userId],
  )
  return rows[0]?.count || 0
}

/**
 * Load a user who can take part in social features (exists, finished sign-up).
 * @param {string} userId
 * @returns {Promise<{ id: string, username: string, email: string, profile_picture: string | null, email_verified_at: Date | null, is_demo: boolean, friend_request_emails: boolean }>}
 * @throws {HttpError} 404 when missing.
 */
async function loadActiveUser(userId) {
  if (!isUuid(userId)) throw new HttpError(404, 'User not found.')
  const { rows } = await query(
    `SELECT id, username, email, profile_picture, email_verified_at, is_demo,
            friend_request_emails
     FROM users WHERE id = $1 AND NOT pending_signup`,
    [userId],
  )
  if (!rows[0]) throw new HttpError(404, 'User not found.')
  return rows[0]
}

/**
 * Send a friend request. When the other user already asked us, this accepts theirs.
 *
 * @param {string} fromId - Requester.
 * @param {string} toId - Recipient.
 * @param {unknown} [note] - Optional note shown with the request (max 300 chars).
 * @returns {Promise<{ relationship: 'outgoing' | 'friends', user: object }>}
 * @throws {HttpError} 400 self/too long/blocked language, 404 unknown user, 409 already
 *   linked, 429 while a re-request cooldown is running.
 */
export async function sendFriendRequest(fromId, toId, note) {
  if (String(fromId) === String(toId)) {
    throw new HttpError(400, "You can't send a friend request to yourself.")
  }
  const message = cleanUserText(note)
  if (message.length > FRIEND_NOTE_MAX) {
    throw new HttpError(400, `Notes must be ${FRIEND_NOTE_MAX} characters or fewer.`)
  }
  const blocked = moderationMessage({ 'Your note': message })
  if (blocked) throw new HttpError(400, blocked)

  const target = await loadActiveUser(toId)
  const relationship = await relationshipBetween(fromId, toId)
  if (relationship === 'friends') throw new HttpError(409, "You're already friends.")
  if (relationship === 'outgoing') throw new HttpError(409, 'Friend request already sent.')
  if (relationship === 'incoming') {
    await acceptFriendRequest(fromId, toId)
    return { relationship: 'friends', user: publicUser(target) }
  }
  await assertNoCooldown(fromId, target)

  // An expired request row may still exist until the cleanup job runs; reuse it.
  const { rows } = await query(
    `INSERT INTO friendships (follower_id, followee_id, status, message)
     VALUES ($1, $2, 'pending', $3)
     ON CONFLICT (follower_id, followee_id)
       DO UPDATE SET status = 'pending', message = EXCLUDED.message,
                     created_at = now(), responded_at = NULL
     RETURNING created_at`,
    [fromId, toId, message || null],
  )
  await notify(toId, 'friend_request', { actorId: fromId })
  emailFriendRequest(fromId, target, message, requestExpiresAt(rows[0].created_at))
  return { relationship: 'outgoing', user: publicUser(target) }
}

/**
 * Email the recipient about a new request, in the background. Skips unverified
 * addresses, the demo account, and anyone who opted out; a failed send is logged,
 * never surfaced.
 * @param {string} fromId
 * @param {{ id: string, username: string, email: string, email_verified_at: Date | null, is_demo: boolean, friend_request_emails: boolean }} recipient
 * @param {string} note
 * @param {Date} expiresAt
 * @returns {void}
 */
function emailFriendRequest(fromId, recipient, note, expiresAt) {
  if (!recipient.email_verified_at || recipient.is_demo) return
  if (recipient.friend_request_emails === false) return
  query('SELECT username FROM users WHERE id = $1', [fromId])
    .then(({ rows }) => {
      if (!rows[0]) return null
      const optOut = unsubscribeUrl(String(recipient.id), 'friend_requests')
      return sendFriendRequestEmail(recipient, rows[0], note, expiresAt, optOut)
    })
    .catch((error) => console.error('Friend request email failed:', error.message))
}

/**
 * Accept the pending request `requesterId` sent to `userId`. A note on the request
 * becomes the first direct message, dated when the request was sent.
 *
 * @param {string} userId - Recipient accepting.
 * @param {string} requesterId
 * @returns {Promise<void>}
 * @throws {HttpError} 404 when there is no such pending request.
 */
export async function acceptFriendRequest(userId, requesterId) {
  await withTransaction(async () => {
    const { rows } = await query(
      `UPDATE friendships SET status = 'accepted', responded_at = now()
       WHERE follower_id = $1 AND followee_id = $2 AND status = 'pending' AND ${liveLinkSql()}
       RETURNING message, created_at`,
      [requesterId, userId],
    )
    if (!rows[0]) throw new HttpError(404, 'Friend request not found or expired.')
    if (rows[0].message) {
      await query(
        `INSERT INTO messages (sender_id, recipient_id, body, created_at)
         VALUES ($1, $2, $3, $4)`,
        [requesterId, userId, rows[0].message, rows[0].created_at],
      )
    }
  })
  await notify(requesterId, 'friend_accepted', { actorId: userId })
}

/**
 * How long a sender is paused after their `strikes`-th strike: 5 minutes, doubling.
 * @param {number} strikes - Strikes including the newest (1 for the first).
 * @returns {number} Milliseconds.
 */
export function cooldownMs(strikes) {
  const doublings = Math.min(Math.max(Number(strikes) - 1, 0), COOLDOWN_MAX_DOUBLINGS)
  return COOLDOWN_BASE_MINUTES * 60 * 1000 * 2 ** doublings
}

/**
 * Rounded-up wait for messages: `5 minutes`, `3 hours`, `2 days`, `1 year`.
 * @param {number} ms
 * @returns {string}
 */
export function describeWait(ms) {
  const minutes = Math.max(1, Math.ceil(ms / 60_000))
  const plural = (count, unit) => `${count} ${unit}${count === 1 ? '' : 's'}`
  if (minutes < 60) return plural(minutes, 'minute')
  const hours = Math.ceil(minutes / 60)
  if (hours < 48) return plural(hours, 'hour')
  const days = Math.ceil(hours / 24)
  if (days < 365) return plural(days, 'day')
  return plural(Math.ceil(days / 365), 'year')
}

/**
 * Add a strike for `requesterId` against `recipientId` and restart their pause.
 * @param {string} requesterId
 * @param {string} recipientId
 * @returns {Promise<void>}
 */
async function addCooldownStrike(requesterId, recipientId) {
  const baseSeconds = COOLDOWN_BASE_MINUTES * 60
  await query(
    `INSERT INTO friend_request_cooldowns AS c (requester_id, recipient_id, strikes, blocked_until)
     VALUES ($1, $2, 1, now() + make_interval(secs => $3))
     ON CONFLICT (requester_id, recipient_id) DO UPDATE
       SET strikes = c.strikes + 1,
           blocked_until = now() + make_interval(secs => $3 * power(2, least(c.strikes, $4)))`,
    [requesterId, recipientId, baseSeconds, COOLDOWN_MAX_DOUBLINGS],
  )
}

/**
 * Refuse a new request while the sender is paused for this recipient.
 * @param {string} requesterId
 * @param {{ id: string, username: string }} recipient
 * @returns {Promise<void>}
 * @throws {HttpError} 429 `FRIEND_REQUEST_COOLDOWN` with the remaining wait.
 */
async function assertNoCooldown(requesterId, recipient) {
  const { rows } = await query(
    `SELECT blocked_until FROM friend_request_cooldowns
     WHERE requester_id = $1 AND recipient_id = $2 AND blocked_until > now()`,
    [requesterId, recipient.id],
  )
  if (!rows[0]) return
  const wait = describeWait(new Date(rows[0].blocked_until).getTime() - Date.now())
  throw new HttpError(
    429,
    `You can send ${recipient.username} another friend request in ${wait}.`,
    'FRIEND_REQUEST_COOLDOWN',
  )
}

/**
 * Decline an incoming request, cancel an outgoing one, or unfriend. Each one pauses
 * the sender's next request to this person (see the cooldown note at the top).
 *
 * @param {string} userId
 * @param {string} otherId
 * @returns {Promise<'declined' | 'cancelled' | 'removed'>}
 * @throws {HttpError} 404 when the two users are not linked.
 */
export async function removeFriendship(userId, otherId) {
  const relationship = await relationshipBetween(userId, otherId)
  if (relationship === 'none' || relationship === 'self') {
    throw new HttpError(404, 'No friendship or request found.')
  }
  await query(
    `DELETE FROM friendships
     WHERE ((follower_id = $1 AND followee_id = $2) OR (follower_id = $2 AND followee_id = $1))
       AND status IN ('pending', 'accepted')`,
    [userId, otherId],
  )
  // The request notification is stale once the request is gone.
  await query(
    `DELETE FROM notifications
     WHERE kind = 'friend_request' AND read_at IS NULL
       AND ((user_id = $1 AND actor_id = $2) OR (user_id = $2 AND actor_id = $1))`,
    [userId, otherId],
  )
  if (relationship === 'incoming') {
    await addCooldownStrike(otherId, userId)
    return 'declined'
  }
  await addCooldownStrike(userId, otherId)
  return relationship === 'outgoing' ? 'cancelled' : 'removed'
}

/**
 * Find users by username (prefix matches first) with the viewer's relationship to each.
 * The viewer and unfinished sign-ups are left out.
 *
 * @param {string} viewerId
 * @param {unknown} term
 * @param {{ limit?: number }} [options]
 * @returns {Promise<Array<{ id: string, username: string, profilePicture: string | null, relationship: string }>>}
 */
export async function searchUsers(viewerId, term, { limit = 10 } = {}) {
  const q = typeof term === 'string' ? term.trim().slice(0, 40) : ''
  if (q.length < 2) return []
  const capped = Math.min(Math.max(Number(limit) || 10, 1), SEARCH_LIMIT_MAX)
  const escaped = escapeLike(q)
  const { rows } = await query(
    `SELECT u.id, u.username, u.profile_picture,
            (SELECT json_agg(json_build_object('follower_id', f.follower_id, 'status', f.status))
             FROM friendships f
             WHERE ((f.follower_id = $1 AND f.followee_id = u.id)
                 OR (f.follower_id = u.id AND f.followee_id = $1))
               AND ${liveLinkSql('f')}) AS links
     FROM users u
     WHERE u.id <> $1 AND NOT u.pending_signup AND u.banned_at IS NULL AND u.username ILIKE $2
     ORDER BY (lower(u.username) = lower($4)) DESC, (u.username ILIKE $3) DESC, lower(u.username)
     LIMIT $5`,
    [viewerId, `%${escaped}%`, `${escaped}%`, q, capped],
  )
  return rows.map((row) => ({
    ...publicUser(row),
    relationship: relationshipFromRows(row.links || [], viewerId),
  }))
}

/**
 * Delete friend requests older than the TTL and their unread inbox notifications.
 * @returns {Promise<{ deleted: number }>}
 */
export async function deleteExpiredFriendRequests() {
  const { rows } = await query(
    `DELETE FROM friendships
     WHERE status = 'pending' AND created_at <= now() - interval '${FRIEND_REQUEST_TTL_DAYS} days'
     RETURNING follower_id, followee_id`,
  )
  if (rows.length) {
    await query(
      `DELETE FROM notifications n
       USING unnest($1::uuid[], $2::uuid[]) AS expired(actor_id, user_id)
       WHERE n.kind = 'friend_request' AND n.read_at IS NULL
         AND n.actor_id = expired.actor_id AND n.user_id = expired.user_id`,
      [rows.map((row) => row.follower_id), rows.map((row) => row.followee_id)],
    )
    console.log(`Deleted ${rows.length} expired friend request(s)`)
  }
  return { deleted: rows.length }
}

/**
 * Schedule the hourly expired-request cleanup (default: production only).
 * @returns {import('node-cron').ScheduledTask | null}
 */
export function startFriendRequestCleanupScheduler() {
  const flag = process.env.FRIEND_REQUEST_CLEANUP_ENABLED
  const enabled = flag === 'true' || (flag !== 'false' && process.env.NODE_ENV === 'production')
  if (!enabled) return null
  const schedule = process.env.FRIEND_REQUEST_CLEANUP_CRON || DEFAULT_CLEANUP_CRON
  if (!cron.validate(schedule)) {
    console.error(`Invalid FRIEND_REQUEST_CLEANUP_CRON "${schedule}"; cleanup not scheduled`)
    return null
  }
  return cron.schedule(
    schedule,
    () => {
      withJobLock('friend-request-cleanup', deleteExpiredFriendRequests, {
        minIntervalMs: 50 * 60_000,
      }).catch((error) =>
        console.error('Friend request cleanup failed:', error),
      )
    },
    { timezone: 'UTC' },
  )
}

export default {
  publicUser,
  relationshipBetween,
  relationshipFromRows,
  friendIds,
  areFriends,
  listFriends,
  countIncomingRequests,
  sendFriendRequest,
  acceptFriendRequest,
  removeFriendship,
  searchUsers,
  liveLinkSql,
  requestExpiresAt,
  cooldownMs,
  describeWait,
  deleteExpiredFriendRequests,
  startFriendRequestCleanupScheduler,
}
