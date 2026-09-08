import cron from 'node-cron'
import DatabasePopulator from './contentSyncService.js'

const DEFAULT_CRON = '0 * * * *' // top of every hour
const DEFAULT_TMDB_LIMIT = 40
const DEFAULT_MAL_LIMIT = 40

let isRunning = false
let lastSync = null
let scheduledTask = null

function parseLimit(value, fallback) {
  const parsed = parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function isSyncEnabled() {
  if (process.env.CONTENT_SYNC_ENABLED === 'false') return false
  if (process.env.CONTENT_SYNC_ENABLED === 'true') return true
  // Default: on in production, off in development
  return process.env.NODE_ENV === 'production'
}

function hasExternalApiKeys() {
  return Boolean(process.env.TMDB_API_KEY || process.env.MAL_CLIENT_ID)
}

export function getContentSyncStatus() {
  return {
    enabled: isSyncEnabled(),
    running: isRunning,
    schedule: process.env.CONTENT_SYNC_CRON || DEFAULT_CRON,
    lastSync,
  }
}

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
 * Starts the hourly TMDB/MAL catalog sync when enabled.
 * Env knobs:
 * - CONTENT_SYNC_ENABLED=true|false (default: on in production)
 * - CONTENT_SYNC_CRON (default: "0 * * * *")
 * - CONTENT_SYNC_TMDB_LIMIT / CONTENT_SYNC_MAL_LIMIT
 * - CONTENT_SYNC_RUN_ON_START=true to sync shortly after boot
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
