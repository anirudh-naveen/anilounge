/**
 * Forum reports: signed-in users flag a post or comment for admins to review.
 *
 * Layer: service. One report per user per target (a repeat updates the reason). Open
 * reports are listed per target on the admin Reports tab, most-reported first. An
 * admin dismisses them (logged) or deletes the target; deleting a post or comment,
 * by anyone, resolves its reports (see `forumService`). Throws `HttpError`.
 */

import { query } from '../../config/postgres.js'
import { isUuid } from '../db/ids.js'
import { HttpError } from '../utils/httpError.js'
import { cleanUserText } from '../utils/userText.js'
import { logAction, quoteValue } from './adminLog.js'

export const REPORT_KINDS = ['post', 'comment']
export const REASON_MAX = 500
/** Reports one user can file per hour. */
export const REPORT_BURST = { max: 20, seconds: 3600 }
export const PAGE_SIZE = 25

/**
 * The target's author, or 404 when it is missing, deleted, or hidden (banned author).
 * @param {'post' | 'comment'} kind
 * @param {string} id
 * @returns {Promise<{ authorId: string }>}
 * @throws {HttpError} 404
 */
async function loadTarget(kind, id) {
  const label = kind === 'post' ? 'Post' : 'Comment'
  if (!isUuid(id)) throw new HttpError(404, `${label} not found.`)
  const sql =
    kind === 'post'
      ? `SELECT p.user_id FROM posts p JOIN users u ON u.id = p.user_id
         WHERE p.id = $1 AND u.banned_at IS NULL`
      : `SELECT c.user_id FROM comments c JOIN users u ON u.id = c.user_id
         WHERE c.id = $1 AND c.deleted_at IS NULL AND u.banned_at IS NULL`
  const { rows } = await query(sql, [id])
  if (!rows[0]) throw new HttpError(404, `${label} not found.`)
  return { authorId: String(rows[0].user_id) }
}

/**
 * File (or update) the user's report on a post or comment.
 * @param {{ _id: string }} user
 * @param {'post' | 'comment'} kind
 * @param {string} id
 * @param {unknown} reason - Optional free text.
 * @returns {Promise<void>}
 * @throws {HttpError} 400, 404, 429
 */
export async function reportTarget(user, kind, id, reason) {
  if (!REPORT_KINDS.includes(kind)) throw new HttpError(400, 'Unknown report target.')
  const text = cleanUserText(reason ?? '')
  if (text.length > REASON_MAX)
    throw new HttpError(400, `Keep the reason to ${REASON_MAX} characters or fewer.`)
  const { authorId } = await loadTarget(kind, id)
  if (authorId === String(user._id)) throw new HttpError(400, "You can't report something you wrote.")

  const { rows } = await query(
    `SELECT count(*)::int AS count FROM forum_reports
     WHERE reporter_id = $1 AND created_at > now() - make_interval(secs => $2)`,
    [user._id, REPORT_BURST.seconds],
  )
  if ((rows[0]?.count || 0) >= REPORT_BURST.max) {
    throw new HttpError(429, "You've sent a lot of reports. Try again in a while.")
  }

  await query(
    `INSERT INTO forum_reports (target_kind, target_id, reporter_id, reason)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (target_kind, target_id, reporter_id) DO UPDATE
       SET reason = COALESCE(EXCLUDED.reason, forum_reports.reason),
           resolved_at = NULL, resolved_by = NULL, resolution = NULL, created_at = now()`,
    [kind, id, user._id, text || null],
  )
}

/**
 * Close every open report on the given targets. Never throws: a failure here must not
 * undo the deletion that triggered it.
 * @param {'post' | 'comment'} kind
 * @param {string[]} ids
 * @param {'dismissed' | 'deleted'} resolution
 * @param {{ _id?: string } | null} [actor]
 * @returns {Promise<number>} Reports closed.
 */
export async function resolveReports(kind, ids, resolution, actor = null) {
  if (!ids.length) return 0
  try {
    const { rowCount } = await query(
      `UPDATE forum_reports SET resolved_at = now(), resolved_by = $4, resolution = $3
       WHERE target_kind = $1 AND target_id = ANY($2::uuid[]) AND resolved_at IS NULL`,
      [kind, ids, resolution, actor?._id || null],
    )
    return rowCount
  } catch (error) {
    if (error.code !== '42P01') console.error('Resolving forum reports failed:', error.message)
    return 0
  }
}

/** Open reports whose target still exists and is visible. */
const OPEN_TARGETS = `
  FROM forum_reports r
  LEFT JOIN posts p ON r.target_kind = 'post' AND p.id = r.target_id
  LEFT JOIN comments c ON r.target_kind = 'comment' AND c.id = r.target_id
  LEFT JOIN posts cp ON cp.id = c.post_id
  LEFT JOIN users au ON au.id = COALESCE(p.user_id, c.user_id)
  WHERE r.resolved_at IS NULL
    AND (p.id IS NOT NULL OR (c.id IS NOT NULL AND c.deleted_at IS NULL))`

/**
 * Number of reported targets awaiting review.
 * @returns {Promise<number>}
 */
export async function countOpenReports() {
  try {
    const { rows } = await query(
      `SELECT count(DISTINCT (r.target_kind, r.target_id))::int AS count ${OPEN_TARGETS}`,
    )
    return rows[0]?.count || 0
  } catch (error) {
    if (error.code === '42P01') return 0
    throw error
  }
}

/**
 * Open reports grouped per target, most-reported first.
 * @param {{ page?: unknown }} [params]
 * @returns {Promise<{ items: object[], page: number, pageSize: number, total: number }>}
 */
export async function listOpenReports({ page } = {}) {
  const current = Math.max(1, Math.floor(Number(page)) || 1)
  const total = await countOpenReports()
  if (!total) return { items: [], page: current, pageSize: PAGE_SIZE, total }
  const { rows } = await query(
    `SELECT r.target_kind, r.target_id,
            count(*)::int AS report_count,
            max(r.created_at) AS last_reported_at,
            (array_remove(array_agg(r.reason ORDER BY r.created_at DESC), NULL))[1:5] AS reasons,
            COALESCE(p.id, cp.id) AS post_id,
            COALESCE(p.title, cp.title) AS post_title,
            COALESCE(p.body, c.body) AS body,
            au.id AS author_id, au.username AS author_username
     ${OPEN_TARGETS}
     GROUP BY r.target_kind, r.target_id, p.id, c.id, cp.id, au.id
     ORDER BY report_count DESC, last_reported_at DESC
     LIMIT $1 OFFSET $2`,
    [PAGE_SIZE, (current - 1) * PAGE_SIZE],
  )
  return {
    items: rows.map((row) => ({
      kind: row.target_kind,
      id: String(row.target_id),
      postId: String(row.post_id),
      postTitle: row.post_title,
      body: row.body,
      author: row.author_id ? { id: String(row.author_id), username: row.author_username } : null,
      reportCount: row.report_count,
      reasons: row.reasons || [],
      lastReportedAt: row.last_reported_at,
    })),
    page: current,
    pageSize: PAGE_SIZE,
    total,
  }
}

/**
 * Admin: close a target's open reports without deleting it (logged).
 * @param {{ _id: string, username: string }} admin
 * @param {unknown} kind
 * @param {unknown} id
 * @returns {Promise<{ dismissed: number }>}
 * @throws {HttpError} 400
 */
export async function dismissReports(admin, kind, id) {
  if (!REPORT_KINDS.includes(kind) || !isUuid(id)) throw new HttpError(400, 'Unknown report.')
  const dismissed = await resolveReports(kind, [id], 'dismissed', admin)
  if (dismissed) {
    await logAction(
      'moderation',
      admin,
      `Dismissed ${dismissed} report${dismissed === 1 ? '' : 's'} on forum ${kind} ${quoteValue(id)}`,
    )
  }
  return { dismissed }
}

export default {
  reportTarget,
  resolveReports,
  countOpenReports,
  listOpenReports,
  dismissReports,
}
