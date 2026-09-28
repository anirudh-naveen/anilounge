/**
 * Inactive account cleanup: warn, then delete accounts unused for a year.
 *
 * Layer: service. `touchUserActivity` records use (sign-in, session refresh, any
 * authenticated request) and cancels pending warnings. A daily job emails warnings
 * 90, 30, 14, 7, and 1 day(s) before the one-year mark, deletes the account on
 * the day, and sends a final confirmation. The demo account is never touched.
 *
 * Env: ACCOUNT_CLEANUP_ENABLED ('true'/'false'; default on in production),
 * ACCOUNT_CLEANUP_CRON (default 09:00 UTC daily).
 */

import fs from 'fs'
import path from 'path'
import cron from 'node-cron'
import { getPool, query } from '../../config/postgres.js'
import { sendInactiveAccountDeleted, sendInactivityWarning } from './emailService.js'

export const INACTIVITY_LIMIT_DAYS = 365
/** Warning points, in days before deletion, largest first. */
export const WARNING_DAYS = [90, 30, 14, 7, 1]
const DAY_MS = 24 * 60 * 60 * 1000
const DEFAULT_CRON = '0 9 * * *'
/** Arbitrary constant so only one server instance runs the job at a time. */
const JOB_LOCK_KEY = 815_365

let activityColumnsMissing = false

/**
 * Mark a user active (at most one write per hour) and clear any pending warning.
 * @param {string} userId
 * @returns {Promise<void>}
 */
export async function touchUserActivity(userId) {
  if (activityColumnsMissing) return
  try {
    await query(
      `UPDATE users SET last_active_at = now(), inactivity_warning_days = NULL
       WHERE id = $1 AND (last_active_at IS NULL OR last_active_at < now() - interval '1 hour')`,
      [userId],
    )
  } catch (error) {
    // 42703 = undefined column: the schema has not been applied yet. Warn once, then no-op.
    if (error.code !== '42703') throw error
    activityColumnsMissing = true
    console.warn('users.last_active_at is missing; run npm run db:schema to track activity')
  }
}

/**
 * What the job should do for one account.
 *
 * @param {Date} lastActiveAt
 * @param {number | null} warnedDays - Smallest warning already sent, or null.
 * @param {Date} [now=new Date()]
 * @returns {{ action: 'none' } | { action: 'warn', stage: number, daysLeft: number, deleteAt: Date } | { action: 'delete' }}
 */
export function planInactivityAction(lastActiveAt, warnedDays, now = new Date()) {
  const deleteAt = new Date(lastActiveAt.getTime() + INACTIVITY_LIMIT_DAYS * DAY_MS)
  const daysLeft = Math.ceil((deleteAt.getTime() - now.getTime()) / DAY_MS)
  if (daysLeft <= 0) return { action: 'delete' }

  // The latest warning point reached. After downtime only the current one is sent.
  const stage = [...WARNING_DAYS].reverse().find((days) => daysLeft <= days)
  if (stage === undefined) return { action: 'none' }
  if (warnedDays != null && warnedDays <= stage) return { action: 'none' }
  return { action: 'warn', stage, daysLeft, deleteAt }
}

/**
 * Delete one account and its uploaded picture. Never deletes the demo account.
 * @param {{ id: string, profile_picture?: string | null }} row
 * @returns {Promise<boolean>} True when a row was deleted.
 */
async function deleteInactiveAccount(row) {
  const result = await query(
    `DELETE FROM users
     WHERE id = $1 AND is_demo = false
       AND last_active_at < now() - make_interval(days => $2)`,
    [row.id, INACTIVITY_LIMIT_DAYS],
  )
  if (result.rowCount && row.profile_picture && !row.profile_picture.startsWith('http')) {
    const file = path.join(process.cwd(), 'uploads', 'profiles', path.basename(row.profile_picture))
    fs.promises.unlink(file).catch(() => {})
  }
  return Boolean(result.rowCount)
}

/**
 * One cleanup pass: send due warnings and delete expired accounts.
 * Skips when another instance holds the job lock.
 *
 * @param {Date} [now=new Date()]
 * @returns {Promise<{ skipped: boolean, warned: number, deleted: number, failed: number }>}
 */
export async function runInactiveAccountCleanup(now = new Date()) {
  const summary = { skipped: false, warned: 0, deleted: 0, failed: 0 }
  // Advisory locks belong to one connection, so hold a dedicated client for the run.
  const lockClient = await getPool().connect()
  const { rows: lock } = await lockClient.query('SELECT pg_try_advisory_lock($1) AS ok', [
    JOB_LOCK_KEY,
  ])
  if (!lock[0]?.ok) {
    lockClient.release()
    return { ...summary, skipped: true }
  }

  try {
    const firstWarning = INACTIVITY_LIMIT_DAYS - WARNING_DAYS[0]
    const { rows } = await query(
      `SELECT id, username, email, profile_picture, last_active_at, inactivity_warning_days
       FROM users
       WHERE is_demo = false
         AND last_active_at < $1::timestamptz - make_interval(days => $2)
       ORDER BY last_active_at`,
      [now, firstWarning],
    )

    for (const row of rows) {
      try {
        const plan = planInactivityAction(
          new Date(row.last_active_at),
          row.inactivity_warning_days,
          now,
        )
        if (plan.action === 'warn') {
          await sendInactivityWarning(row, plan.daysLeft, plan.deleteAt)
          await query('UPDATE users SET inactivity_warning_days = $2 WHERE id = $1', [
            row.id,
            plan.stage,
          ])
          summary.warned += 1
        } else if (plan.action === 'delete') {
          if (await deleteInactiveAccount(row)) {
            summary.deleted += 1
            await sendInactiveAccountDeleted(row).catch((error) =>
              console.error('Failed to send deletion notice:', error.message),
            )
          }
        }
      } catch (error) {
        summary.failed += 1
        console.error(`Inactive account cleanup failed for ${row.id}:`, error.message)
      }
    }
  } finally {
    await lockClient.query('SELECT pg_advisory_unlock($1)', [JOB_LOCK_KEY]).catch(() => {})
    lockClient.release()
  }
  if (summary.warned || summary.deleted || summary.failed) {
    console.log('Inactive account cleanup:', summary)
  }
  return summary
}

/**
 * Schedule the daily cleanup when enabled.
 * @returns {import('node-cron').ScheduledTask | null}
 */
export function startInactiveAccountScheduler() {
  const flag = process.env.ACCOUNT_CLEANUP_ENABLED
  const enabled = flag === 'true' || (flag !== 'false' && process.env.NODE_ENV === 'production')
  if (!enabled) {
    console.log('Inactive account cleanup disabled (set ACCOUNT_CLEANUP_ENABLED=true to enable)')
    return null
  }
  const schedule = process.env.ACCOUNT_CLEANUP_CRON || DEFAULT_CRON
  if (!cron.validate(schedule)) {
    console.error(`Invalid ACCOUNT_CLEANUP_CRON "${schedule}"; cleanup not scheduled`)
    return null
  }
  return cron.schedule(
    schedule,
    () => {
      runInactiveAccountCleanup().catch((error) =>
        console.error('Inactive account cleanup failed:', error),
      )
    },
    { timezone: 'UTC' },
  )
}
