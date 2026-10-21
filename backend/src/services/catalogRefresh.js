/**
 * Recurring catalog refresh: fetches from AniList, TMDB, and MAL what page loads
 * found missing or stale, so no page waits on an outside service.
 *
 * Layer: domain service. Pages queue requests (refreshRequests.js); every run claims
 * the oldest ones and calls the same sync code pages used to call inline, for as long
 * as RUN_BUDGET_MS allows (AniList's shared rate limit paces the calls). Saves go
 * through the models, so admin-locked fields and removed links stay as curated.
 *
 * Env knobs: CATALOG_REFRESH_ENABLED (default on), CATALOG_REFRESH_CRON (default
 * every 5 minutes).
 */
import cron from 'node-cron'
import Content from '../models/Content.js'
import Entity from '../models/Entity.js'
import { withJobLock } from '../utils/jobLock.js'
import {
  ensureCharacterAbout,
  ensureCharactersForContent,
  ensureStudioDetails,
  ensureVoiceActorAbout,
  ensureVoiceActorCredits,
  markCastFetched,
} from './entityService.js'
import { claimRefreshRequests } from './refreshRequests.js'
import { refreshSeasonGuide } from './seasonService.js'
import unifiedContentService from './unifiedContentService.js'
import { refreshWatchSources } from './watchProviderService.js'

const DEFAULT_CRON = '*/5 * * * *'
/** A run stops claiming new requests after this long; the rest wait for the next run. */
const RUN_BUDGET_MS = 4 * 60 * 1000
const BATCH_SIZE = 20

let scheduledTask = null
let lastRun = null

/** @type {Record<string, (id: string) => Promise<void>>} */
const handlers = {
  cast: async (id) => {
    const content = await Content.findById(id)
    if (!content) return
    await ensureCharactersForContent(content, { force: true })
    await markCastFetched(id)
  },
  character: async (id) => {
    const entity = await Entity.findById(id)
    if (entity) await ensureCharacterAbout(entity)
  },
  voice_actor: async (id) => {
    const entity = await Entity.findById(id)
    if (!entity) return
    await ensureVoiceActorAbout(entity)
    await ensureVoiceActorCredits(entity)
  },
  studio: async (id) => {
    const entity = await Entity.findById(id)
    if (entity) await ensureStudioDetails(entity, { force: true })
  },
  airing: async (id) => {
    const content = await Content.findById(id)
    if (content && (await unifiedContentService.refreshAiringSchedule(content))) {
      await content.save()
    }
  },
  episode_guide: refreshSeasonGuide,
  watch: refreshWatchSources,
}

/**
 * Work through queued requests until the queue is empty or the run budget is spent.
 * @param {{ budgetMs?: number, claim?: typeof claimRefreshRequests }} [options]
 * @returns {Promise<{ done: number, failed: number }>}
 */
export async function runCatalogRefresh({
  budgetMs = RUN_BUDGET_MS,
  claim = claimRefreshRequests,
} = {}) {
  const startedAt = Date.now()
  let done = 0
  let failed = 0
  while (Date.now() - startedAt < budgetMs) {
    const batch = await claim(BATCH_SIZE)
    if (!batch.length) break
    for (const { kind, id } of batch) {
      try {
        await handlers[kind]?.(id)
        done += 1
      } catch (error) {
        failed += 1
        console.error(`Catalog refresh (${kind} ${id}) failed:`, error.message)
      }
    }
  }
  lastRun = { finishedAt: new Date().toISOString(), done, failed }
  return { done, failed }
}

/**
 * @returns {{ lastRun: object | null }} For the health endpoint.
 */
export function getCatalogRefreshStatus() {
  return { lastRun }
}

/**
 * Start the recurring refresh. Call once at server start.
 * @returns {boolean} Whether it is enabled.
 */
export function startCatalogRefresh() {
  if (process.env.CATALOG_REFRESH_ENABLED === 'false') {
    console.log('Catalog refresh disabled (CATALOG_REFRESH_ENABLED=false)')
    return false
  }
  const schedule = process.env.CATALOG_REFRESH_CRON || DEFAULT_CRON
  if (!cron.validate(schedule)) {
    console.error(`Invalid CATALOG_REFRESH_CRON "${schedule}"; catalog refresh not started`)
    return false
  }
  if (scheduledTask) return true
  // One instance at a time (utils/jobLock.js).
  scheduledTask = cron.schedule(schedule, () => {
    withJobLock('catalog-refresh', () => runCatalogRefresh(), {
      ttlMs: RUN_BUDGET_MS + 10 * 60_000,
    }).catch((error) => console.error('Catalog refresh failed:', error.message))
  })
  console.log(`Catalog refresh scheduled (${schedule})`)
  return true
}
