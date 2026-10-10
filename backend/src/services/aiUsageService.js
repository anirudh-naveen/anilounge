/**
 * Daily cap on Gemini chat calls per account, or per IP when signed out, plus a
 * site-wide daily cap so a traffic spike or many accounts can't run up the bill.
 *
 * Layer: services. Each call is paid and slow, and the general rate limit alone would
 * let one client spend hundreds an hour. Counts live in `ai_usage`, so the caps hold
 * across server instances. Env: AI_DAILY_LIMIT_USER (default 200), AI_DAILY_LIMIT_ANON
 * (default 30), AI_DAILY_LIMIT_GLOBAL (default 3000 chats). Fails open if the table is
 * missing or the database errors; the Google Cloud budget is the hard backstop.
 */

import cron from 'node-cron'
import { query } from '../../config/postgres.js'
import { withJobLock } from '../utils/jobLock.js'
import { HttpError } from '../utils/httpError.js'

const DEFAULT_USER_LIMIT = 200
const DEFAULT_ANON_LIMIT = 30
const DEFAULT_GLOBAL_LIMIT = 3000
/** `ai_usage` subject for the site-wide count. */
export const GLOBAL_SUBJECT = 'all'

/** @returns {number} Chats allowed per UTC day across the whole site. */
export function globalAiLimit() {
  return Number(process.env.AI_DAILY_LIMIT_GLOBAL) || DEFAULT_GLOBAL_LIMIT
}

/**
 * Add one call to `subject`'s count for today.
 * @param {string} subject
 * @returns {Promise<number | null>} Today's count, or null when counting failed.
 */
async function countCall(subject) {
  try {
    const { rows } = await query(
      `INSERT INTO ai_usage (subject, day, calls) VALUES ($1, current_date, 1)
       ON CONFLICT (subject, day) DO UPDATE SET calls = ai_usage.calls + 1
       RETURNING calls`,
      [subject],
    )
    return rows[0].calls
  } catch (error) {
    if (error.code !== '42P01') console.error('AI usage count failed:', error.message)
    return null
  }
}

/**
 * @param {{ user?: { _id: unknown } | null, ip?: string }} req
 * @returns {{ subject: string, limit: number }}
 */
export function aiQuota(req) {
  if (req.user?._id) {
    return {
      subject: `u:${req.user._id}`,
      limit: Number(process.env.AI_DAILY_LIMIT_USER) || DEFAULT_USER_LIMIT,
    }
  }
  return {
    subject: `ip:${req.ip}`,
    limit: Number(process.env.AI_DAILY_LIMIT_ANON) || DEFAULT_ANON_LIMIT,
  }
}

/**
 * Count one AI call for the requester and the site today; throw 429 once either is
 * over its cap.
 * @param {import('express').Request} req
 * @returns {Promise<void>}
 */
export async function consumeAiCall(req) {
  const siteCalls = await countCall(GLOBAL_SUBJECT)
  if (siteCalls !== null && siteCalls > globalAiLimit()) {
    if (siteCalls === globalAiLimit() + 1) {
      console.warn(`AI assistant hit the site-wide daily cap (${globalAiLimit()} chats).`)
    }
    throw new HttpError(
      429,
      'The AI assistant is taking a break for today. It will be back tomorrow (UTC).',
    )
  }
  const { subject, limit } = aiQuota(req)
  const calls = await countCall(subject)
  if (calls === null) return
  if (calls > limit) {
    throw new HttpError(
      429,
      req.user
        ? "You've reached today's limit for the AI assistant. It resets tomorrow."
        : "Today's AI assistant limit for signed-out visitors is used up. Sign in for more.",
    )
  }
}

/**
 * Delete counts older than a week.
 * @returns {Promise<void>}
 */
export async function pruneAiUsage() {
  await query(`DELETE FROM ai_usage WHERE day < current_date - 7`).catch(() => {})
}

/**
 * Prune old counts daily at 03:40 UTC on one instance.
 * @returns {import('node-cron').ScheduledTask}
 */
export function startAiUsageCleanupScheduler() {
  return cron.schedule(
    '40 3 * * *',
    () => {
      withJobLock('ai-usage-cleanup', pruneAiUsage, { minIntervalMs: 60 * 60_000 }).catch(
        (error) => console.error('AI usage cleanup failed:', error.message),
      )
    },
    { timezone: 'UTC' },
  )
}
