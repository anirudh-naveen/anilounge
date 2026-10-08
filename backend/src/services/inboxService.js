/**
 * The profile-menu inbox: notifications, site news, and unresolved import clashes.
 *
 * Layer: service. Notifications (friend requests and acceptances, comments on your
 * posts, replies to your comments, language warnings) are written by
 * `notificationService.notify`. Site news lives in `announcements` and shows in every
 * inbox for NEWS_DAYS; news from before an account existed starts out read. Import
 * clashes (`watchlist_import_conflicts`) aren't items: the inbox shows a count and
 * the clash picker until the user settles them.
 */

import { query } from '../../config/postgres.js'
import { isUuid } from '../db/ids.js'
import { HttpError } from '../utils/httpError.js'
import { cleanUserText } from '../utils/userText.js'
import { excerptOf } from './forumService.js'
import { publicUser } from './friendService.js'

export const PAGE_SIZE = 30
/** How long site news stays in inboxes. */
export const NEWS_DAYS = 180
const COMMENT_PREVIEW = 160
const recentNewsSql = (alias) => `${alias}.created_at > now() - interval '${NEWS_DAYS} days'`

/**
 * Client shape for one inbox row (a notification or a news item).
 * @param {object} row - From `listInbox`'s union query.
 * @returns {object}
 */
export function inboxEntry(row) {
  const base = {
    id: String(row.id),
    kind: row.kind,
    createdAt: row.created_at,
    read: Boolean(row.read_at),
  }
  if (row.source === 'news') {
    return { ...base, news: { title: row.title, body: row.body } }
  }
  return {
    ...base,
    actor: row.actor_id
      ? publicUser({
          id: row.actor_id,
          username: row.actor_username,
          profile_picture: row.actor_picture,
        })
      : null,
    post: row.post_id ? { id: String(row.post_id), title: row.post_title } : null,
    comment: row.comment_id
      ? { id: String(row.comment_id), excerpt: excerptOf(row.comment_body, COMMENT_PREVIEW) }
      : null,
    detail: row.detail || null,
    /** Friend requests: 'pending' (still open), 'accepted' (now friends), or 'closed'. */
    requestStatus: row.kind === 'friend_request' ? row.request_status || 'closed' : undefined,
  }
}

/**
 * Number of import clashes waiting on the user (0 when the table isn't there yet).
 * @param {string} userId
 * @returns {Promise<number>}
 */
async function countImportClashes(userId) {
  try {
    const { rows } = await query(
      'SELECT count(*)::int AS n FROM watchlist_import_conflicts WHERE user_id = $1',
      [userId],
    )
    return rows[0]?.n || 0
  } catch {
    return 0
  }
}

/**
 * A page of the inbox, newest first, plus the import clash count.
 * @param {string} userId
 * @param {{ before?: unknown }} [cursor] - ISO time; items older than it.
 * @returns {Promise<{ items: object[], hasMore: boolean, importClashes: number }>}
 * @throws {HttpError} 400 bad cursor.
 */
export async function listInbox(userId, { before } = {}) {
  let beforeAt = null
  if (before) {
    beforeAt = new Date(String(before))
    if (Number.isNaN(beforeAt.getTime())) throw new HttpError(400, 'Invalid cursor.')
  }
  const listing = query(
    `SELECT * FROM (
       SELECT 'notification' AS source, n.id, n.kind, n.created_at, n.read_at, n.detail,
              n.actor_id, au.username AS actor_username, au.profile_picture AS actor_picture,
              p.id AS post_id, p.title AS post_title,
              c.id AS comment_id, c.body AS comment_body,
              CASE
                WHEN n.kind <> 'friend_request' THEN NULL
                WHEN EXISTS (
                  SELECT 1 FROM friendships f
                  WHERE f.follower_id = n.actor_id AND f.followee_id = n.user_id
                    AND f.status = 'pending'
                ) THEN 'pending'
                WHEN EXISTS (
                  SELECT 1 FROM friendships f
                  WHERE f.status = 'accepted'
                    AND ((f.follower_id = n.actor_id AND f.followee_id = n.user_id)
                      OR (f.follower_id = n.user_id AND f.followee_id = n.actor_id))
                ) THEN 'accepted'
                ELSE 'closed'
              END AS request_status,
              NULL::text AS title, NULL::text AS body
       FROM notifications n
       LEFT JOIN users au ON au.id = n.actor_id
       LEFT JOIN posts p ON p.id = n.post_id
       LEFT JOIN comments c ON c.id = n.comment_id AND c.deleted_at IS NULL
       WHERE n.user_id = $1
         -- Comment notifications whose post was deleted have nothing to show.
         AND (n.kind NOT IN ('post_comment', 'comment_reply') OR p.id IS NOT NULL)
       UNION ALL
       SELECT 'news', a.id, 'announcement', a.created_at,
              COALESCE(r.read_at, CASE WHEN a.created_at <= u.created_at THEN a.created_at END),
              NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, a.title, a.body
       FROM announcements a
       JOIN users u ON u.id = $1
       LEFT JOIN announcement_reads r ON r.announcement_id = a.id AND r.user_id = $1
       WHERE ${recentNewsSql('a')}
     ) inbox
     WHERE $2::timestamptz IS NULL OR created_at < $2::timestamptz
     ORDER BY created_at DESC, id DESC
     LIMIT ${PAGE_SIZE + 1}`,
    [userId, beforeAt],
  )
  const [{ rows }, importClashes] = await Promise.all([
    listing,
    before ? 0 : countImportClashes(userId),
  ])
  return {
    items: rows.slice(0, PAGE_SIZE).map(inboxEntry),
    hasMore: rows.length > PAGE_SIZE,
    importClashes,
  }
}

/**
 * Unread counts for the profile-menu badge.
 * @param {string} userId
 * @returns {Promise<{ notifications: number, news: number, importClashes: number, total: number }>}
 */
export async function countUnread(userId) {
  const counts = query(
    `SELECT
       (SELECT count(*)::int FROM notifications WHERE user_id = $1 AND read_at IS NULL)
         AS notifications,
       (SELECT count(*)::int FROM announcements a JOIN users u ON u.id = $1
        WHERE ${recentNewsSql('a')} AND a.created_at > u.created_at
          AND NOT EXISTS (
            SELECT 1 FROM announcement_reads r WHERE r.announcement_id = a.id AND r.user_id = $1
          )) AS news`,
    [userId],
  )
  const [{ rows }, importClashes] = await Promise.all([counts, countImportClashes(userId)])
  const notifications = rows[0]?.notifications || 0
  const news = rows[0]?.news || 0
  return { notifications, news, importClashes, total: notifications + news + importClashes }
}

/**
 * Mark inbox items read: the given ids (notifications or news), or everything.
 * @param {string} userId
 * @param {{ ids?: unknown }} [input] - Omit `ids` to mark all.
 * @returns {Promise<{ notifications: number, news: number, importClashes: number, total: number }>}
 *   The new unread counts.
 * @throws {HttpError} 400 bad ids.
 */
export async function markRead(userId, { ids } = {}) {
  let list = null
  if (ids !== undefined) {
    if (!Array.isArray(ids) || ids.length > 200 || !ids.every((id) => isUuid(String(id)))) {
      throw new HttpError(400, 'ids must be a list of item ids.')
    }
    list = ids.map(String)
  }
  await query(
    `UPDATE notifications SET read_at = now()
     WHERE user_id = $1 AND read_at IS NULL AND ($2::uuid[] IS NULL OR id = ANY($2::uuid[]))`,
    [userId, list],
  )
  await query(
    `INSERT INTO announcement_reads (announcement_id, user_id)
     SELECT a.id, $1 FROM announcements a
     WHERE ${recentNewsSql('a')} AND ($2::uuid[] IS NULL OR a.id = ANY($2::uuid[]))
     ON CONFLICT DO NOTHING`,
    [userId, list],
  )
  return countUnread(userId)
}

/**
 * Post site news to every inbox.
 * @param {{ title: unknown, body: unknown }} input
 * @returns {Promise<{ id: string, title: string, body: string, createdAt: Date }>}
 * @throws {HttpError} 400 empty or too long.
 */
export async function postAnnouncement({ title, body }) {
  const cleanTitle = cleanUserText(title).replace(/\s+/g, ' ')
  const cleanBody = cleanUserText(body)
  if (!cleanTitle || cleanTitle.length > 200) {
    throw new HttpError(400, 'News needs a title of 200 characters or fewer.')
  }
  if (!cleanBody || cleanBody.length > 20000) {
    throw new HttpError(400, 'News needs a body of 20,000 characters or fewer.')
  }
  const { rows } = await query(
    'INSERT INTO announcements (title, body) VALUES ($1, $2) RETURNING id, created_at',
    [cleanTitle, cleanBody],
  )
  return {
    id: String(rows[0].id),
    title: cleanTitle,
    body: cleanBody,
    createdAt: rows[0].created_at,
  }
}

export default { listInbox, countUnread, markRead, postAnnouncement, inboxEntry }
