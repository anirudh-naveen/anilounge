/**
 * Background catalog upkeep, so franchises and duplicate characters never need a
 * script run by hand.
 *
 * Each run groups loose titles into franchises (franchiseBuilder.js), then merges
 * duplicate characters only in the franchises that gained titles. Runs on its own
 * cron (independent of the TMDB/MAL sync, which needs API keys) and a few minutes
 * after any title is added, however it was added (sync, import, lookup). A daily
 * full pass merges duplicates in every franchise, catching anything the quick
 * passes missed (the per-title merge only runs when a cast is refreshed).
 *
 * Env knobs: CATALOG_MAINTENANCE_ENABLED (default on), CATALOG_MAINTENANCE_CRON
 * (default hourly at :30), CATALOG_MAINTENANCE_FULL_CRON (default 04:00 daily),
 * CATALOG_MAINTENANCE_DELAY_MS (default 2 minutes).
 */
import cron from 'node-cron'
import catalogEvents from './catalogEvents.js'
import { mergeAllFranchiseCharacters, mergeFranchiseCharactersForWork } from './characterMerge.js'
import { applyFranchisePlan, loadFranchisePlan } from './franchiseBuilder.js'

const DEFAULT_CRON = '30 * * * *'
const DEFAULT_FULL_CRON = '0 4 * * *'
const DEFAULT_DELAY_MS = 2 * 60 * 1000

let running = null
let lastRun = null
let scheduledTask = null
let fullTask = null
let trigger = null

/**
 * One maintenance pass. Overlapping calls share the pass already in flight.
 * @param {string} [reason='manual']
 * @param {{ full?: boolean }} [options] - `full` merges characters in every franchise.
 * @returns {Promise<object>} Summary of the pass.
 */
export function runCatalogMaintenance(reason = 'manual', { full = false } = {}) {
  if (!running) {
    running = maintain(reason, full).finally(() => {
      running = null
    })
  }
  return running
}

async function maintain(reason, full) {
  const startedAt = new Date()
  try {
    const franchises = await applyFranchisePlan(await loadFranchisePlan())
    let charactersMerged = full ? await mergeAllFranchiseCharacters() : 0
    for (const workId of full ? [] : franchises.changedWorkIds) {
      try {
        charactersMerged += await mergeFranchiseCharactersForWork(workId)
      } catch (error) {
        console.error(`Character merge failed for ${workId}:`, error.message)
      }
    }
    lastRun = {
      reason,
      full,
      status: 'success',
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      franchisesCreated: franchises.created,
      titlesGrouped: franchises.added,
      charactersMerged,
    }
    if (franchises.added || charactersMerged) {
      console.log(
        `Catalog maintenance (${reason}): ${franchises.created} franchises created, ` +
          `${franchises.added} titles grouped, ${charactersMerged} characters merged`,
      )
    }
  } catch (error) {
    console.error(`Catalog maintenance failed (${reason}):`, error.message)
    lastRun = {
      reason,
      status: 'error',
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      error: error.message,
    }
  }
  return lastRun
}

/**
 * Debounced trigger: many calls within `delayMs` collapse into one `run` call,
 * so a 500-title import runs maintenance once, after it settles.
 * @param {{ run: (reason: string) => unknown, delayMs: number }} options
 * @returns {{ request: (reason: string) => void, cancel: () => void }}
 */
export function createDebouncedTrigger({ run, delayMs }) {
  let timer = null
  let reasons = new Set()
  return {
    request(reason) {
      reasons.add(reason)
      if (timer) return
      timer = setTimeout(() => {
        timer = null
        const label = [...reasons].join(', ')
        reasons = new Set()
        run(label)
      }, delayMs)
      // Never keep the process alive just for this.
      timer.unref?.()
    },
    cancel() {
      if (timer) clearTimeout(timer)
      timer = null
      reasons = new Set()
    },
  }
}

/**
 * @returns {{ running: boolean, lastRun: object | null }} For the health endpoint.
 */
export function getCatalogMaintenanceStatus() {
  return { running: Boolean(running), lastRun }
}

/**
 * Start the cron and the title-added trigger. Call once at server start.
 * @returns {boolean} Whether maintenance is enabled.
 */
export function startCatalogMaintenance() {
  if (process.env.CATALOG_MAINTENANCE_ENABLED === 'false') {
    console.log('Catalog maintenance disabled (CATALOG_MAINTENANCE_ENABLED=false)')
    return false
  }
  const schedule = process.env.CATALOG_MAINTENANCE_CRON || DEFAULT_CRON
  if (!cron.validate(schedule)) {
    console.error(`Invalid CATALOG_MAINTENANCE_CRON "${schedule}"; catalog maintenance not started`)
    return false
  }
  if (scheduledTask) return true

  const delayMs = Number(process.env.CATALOG_MAINTENANCE_DELAY_MS) || DEFAULT_DELAY_MS
  trigger = createDebouncedTrigger({ run: runCatalogMaintenance, delayMs })
  catalogEvents.on('title-added', () => trigger.request('title added'))
  scheduledTask = cron.schedule(schedule, () => {
    void runCatalogMaintenance('scheduled')
  })
  const fullSchedule = process.env.CATALOG_MAINTENANCE_FULL_CRON || DEFAULT_FULL_CRON
  if (cron.validate(fullSchedule)) {
    fullTask = cron.schedule(fullSchedule, () => {
      void runCatalogMaintenance('daily full pass', { full: true })
    })
  } else {
    console.error(`Invalid CATALOG_MAINTENANCE_FULL_CRON "${fullSchedule}"; no daily full pass`)
  }
  console.log(
    `Catalog maintenance scheduled (${schedule}, full pass ${fullTask ? fullSchedule : 'off'}), ` +
      `and ${delayMs}ms after new titles`,
  )
  return true
}
