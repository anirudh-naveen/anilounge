/**
 * Watch history: how many episodes (or, for movies, watches) a user got through on
 * which day, per title.
 *
 * Layer: services. A watchlist row only holds where the user is now, so the profile
 * calendar (utils/profileStats.js) reads this log to place watch time on the days it
 * happened. Progress changes in the app log what they add (`manual`); imports log an
 * estimate spread between the source's start and finish dates (`import`), replaced on
 * each re-import. Changes saved in backlog mode (titles watched long ago) log `backlog`
 * units: they count toward the row but sit on no day of the calendar, unless the user
 * gave start/finish dates, which spread them like an import. Watch time a row has
 * beyond its logged units still falls on the row's last update, so rows from before
 * this log keep their old placement.
 */

import { query } from '../../config/postgres.js'

const DAY_MS = 86_400_000

let tableReady = false

/**
 * Whether `watch_events` exists (`npm run db:schema` adds it). Cached once true, so a
 * database that predates it keeps working, just without history.
 * @param {(text: string, params?: unknown[]) => Promise<import('pg').QueryResult>} [run]
 * @returns {Promise<boolean>}
 */
export async function hasWatchEvents(run = query) {
  if (tableReady) return true
  const { rows } = await run(`SELECT to_regclass('watch_events') IS NOT NULL AS ready`)
  tableReady = Boolean(rows[0]?.ready)
  return tableReady
}

/**
 * `YYYY-MM-DD` (UTC) of a date-ish value, or null.
 * @param {string|Date|null|undefined} value
 * @returns {string|null}
 */
function toDay(value) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10)
}

/**
 * Spread `units` evenly over the days from `start` to `end` (either may be missing:
 * everything then lands on the one known; with neither, nothing is placed). Days past
 * today are pulled back to today.
 * @param {number} units
 * @param {string|Date|null|undefined} startValue
 * @param {string|Date|null|undefined} endValue
 * @param {Date} [now=new Date()]
 * @returns {Array<{ day: string, units: number }>}
 */
export function spreadUnits(units, startValue, endValue, now = new Date()) {
  if (!(units > 0)) return []
  const today = toDay(now)
  let end = toDay(endValue) || toDay(startValue)
  let start = toDay(startValue) || end
  if (!end) return []
  if (end > today) end = today
  if (start > today) start = today
  if (start > end) [start, end] = [end, start]

  const startMs = Date.parse(`${start}T00:00:00Z`)
  const span = Math.round((Date.parse(`${end}T00:00:00Z`) - startMs) / DAY_MS)
  const byDay = new Map()
  for (let i = 0; i < units; i += 1) {
    const offset = units === 1 ? span : Math.round((i * span) / (units - 1))
    const day = new Date(startMs + offset * DAY_MS).toISOString().slice(0, 10)
    byDay.set(day, (byDay.get(day) || 0) + 1)
  }
  return [...byDay].map(([day, count]) => ({ day, units: count }))
}

/**
 * Estimate the days an imported row was watched: its units spread evenly from the
 * start date to the finish date (completed) or last update (in progress). With only
 * one end known, everything lands on it; with neither, nothing is estimated.
 * @param {{ status: string, current_episode: number, rewatch_count?: number, started_on?: string|null, completed_on?: string|null, updated_at?: string|null }} row
 * @param {Date} [now=new Date()]
 * @returns {Array<{ day: string, units: number }>}
 */
export function spreadImportedRow(row, now = new Date()) {
  const current = Number(row.current_episode || 0)
  const watches = 1 + Math.max(0, Number(row.rewatch_count) || 0)
  let units = 0
  if (row.status === 'completed') units = Math.max(current, 1) * watches
  else if (['watching', 'on_hold', 'dropped'].includes(row.status)) units = current
  const finish = row.status === 'completed' ? row.completed_on : null
  return spreadUnits(units, row.started_on, finish || row.updated_at, now)
}

/**
 * Log units watched today from an in-app progress change. Runs on the caller's
 * transaction when there is one.
 * @param {string} userId
 * @param {string} contentId
 * @param {number} units - Added units; nothing is logged unless positive.
 * @returns {Promise<void>}
 */
export async function recordWatch(userId, contentId, units) {
  if (!(units > 0) || !(await hasWatchEvents())) return
  await query(
    `INSERT INTO watch_events (user_id, content_id, watched_on, source, units)
     VALUES ($1, $2, (now() AT TIME ZONE 'UTC')::date, 'manual', $3)
     ON CONFLICT (user_id, content_id, watched_on, source)
       DO UPDATE SET units = watch_events.units + EXCLUDED.units`,
    [userId, contentId, Math.round(units)],
  )
}

/**
 * Log units from a change saved in backlog mode. With a start or finish date they are
 * spread over those days as in-app history; without, they are logged as `backlog`,
 * which counts toward the row but places nothing on the calendar.
 * @param {string} userId
 * @param {string} contentId
 * @param {number} units - Added units; nothing is logged unless positive.
 * @param {{ startedOn?: string|Date|null, completedOn?: string|Date|null }} dates
 * @returns {Promise<void>}
 */
export async function recordBacklog(userId, contentId, units, { startedOn, completedOn }) {
  if (!(units > 0) || !(await hasWatchEvents())) return
  const spread = spreadUnits(Math.round(units), startedOn, completedOn)
  const events = spread.length
    ? spread.map((event) => ({ ...event, source: 'manual' }))
    : [{ day: toDay(new Date()), units: Math.round(units), source: 'backlog' }]
  await query(
    `INSERT INTO watch_events (user_id, content_id, watched_on, source, units)
     SELECT $1, $2, e.day, e.source, e.units
     FROM jsonb_to_recordset($3::jsonb) AS e(day date, source text, units int)
     ON CONFLICT (user_id, content_id, watched_on, source)
       DO UPDATE SET units = watch_events.units + EXCLUDED.units`,
    [userId, contentId, JSON.stringify(events)],
  )
}

/**
 * Write estimated history for imported rows on the import's transaction client.
 * `replace` swaps out each title's earlier import estimate; otherwise titles that
 * already have any history are left alone (a backfill for rows that predate the log).
 * @param {import('pg').PoolClient} client
 * @param {string} userId
 * @param {object[]} rows - Import rows (see `spreadImportedRow`).
 * @param {{ replace: boolean }} options
 * @returns {Promise<void>}
 */
export async function writeImportedHistory(client, userId, rows, { replace }) {
  if (!rows.length || !(await hasWatchEvents((text, params) => client.query(text, params)))) {
    return
  }
  const ids = rows.map((row) => row.content_id)
  if (replace) {
    await client.query(
      `DELETE FROM watch_events
       WHERE user_id = $1 AND source = 'import' AND content_id = ANY($2::uuid[])`,
      [userId, ids],
    )
  }
  const events = rows.flatMap((row) =>
    spreadImportedRow(row).map(({ day, units }) => ({ content_id: row.content_id, day, units })),
  )
  if (!events.length) return
  await client.query(
    `INSERT INTO watch_events (user_id, content_id, watched_on, source, units)
     SELECT $1, e.content_id, e.day, 'import', e.units
     FROM jsonb_to_recordset($2::jsonb) AS e(content_id uuid, day date, units int)
     WHERE NOT EXISTS (
       SELECT 1 FROM watch_events h WHERE h.user_id = $1 AND h.content_id = e.content_id
     ) OR $3::boolean
     ON CONFLICT (user_id, content_id, watched_on, source)
       DO UPDATE SET units = EXCLUDED.units`,
    [userId, JSON.stringify(events), replace],
  )
}

/**
 * Move every user's history from one catalog title onto another (duplicate merges).
 * @param {string} fromId
 * @param {string} toId
 * @returns {Promise<void>}
 */
export async function moveWatchHistory(fromId, toId) {
  if (!(await hasWatchEvents())) return
  await query(
    `INSERT INTO watch_events (user_id, content_id, watched_on, source, units)
     SELECT user_id, $2, watched_on, source, units FROM watch_events WHERE content_id = $1
     ON CONFLICT (user_id, content_id, watched_on, source)
       DO UPDATE SET units = watch_events.units + EXCLUDED.units`,
    [fromId, toId],
  )
  await query('DELETE FROM watch_events WHERE content_id = $1', [fromId])
}

/**
 * Drop a title's history when it leaves the watchlist.
 * @param {string} userId
 * @param {string} contentId
 * @returns {Promise<void>}
 */
export async function clearWatchHistory(userId, contentId) {
  if (!(await hasWatchEvents())) return
  await query('DELETE FROM watch_events WHERE user_id = $1 AND content_id = $2', [
    userId,
    contentId,
  ])
}

/**
 * A user's history grouped by title. `placed` is false for backlog units, which have
 * no real day (`day` is just when they were logged).
 * @param {string} userId
 * @returns {Promise<Map<string, Array<{ day: string, units: number, placed: boolean }>>>}
 */
export async function loadWatchHistory(userId) {
  const byContent = new Map()
  if (!(await hasWatchEvents())) return byContent
  const { rows } = await query(
    `SELECT content_id::text AS content_id, to_char(watched_on, 'YYYY-MM-DD') AS day,
            sum(units)::int AS units, source <> 'backlog' AS placed
     FROM watch_events WHERE user_id = $1
     GROUP BY content_id, watched_on, source <> 'backlog'`,
    [userId],
  )
  for (const row of rows) {
    if (!byContent.has(row.content_id)) byContent.set(row.content_id, [])
    byContent.get(row.content_id).push({ day: row.day, units: row.units, placed: row.placed })
  }
  return byContent
}
