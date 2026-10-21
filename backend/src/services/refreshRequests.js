/**
 * Refresh requests and stored fetch results, for database-only page loads.
 *
 * Layer: domain service. A page that finds its data missing or stale calls
 * `requestRefresh` and answers with what is stored; the catalog refresh job
 * (catalogRefresh.js) fetches it later. A row tried within RETRY_MS is not queued
 * again, so data a source can't supply (an actor with no AniList bio) isn't fetched
 * on every visit. `readCache` / `writeCache` hold fetched data that has no table of
 * its own. Tables: refresh_requests, external_cache (db/schema.sql).
 */

import { query } from '../../config/postgres.js'
import { isUuid } from '../db/ids.js'

/** Kinds the refresh job knows how to fetch. */
export const REFRESH_KINDS = [
  'cast',
  'character',
  'voice_actor',
  'studio',
  'airing',
  'episode_guide',
  'watch',
]
const RETRY_MS = 3 * 60 * 60 * 1000

/**
 * Queue `id` for a background refresh. Never throws: a page load must not fail
 * because the queue is unavailable.
 * @param {string} kind - One of REFRESH_KINDS.
 * @param {unknown} id - Content id.
 * @returns {Promise<void>}
 */
export async function requestRefresh(kind, id) {
  const targetId = String(id || '')
  if (!REFRESH_KINDS.includes(kind) || !isUuid(targetId)) return
  try {
    await query(
      `INSERT INTO refresh_requests (kind, target_id) VALUES ($1, $2)
       ON CONFLICT (kind, target_id) DO UPDATE SET requested_at = now()
       WHERE refresh_requests.attempted_at >= refresh_requests.requested_at
         AND refresh_requests.attempted_at < now() - make_interval(secs => $3)`,
      [kind, targetId, RETRY_MS / 1000],
    )
  } catch (error) {
    console.error(`Queueing a ${kind} refresh failed:`, error.message)
  }
}

/**
 * Oldest waiting requests, marked as attempted so a crash mid-run doesn't retry them
 * in a loop.
 * @param {number} limit
 * @returns {Promise<Array<{ kind: string, id: string }>>}
 */
export async function claimRefreshRequests(limit) {
  const { rows } = await query(
    `UPDATE refresh_requests r SET attempted_at = now()
     FROM (
       SELECT kind, target_id FROM refresh_requests
       WHERE attempted_at IS NULL OR requested_at > attempted_at
       ORDER BY requested_at LIMIT $1
       FOR UPDATE SKIP LOCKED
     ) due
     WHERE r.kind = due.kind AND r.target_id = due.target_id
     RETURNING r.kind, r.target_id::text AS id, r.requested_at`,
    [limit],
  )
  return rows
    .sort((left, right) => left.requested_at - right.requested_at)
    .map(({ kind, id }) => ({ kind, id }))
}

/**
 * @param {string} kind
 * @param {string} id
 * @returns {Promise<{ data: any, refreshedAt: Date } | null>}
 */
export async function readCache(kind, id) {
  if (!isUuid(String(id || ''))) return null
  try {
    const { rows } = await query(
      'SELECT data, refreshed_at FROM external_cache WHERE kind = $1 AND content_id = $2',
      [kind, String(id)],
    )
    return rows[0] ? { data: rows[0].data, refreshedAt: rows[0].refreshed_at } : null
  } catch (error) {
    console.error(`Reading cached ${kind} failed:`, error.message)
    return null
  }
}

/**
 * @param {string} kind
 * @param {string} id
 * @param {unknown} data - JSON-serializable.
 * @returns {Promise<void>}
 */
export async function writeCache(kind, id, data) {
  await query(
    `INSERT INTO external_cache (kind, content_id, data, refreshed_at)
     VALUES ($1, $2, $3::jsonb, now())
     ON CONFLICT (kind, content_id) DO UPDATE
       SET data = EXCLUDED.data, refreshed_at = EXCLUDED.refreshed_at`,
    [kind, String(id), JSON.stringify(data)],
  )
}

/**
 * @param {{ refreshedAt: Date } | null} entry
 * @param {number} maxAgeMs
 * @returns {boolean} Whether the cached entry is missing or older than `maxAgeMs`.
 */
export function isStale(entry, maxAgeMs) {
  return !entry || Date.now() - new Date(entry.refreshedAt).getTime() > maxAgeMs
}
