/**
 * Cron wrapper around DatabasePopulator for hourly TMDB/MAL catalog refresh.
 * Domain service: start/stop scheduling, overlap guard, and last-run status.
 * Mutates Content via populateDatabase with clear:false and the process PostgreSQL pool.
 */
import cron from 'node-cron'
import DatabasePopulator from './contentSyncService.js'

const DEFAULT_CRON = '0 * * * *'
const DEFAULT_TMDB_LIMIT = 40
const DEFAULT_MAL_LIMIT = 40

let isRunning = false
let lastSync = null
let scheduledTask = null

/**
 * Positive integer from env, else fallback.
 * @param {string | undefined} value
 * @param {number} fallback
 * @returns {number}
 */
function parseLimit(value, fallback) {
  const parsed = parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

/**
 * CONTENT_SYNC_ENABLED overrides; otherwise on in production and off in development.
 * @returns {boolean}
 */
function isSyncEnabled() {
  if (process.env.CONTENT_SYNC_ENABLED === 'false') return false
  if (process.env.CONTENT_SYNC_ENABLED === 'true') return true
  return process.env.NODE_ENV === 'production'
}

/**
 * @returns {boolean}
 */
function hasExternalApiKeys() {
  return Boolean(process.env.TMDB_API_KEY || process.env.MAL_CLIENT_ID)
}

/**
 * Snapshot for health/admin endpoints.
 * @returns {{ enabled: boolean, running: boolean, schedule: string, lastSync: object | null }}
 */
export function getContentSyncStatus() {
  return {
    enabled: isSyncEnabled(),
    running: isRunning,
    schedule: process.env.CONTENT_SYNC_CRON || DEFAULT_CRON,
    lastSync,
  }
}

/**
 * Run one populate pass. Skips if another run is in flight or API keys are missing.
 * Does not drop existing Content (`clear: false`).
 * @param {string} [trigger='manual'] - `manual` | `scheduled` | `startup`
 * @returns {Promise<object>} lastSync payload or `{ skipped, reason }`
 */
export async function runContentSync(trigger = 'manual') {
  if (isRunning) {
    console.warn(`Content sync skipped (${trigger}): already running`)
    return { skipped: true, reason: 'already_running' }
  }

  if (!hasExternalApiKeys()) {
    console.warn(`Content sync skipped (${trigger}): TMDB_API_KEY / MAL_CLIENT_ID not configured`)
    return { skipped: true, reason: 'missing_api_keys' }
  }

  isRunning = true
  const startedAt = new Date()
  const tmdbLimit = parseLimit(process.env.CONTENT_SYNC_TMDB_LIMIT, DEFAULT_TMDB_LIMIT)
  const malLimit = parseLimit(process.env.CONTENT_SYNC_MAL_LIMIT, DEFAULT_MAL_LIMIT)

  try {
    console.log(
      `Content sync starting (${trigger}): TMDB=${tmdbLimit}, MAL=${malLimit}`,
    )

    const populator = new DatabasePopulator()
    const stats = await populator.populateDatabase({
      tmdbLimit,
      malLimit,
      clear: false,
      manageConnection: false,
      skipTmdb: !process.env.TMDB_API_KEY,
      skipMal: !process.env.MAL_CLIENT_ID,
    })

    lastSync = {
      trigger,
      status: 'success',
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      stats,
    }

    console.log('Content sync completed:', stats)
    return lastSync
  } catch (error) {
    lastSync = {
      trigger,
      status: 'error',
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      error: error.message,
    }
    console.error('Content sync failed:', error)
    return lastSync
  } finally {
    isRunning = false
  }
}

/**
 * Register the cron task when sync is enabled and keys exist.
 * Env knobs: CONTENT_SYNC_ENABLED, CONTENT_SYNC_CRON (default hourly),
 * CONTENT_SYNC_TMDB_LIMIT / CONTENT_SYNC_MAL_LIMIT,
 * CONTENT_SYNC_RUN_ON_START plus CONTENT_SYNC_START_DELAY_MS.
 * @returns {import('node-cron').ScheduledTask | null}
 */
export function startContentSyncScheduler() {
  if (!isSyncEnabled()) {
    console.log('Content sync scheduler disabled (set CONTENT_SYNC_ENABLED=true to enable)')
    return null
  }

  if (!hasExternalApiKeys()) {
    console.warn('Content sync scheduler not started: missing TMDB_API_KEY / MAL_CLIENT_ID')
    return null
  }

  const schedule = process.env.CONTENT_SYNC_CRON || DEFAULT_CRON
  if (!cron.validate(schedule)) {
    console.error(`Invalid CONTENT_SYNC_CRON "${schedule}" — scheduler not started`)
    return null
  }

  if (scheduledTask) {
    return scheduledTask
  }

  scheduledTask = cron.schedule(schedule, () => {
    void runContentSync('scheduled')
  })

  console.log(`Content sync scheduled (${schedule})`)

  if (process.env.CONTENT_SYNC_RUN_ON_START === 'true') {
    const delayMs = parseLimit(process.env.CONTENT_SYNC_START_DELAY_MS, 20000)
    console.log(`Content sync will run on start in ${delayMs}ms`)
    setTimeout(() => {
      void runContentSync('startup')
    }, delayMs)
  }

  return scheduledTask
}

export default {
  startContentSyncScheduler,
  runContentSync,
  getContentSyncStatus,
}
