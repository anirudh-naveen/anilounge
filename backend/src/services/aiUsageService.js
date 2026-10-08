/**
 * Daily cap on Gemini calls (AI search and chat) per account, or per IP when signed out.
 *
 * Layer: services. Each call is paid and slow, and the general rate limit alone would
 * let one client spend hundreds an hour. Counts live in `ai_usage`, so the cap holds
 * across server instances. Env: AI_DAILY_LIMIT_USER (default 200), AI_DAILY_LIMIT_ANON
 * (default 30). Fails open if the table is missing or the database errors.
 */

import cron from 'node-cron'
import { query } from '../../config/postgres.js'
import { withJobLock } from '../utils/jobLock.js'
import { HttpError } from '../utils/httpError.js'

const DEFAULT_USER_LIMIT = 200
const DEFAULT_ANON_LIMIT = 30

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
 * Count one AI call for the requester today; throw 429 once over the cap.
 * @param {import('express').Request} req
 * @returns {Promise<void>}
 */
export async function consumeAiCall(req) {
  const { subject, limit } = aiQuota(req)
  let calls
  try {
    const { rows } = await query(
      `INSERT INTO ai_usage (subject, day, calls) VALUES ($1, current_date, 1)
       ON CONFLICT (subject, day) DO UPDATE SET calls = ai_usage.calls + 1
       RETURNING calls`,
      [subject],
    )
    calls = rows[0].calls
  } catch (error) {
    if (error.code !== '42P01') console.error('AI usage count failed:', error.message)
    return
  }
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
