/**
 * Site metrics: page views and clicks reported by the app, and the admin Metrics tab.
 *
 * Layer: services. The app batches events (src/services/metrics.ts) and posts them to
 * `POST /api/metrics/events`; they land in `site_events`. Visitors are counted by a random
 * id the browser keeps, not by IP. Bots that announce themselves are skipped. Fails open:
 * a missing table or a database error never breaks the page that reported the event.
 */

import cron from 'node-cron'
import { query } from '../../config/postgres.js'
import { withJobLock } from '../utils/jobLock.js'

const EVENT_TYPES = ['view', 'click']
const MAX_EVENTS = 25
const RETENTION_DAYS = 400
const DEFAULT_DAYS = 30
const MAX_DAYS = 365
const TOP_LIMIT = 15
const BOT_AGENT = /bot|crawl|spider|slurp|headless|lighthouse|preview|curl|wget|python|axios/i
const VISITOR_ID = /^[A-Za-z0-9-]{8,64}$/

/**
 * @param {unknown} value
 * @param {number} max
 * @returns {string | null} Trimmed text cut to `max`, or null when empty.
 */
function clip(value, max) {
  const text = typeof value === 'string' ? value.trim().slice(0, max) : ''
  return text || null
}

/**
 * Host of an external referrer URL (`www.` dropped), or null for none/our own site.
 * @param {unknown} value
 * @returns {string | null}
 */
export function referrerHost(value) {
  if (typeof value !== 'string' || !value) return null
  try {
    const host = new URL(value).hostname.replace(/^www\./, '').toLowerCase()
    if (!host || host === 'localhost' || host.endsWith('anilounge.net')) return null
    return host.slice(0, 200)
  } catch {
    return null
  }
}

/**
 * Valid events from a request body, at most MAX_EVENTS. Paths keep only the pathname.
 * @param {unknown} events
 * @returns {Array<{ type: string, path: string, target: string | null, referrer: string | null }>}
 */
export function normalizeEvents(events) {
  if (!Array.isArray(events)) return []
  return events
    .slice(0, MAX_EVENTS)
    .map((event) => {
      const path = clip(event?.path, 300)?.split(/[?#]/)[0]
      if (!EVENT_TYPES.includes(event?.type) || !path?.startsWith('/')) return null
      return {
        type: event.type,
        path,
        target: event.type === 'click' ? clip(event.target, 200) : null,
        referrer: event.type === 'view' ? referrerHost(event.referrer) : null,
      }
    })
    .filter((event) => event && (event.type === 'view' || event.target))
}

/**
 * Store a batch of events for one visitor. Ignores bots and malformed input.
 * @param {import('express').Request} req - `body.visitorId`, `body.events`; `req.user` when signed in.
 * @returns {Promise<number>} How many events were stored.
 */
export async function recordEvents(req) {
  if (BOT_AGENT.test(req.get('User-Agent') || '')) return 0
  const visitorId = typeof req.body?.visitorId === 'string' ? req.body.visitorId : ''
  if (!VISITOR_ID.test(visitorId)) return 0
  const events = normalizeEvents(req.body?.events)
  if (!events.length) return 0

  try {
    await query(
      `INSERT INTO site_events (type, path, target, referrer, visitor_id, user_id)
       SELECT e.type, e.path, e.target, e.referrer, $2, $3
       FROM jsonb_to_recordset($1::jsonb) AS e(type TEXT, path TEXT, target TEXT, referrer TEXT)`,
      [JSON.stringify(events), visitorId, req.user?._id || null],
    )
    return events.length
  } catch (error) {
    if (error.code !== '42P01') console.error('Metrics insert failed:', error.message)
    else console.warn('site_events table missing; run npm run db:schema to record metrics')
    return 0
  }
}

/**
 * Event queries for the dashboard; empty results before the table exists.
 * @param {string} sql
 * @param {unknown[]} params
 * @returns {Promise<Array<Record<string, any>>>}
 */
async function eventRows(sql, params) {
  try {
    return (await query(sql, params)).rows
  } catch (error) {
    if (error.code === '42P01') return []
    throw error
  }
}

/**
 * Totals, a daily series, and top lists for the last `days` days (UTC).
 * @param {{ days?: unknown }} [params]
 * @returns {Promise<object>}
 */
export async function getMetrics({ days } = {}) {
  const range = Math.min(Math.max(Math.trunc(Number(days)) || DEFAULT_DAYS, 1), MAX_DAYS)
  const since = `(((now() AT TIME ZONE 'UTC')::date - ${range - 1}) AT TIME ZONE 'UTC')`

  const [userTotals, eventTotals, signups, daily, pages, clicks, referrers] = await Promise.all([
    query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE created_at >= ${since})::int AS new,
              count(*) FILTER (WHERE last_active_at >= ${since})::int AS active
       FROM users WHERE is_demo = false`,
    ).then(({ rows }) => rows[0]),
    eventRows(
      `SELECT count(*) FILTER (WHERE type = 'view')::int AS views,
              count(*) FILTER (WHERE type = 'click')::int AS clicks,
              count(DISTINCT visitor_id)::int AS visitors,
              count(DISTINCT user_id)::int AS "signedIn"
       FROM site_events WHERE created_at >= ${since}`,
      [],
    ),
    query(
      `SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, count(*)::int AS n
       FROM users WHERE is_demo = false AND created_at >= ${since} GROUP BY 1`,
    ).then(({ rows }) => rows),
    eventRows(
      `SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
              count(*) FILTER (WHERE type = 'view')::int AS views,
              count(*) FILTER (WHERE type = 'click')::int AS clicks,
              count(DISTINCT visitor_id)::int AS visitors
       FROM site_events WHERE created_at >= ${since} GROUP BY 1`,
      [],
    ),
    eventRows(
      `SELECT path, count(*)::int AS views, count(DISTINCT visitor_id)::int AS visitors
       FROM site_events WHERE type = 'view' AND created_at >= ${since}
       GROUP BY path ORDER BY views DESC LIMIT $1`,
      [TOP_LIMIT],
    ),
    eventRows(
      `SELECT target, count(*)::int AS clicks, count(DISTINCT visitor_id)::int AS visitors
       FROM site_events WHERE type = 'click' AND created_at >= ${since}
       GROUP BY target ORDER BY clicks DESC LIMIT $1`,
      [TOP_LIMIT],
    ),
    eventRows(
      `SELECT referrer AS host, count(DISTINCT visitor_id)::int AS visitors
       FROM site_events WHERE type = 'view' AND referrer IS NOT NULL AND created_at >= ${since}
       GROUP BY referrer ORDER BY visitors DESC LIMIT $1`,
      [TOP_LIMIT],
    ),
  ])

  const signupsByDay = new Map(signups.map((row) => [row.day, row.n]))
  const eventsByDay = new Map(daily.map((row) => [row.day, row]))
  const today = new Date()
  const series = Array.from({ length: range }, (_, index) => {
    const date = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate() - (range - 1 - index),
      ),
    )
    const day = date.toISOString().slice(0, 10)
    const events = eventsByDay.get(day)
    return {
      day,
      views: events?.views || 0,
      visitors: events?.visitors || 0,
      clicks: events?.clicks || 0,
      signups: signupsByDay.get(day) || 0,
    }
  })

  const totals = eventTotals[0] || { views: 0, clicks: 0, visitors: 0, signedIn: 0 }
  return {
    days: range,
    users: userTotals,
    totals,
    series,
    pages,
    clicks,
    referrers,
  }
}

/**
 * Delete events past the retention window.
 * @returns {Promise<void>}
 */
export async function pruneSiteEvents() {
  await query(`DELETE FROM site_events WHERE created_at < now() - make_interval(days => $1)`, [
    RETENTION_DAYS,
  ]).catch(() => {})
}

/**
 * Prune old events daily at 03:50 UTC on one instance.
 * @returns {import('node-cron').ScheduledTask}
 */
export function startSiteEventsCleanupScheduler() {
  return cron.schedule(
    '50 3 * * *',
    () => {
      withJobLock('site-events-cleanup', pruneSiteEvents, { minIntervalMs: 60 * 60_000 }).catch(
        (error) => console.error('Site events cleanup failed:', error.message),
      )
    },
    { timezone: 'UTC' },
  )
}
