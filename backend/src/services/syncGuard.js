/**
 * Sync notices: a 14-day log of what the catalog sync changed on existing rows
 * ('changed') or wanted to change on admin-locked fields ('blocked').
 *
 * Layer: domain service called from `Content.save` / `Entity.save` after
 * `utils/syncReview.planSyncChanges` has decided what the sync may change, and from
 * the admin page. Does not import the models (they import this).
 */

import { query } from '../../config/postgres.js'

/** Notices older than this are hidden and deleted. */
export const NOTICE_TTL_DAYS = 14
/** SQL predicate for notices still inside the TTL. */
export const LIVE_NOTICE_SQL = `created_at > now() - interval '${NOTICE_TTL_DAYS} days'`

/** How long to trust "table missing" before checking again (after `db:schema` runs). */
const RECHECK_MS = 60 * 1000
const PRUNE_EVERY_MS = 60 * 60 * 1000
let tableReady = false
let checkedAt = 0
let prunedAt = 0

/**
 * Whether `content_sync_changes` exists. Checked up front rather than by catching the
 * error, because a failed statement would abort the caller's transaction. Without the
 * table, locks and the "never blank a value" rule still apply; there is just no log.
 * @returns {Promise<boolean>}
 */
export async function noticesTableReady() {
  if (tableReady || Date.now() - checkedAt < RECHECK_MS) return tableReady
  const { rows } = await query(
    `SELECT to_regclass('public.content_sync_changes') IS NOT NULL AS ok`,
  )
  tableReady = Boolean(rows[0]?.ok)
  checkedAt = Date.now()
  return tableReady
}

/**
 * Delete expired notices, at most once an hour per process.
 * @returns {Promise<void>}
 */
export async function pruneExpiredNotices() {
  if (Date.now() - prunedAt < PRUNE_EVERY_MS || !(await noticesTableReady())) return
  prunedAt = Date.now()
  await query(`DELETE FROM content_sync_changes WHERE NOT (${LIVE_NOTICE_SQL})`)
}

/**
 * Record notices for one row. The sync runs hourly, so a repeat of the same notice
 * is ignored (its 14 days keep counting). A 'changed' notice that is changed again
 * keeps the value from before the first change, so reverting restores the original;
 * if the sync ends up back at that value, the notice is dropped.
 * @param {string} contentId
 * @param {Array<{ field: string, outcome: 'changed' | 'blocked', oldValue: unknown, newValue: unknown }>} notices
 * @returns {Promise<void>}
 */
export async function recordSyncNotices(contentId, notices) {
  if (!notices.length || !(await noticesTableReady())) return
  for (const { field, outcome, oldValue, newValue } of notices) {
    await query(
      `INSERT INTO content_sync_changes (content_id, field, outcome, old_value, new_value)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)
       ON CONFLICT (content_id, field) DO UPDATE SET
         old_value = CASE
           WHEN content_sync_changes.outcome = 'changed' AND EXCLUDED.outcome = 'changed'
             THEN content_sync_changes.old_value
           ELSE EXCLUDED.old_value
         END,
         outcome = EXCLUDED.outcome,
         new_value = EXCLUDED.new_value,
         created_at = now()
       WHERE content_sync_changes.outcome <> EXCLUDED.outcome
          OR content_sync_changes.new_value <> EXCLUDED.new_value`,
      [contentId, field, outcome, JSON.stringify(oldValue), JSON.stringify(newValue)],
    )
  }
  await query(
    `DELETE FROM content_sync_changes
     WHERE content_id = $1 AND field = ANY($2::text[]) AND old_value = new_value`,
    [contentId, notices.map((notice) => notice.field)],
  )
  await pruneExpiredNotices()
}

/**
 * Remove notices for fields an admin just set by hand (they are answered).
 * @param {string} contentId
 * @param {string[]} fields
 * @returns {Promise<void>}
 */
export async function clearSyncNotices(contentId, fields) {
  if (!fields.length || !(await noticesTableReady())) return
  await query(
    'DELETE FROM content_sync_changes WHERE content_id = $1 AND field = ANY($2::text[])',
    [contentId, fields],
  )
}

export default {
  NOTICE_TTL_DAYS,
  noticesTableReady,
  pruneExpiredNotices,
  recordSyncNotices,
  clearSyncNotices,
}
