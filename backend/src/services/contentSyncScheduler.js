/**
 * Cron wrapper around DatabasePopulator for hourly TMDB/MAL catalog refresh, plus a
 * re-import of airing shows' seasons and episodes, and of the Upcoming (MAL) and
 * In Theatres (TMDB) lists, every six hours (catalogImport.js, contentSyncService.js).
 * Domain service: start/stop scheduling, overlap guard, and last-run status.
 * Mutates Content via populateDatabase with clear:false and the process PostgreSQL pool.
 */
import cron from 'node-cron'
import { withJobLock } from '../utils/jobLock.js'
import DatabasePopulator, {
  ingestMalRankingByTypes,
  ingestTmdbNowPlayingMovies,
} from './contentSyncService.js'
import { refreshAiringSeries } from './catalogImport.js'
import { hasSeriesStructure } from './seriesStructure.js'

const DEFAULT_CRON = '0 * * * *'
/** Airing shows' episodes and schedules are re-imported this often. */
const AIRING_REFRESH_MS = 6 * 60 * 60 * 1000
const DEFAULT_TMDB_LIMIT = 40
const DEFAULT_MAL_LIMIT = 40

let isRunning = false
let lastSync = null
let scheduledTask = null
let lastAiringRefresh = 0
let lastListRefresh = 0

/**
 * Re-import the Upcoming and In Theatres lists the catalog tabs show. Each source
 * failing is logged and leaves the stored list as it is.
 * @returns {Promise<{ upcoming: boolean, theatres: boolean }>} Which lists were refreshed.
 */
async function refreshCatalogLists() {
  const result = { upcoming: false, theatres: false }
  if (process.env.MAL_CLIENT_ID) {
    try {
      await ingestMalRankingByTypes('upcoming', 50, ['tv'])
      await ingestMalRankingByTypes('upcoming', 50, ['movie', 'special'])
      result.upcoming = true
    } catch (error) {
      console.error('Upcoming list refresh failed:', error.message)
    }
  }
  if (process.env.TMDB_API_KEY) {
    try {
      await ingestTmdbNowPlayingMovies(40)
      result.theatres = true
    } catch (error) {
      console.error('In-theatres list refresh failed:', error.message)
    }
  }
  return result
}

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
    console.log(`Content sync starting (${trigger}): TMDB=${tmdbLimit}, MAL=${malLimit}`)

    const populator = new DatabasePopulator()
    const stats = await populator.populateDatabase({
      tmdbLimit,
      malLimit,
      clear: false,
      manageConnection: false,
      skipTmdb: !process.env.TMDB_API_KEY,
      skipMal: !process.env.MAL_CLIENT_ID,
    })

    let airing = null
    if (Date.now() - lastAiringRefresh >= AIRING_REFRESH_MS && (await hasSeriesStructure())) {
      lastAiringRefresh = Date.now()
      airing = await refreshAiringSeries()
    }

    let lists = null
    if (Date.now() - lastListRefresh >= AIRING_REFRESH_MS) {
      lastListRefresh = Date.now()
      lists = await refreshCatalogLists()
    }

    lastSync = {
      trigger,
      status: 'success',
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      stats,
      airing,
      lists,
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

  // With several instances, only one runs each hour's sync (utils/jobLock.js).
  scheduledTask = cron.schedule(schedule, () => {
    withJobLock('content-sync', () => runContentSync('scheduled'), {
      ttlMs: 2 * 60 * 60_000,
      minIntervalMs: 50 * 60_000,
    }).catch((error) => console.error('Content sync lock failed:', error.message))
  })

  console.log(`Content sync scheduled (${schedule})`)

  if (process.env.CONTENT_SYNC_RUN_ON_START === 'true') {
    const delayMs = parseLimit(process.env.CONTENT_SYNC_START_DELAY_MS, 20000)
    console.log(`Content sync will run on start in ${delayMs}ms`)
    setTimeout(() => {
      withJobLock('content-sync', () => runContentSync('startup'), {
        ttlMs: 2 * 60 * 60_000,
        minIntervalMs: 50 * 60_000,
      }).catch((error) => console.error('Content sync lock failed:', error.message))
    }, delayMs)
  }

  return scheduledTask
}
