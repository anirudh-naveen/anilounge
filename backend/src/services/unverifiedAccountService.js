/**
 * Unverified sign-up cleanup.
 *
 * Layer: service. Sign-ups that never verify their email are deleted 3 days after
 * sign-up. One day before, the user is emailed a reminder with a fresh code. Only
 * accounts flagged `pending_signup` at registration are considered, so established
 * accounts that change their email are never removed, and the demo account is exempt.
 *
 * Runs hourly when ACCOUNT_CLEANUP_ENABLED is on (default: production only);
 * override the schedule with UNVERIFIED_CLEANUP_CRON.
 */

import fs from 'fs'
import path from 'path'
import cron from 'node-cron'
import { getPool, query } from '../../config/postgres.js'
import { issueEmailCode } from './accountSecurityService.js'
import { sendVerificationReminder } from './emailService.js'

const HOUR_MS = 60 * 60 * 1000
export const UNVERIFIED_SIGNUP_TTL_MS = 72 * HOUR_MS
export const REMINDER_BEFORE_MS = 24 * HOUR_MS
const DEFAULT_CRON = '15 * * * *'
/** Distinct from the inactivity job's lock so the two can overlap. */
const JOB_LOCK_KEY = 815_072

/**
 * What the job should do for one pending sign-up.
 *
 * @param {Date} createdAt
 * @param {Date | null} reminderSentAt
 * @param {Date} [now=new Date()]
 * @returns {{ action: 'none' } | { action: 'remind', deleteAt: Date } | { action: 'delete' }}
 */
export function planUnverifiedAction(createdAt, reminderSentAt, now = new Date()) {
  const deleteAt = new Date(createdAt.getTime() + UNVERIFIED_SIGNUP_TTL_MS)
  const remaining = deleteAt.getTime() - now.getTime()
  if (remaining <= 0) return { action: 'delete' }
  if (remaining <= REMINDER_BEFORE_MS && !reminderSentAt) return { action: 'remind', deleteAt }
  return { action: 'none' }
}

/**
 * One pass: email due reminders and delete expired unverified sign-ups.
 * Skips when another instance holds the job lock.
 *
 * @param {Date} [now=new Date()]
 * @returns {Promise<{ skipped: boolean, reminded: number, deleted: number, failed: number }>}
 */
export async function runUnverifiedAccountCleanup(now = new Date()) {
  const summary = { skipped: false, reminded: 0, deleted: 0, failed: 0 }
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
    const { rows } = await query(
      `SELECT id, username, email, profile_picture, created_at, signup_reminder_sent_at
       FROM users
       WHERE pending_signup AND email_verified_at IS NULL AND is_demo = false
         AND created_at < $1::timestamptz - make_interval(secs => $2)
       ORDER BY created_at`,
      [now, (UNVERIFIED_SIGNUP_TTL_MS - REMINDER_BEFORE_MS) / 1000],
    )

    for (const row of rows) {
      try {
        const plan = planUnverifiedAction(
          new Date(row.created_at),
          row.signup_reminder_sent_at ? new Date(row.signup_reminder_sent_at) : null,
          now,
        )
        if (plan.action === 'remind') {
          const code = await issueEmailCode(row.id, 'verify_email')
          await sendVerificationReminder(row, code, plan.deleteAt)
          await query('UPDATE users SET signup_reminder_sent_at = now() WHERE id = $1', [row.id])
          summary.reminded += 1
        } else if (plan.action === 'delete') {
          // Re-check in SQL so a verification that lands mid-run is never deleted.
          const result = await query(
            `DELETE FROM users
             WHERE id = $1 AND pending_signup AND email_verified_at IS NULL AND is_demo = false`,
            [row.id],
          )
          if (result.rowCount) {
            summary.deleted += 1
            if (row.profile_picture && !row.profile_picture.startsWith('http')) {
              const file = path.join(
                process.cwd(),
                'uploads',
                'profiles',
                path.basename(row.profile_picture),
              )
              fs.promises.unlink(file).catch(() => {})
            }
          }
        }
      } catch (error) {
        summary.failed += 1
        console.error(`Unverified sign-up cleanup failed for ${row.id}:`, error.message)
      }
    }
  } finally {
    await lockClient.query('SELECT pg_advisory_unlock($1)', [JOB_LOCK_KEY]).catch(() => {})
    lockClient.release()
  }
  if (summary.reminded || summary.deleted || summary.failed) {
    console.log('Unverified sign-up cleanup:', summary)
  }
  return summary
}

/**
 * Schedule the hourly cleanup when account cleanup is enabled.
 * @returns {import('node-cron').ScheduledTask | null}
 */
export function startUnverifiedAccountScheduler() {
  const flag = process.env.ACCOUNT_CLEANUP_ENABLED
  const enabled = flag === 'true' || (flag !== 'false' && process.env.NODE_ENV === 'production')
  if (!enabled) return null
  const schedule = process.env.UNVERIFIED_CLEANUP_CRON || DEFAULT_CRON
  if (!cron.validate(schedule)) {
    console.error(`Invalid UNVERIFIED_CLEANUP_CRON "${schedule}"; cleanup not scheduled`)
    return null
  }
  return cron.schedule(
    schedule,
    () => {
      runUnverifiedAccountCleanup().catch((error) =>
        console.error('Unverified sign-up cleanup failed:', error),
      )
    },
    { timezone: 'UTC' },
  )
}
