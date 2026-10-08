/**
 * Run a scheduled job on one server instance at a time.
 *
 * Layer: utils. Every instance schedules the same cron jobs; before running, each tries
 * to claim the job's row in `job_leases`. The claim succeeds only when no lease is live
 * and (optionally) the last run started at least `minIntervalMs` ago, so an hourly job
 * runs once an hour however many instances there are. A lease expires after `ttlMs`, so
 * an instance that dies mid-run cannot block the job forever.
 *
 * Without the table (schema not applied yet) jobs run unguarded, which is the old
 * single-instance behaviour.
 */

import { query } from '../../config/postgres.js'

let tableMissing = false

/**
 * @param {string} name - Job id, e.g. 'content-sync'.
 * @param {() => Promise<T>} fn
 * @param {{ ttlMs?: number, minIntervalMs?: number }} [options]
 * @returns {Promise<T | { skipped: true }>}
 * @template T
 */
export async function withJobLock(name, fn, { ttlMs = 30 * 60_000, minIntervalMs = 0 } = {}) {
  if (tableMissing) return fn()
  let claimed
  try {
    const { rows } = await query(
      `INSERT INTO job_leases (name, locked_until, last_started_at)
       VALUES ($1, now() + make_interval(secs => $2), now())
       ON CONFLICT (name) DO UPDATE
         SET locked_until = EXCLUDED.locked_until, last_started_at = now()
         WHERE job_leases.locked_until < now()
           AND job_leases.last_started_at < now() - make_interval(secs => $3)
       RETURNING name`,
      [name, ttlMs / 1000, minIntervalMs / 1000],
    )
    claimed = rows.length > 0
  } catch (error) {
    // 42P01 = undefined table: `npm run db:schema` has not added job_leases yet.
    if (error.code !== '42P01') throw error
    tableMissing = true
    console.warn('job_leases is missing; run npm run db:schema so jobs run on one instance')
    return fn()
  }
  if (!claimed) return { skipped: true }

  try {
    return await fn()
  } finally {
    await query('UPDATE job_leases SET locked_until = now() WHERE name = $1', [name]).catch(
      (error) => console.error(`Releasing job lease ${name} failed:`, error.message),
    )
  }
}
