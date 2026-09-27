/**
 * Reload the catalog from TMDB, MyAnimeList (official API + Jikan), and AniList
 * and bring every connection in line with `db/schema.sql`.
 *
 * Phases (run in this order; pick a subset with --phases):
 *   backup      Copy catalog + user-link tables into a `backup_<stamp>` schema.
 *   repair      Restore titles overwritten by character saves, re-credit works
 *               of mis-named studios, drop link rows that break subtype rules.
 *   anilist     Link MAL titles to AniList; match TMDB-only East Asian titles on
 *               AniList and merge them into the MAL title they duplicate.
 *   import      Add AniList's most popular anime the catalog lacks (top
 *               --import-limit, default 1000), linked to MAL and TMDB, with
 *               relations, characters, and studios.
 *   titles      Re-fetch every movie/series/special from TMDB, MAL, and AniList;
 *               rebuild studio credits (MAL studios, then AniList animation
 *               studios, then TMDB companies), genres, aliases, MAL relations.
 *   characters  Re-ingest characters and voice actors for every title from
 *               Jikan and AniList (merged by id and name), TMDB credits otherwise.
 *   studios     Fill studio ids, logos, and about (Jikan, else TMDB); merge
 *               studio rows that resolve to the same MAL producer.
 *   cleanup     Merge titles whose names differ only by case/spacing, franchise
 *               characters, and same-name studios; enforce links, prune
 *               orphans, audit.
 *
 * Usage:
 *   npm run db:reload
 *   npm run db:reload -- --phases titles,characters --workers 4 --limit 50
 *   npm run db:reload -- --fresh     (ignore the resume checkpoint)
 *   npm run db:reload -- --phases backup,import,cleanup --import-limit 2000
 *
 * Progress is checkpointed to backend/logs/reload-checkpoint.json so an
 * interrupted run resumes where it stopped. Titles or studios whose sources
 * were unreachable stay unchecked so a rerun picks them up.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import { connectPostgres, closePostgres, query } from '../../config/postgres.js'
import Content from '../models/Content.js'
import Entity from '../models/Entity.js'
import DatabasePopulator from '../services/contentSyncService.js'
import unifiedContentService from '../services/unifiedContentService.js'
import {
  ensureCharactersForContent,
  ensureStudioDetails,
  jikanStatus,
  probeJikan,
} from '../services/entityService.js'
import {
  anilistStatus,
  configureAnilistCache,
  convertAnilistToContent,
  fetchAnilistMediaBatch,
  getAnilistMedia,
  probeAnilist,
} from '../services/anilistService.js'
import { bridgeTmdbTitles, linkMalTitles } from '../services/anilistLinking.js'
import { importPopularAnilist } from '../services/anilistImport.js'
import { mergeAllFranchiseCharacters } from '../services/characterMerge.js'
import * as repair from '../services/catalogRepair.js'

dotenv.config()
// The pool is created on first query, so this applies to the whole run.
process.env.PG_POOL_MAX ||= '20'
configureAnilistCache({ ttlMs: 12 * 60 * 60 * 1000, maxEntries: 20000 })

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CHECKPOINT_PATH = path.resolve(__dirname, '../../logs/reload-checkpoint.json')
const ALL_PHASES = [
  'backup',
  'repair',
  'anilist',
  'import',
  'titles',
  'characters',
  'studios',
  'cleanup',
]
const FAMILY_KINDS = [
  'sequel',
  'prequel',
  'side_story',
  'parent_story',
  'alternative_setting',
  'alternative_version',
  'summary',
  'full_story',
]
const MAL_RELATION_KIND = Object.fromEntries(FAMILY_KINDS.map((kind) => [kind, kind]))

/**
 * @returns {{ phases: string[], workers: number, limit: number | null, importLimit: number, fresh: boolean }}
 */
function parseArgs() {
  const args = process.argv.slice(2)
  const options = { phases: ALL_PHASES, workers: 4, limit: null, importLimit: 1000, fresh: false }
  for (let i = 0; i < args.length; i += 1) {
    const next = args[i + 1]
    if (args[i] === '--phases' && next) {
      options.phases = next.split(',').map((value) => value.trim()).filter(Boolean)
      i += 1
    } else if (args[i] === '--workers' && next) {
      options.workers = Math.max(1, parseInt(next, 10) || 1)
      i += 1
    } else if (args[i] === '--limit' && next) {
      options.limit = Math.max(1, parseInt(next, 10) || 1)
      i += 1
    } else if (args[i] === '--import-limit' && next) {
      options.importLimit = Math.max(1, parseInt(next, 10) || 1)
      i += 1
    } else if (args[i] === '--fresh') {
      options.fresh = true
    }
  }
  const unknown = options.phases.filter((phase) => !ALL_PHASES.includes(phase))
  if (unknown.length) throw new Error(`Unknown phase(s): ${unknown.join(', ')}`)
  options.phases = ALL_PHASES.filter((phase) => options.phases.includes(phase))
  return options
}

/**
 * Completed ids per phase, persisted so reruns skip finished work.
 */
class Checkpoint {
  constructor(fresh) {
    this.data = {}
    if (!fresh && fs.existsSync(CHECKPOINT_PATH)) {
      this.data = JSON.parse(fs.readFileSync(CHECKPOINT_PATH, 'utf8'))
    }
    this.sets = new Map()
    this.dirty = 0
  }

  done(phase) {
    if (!this.sets.has(phase)) this.sets.set(phase, new Set(this.data[phase] || []))
    return this.sets.get(phase)
  }

  mark(phase, id) {
    this.done(phase).add(String(id))
    this.dirty += 1
    if (this.dirty >= 10) this.flush()
  }

  flush() {
    for (const [phase, set] of this.sets) this.data[phase] = [...set]
    fs.mkdirSync(path.dirname(CHECKPOINT_PATH), { recursive: true })
    fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify(this.data))
    this.dirty = 0
  }

  clear() {
    if (fs.existsSync(CHECKPOINT_PATH)) fs.unlinkSync(CHECKPOINT_PATH)
    this.data = {}
    this.sets.clear()
  }
}

/**
 * Run `fn` over `items` with `workers` in flight, logging progress.
 * @template T
 * @param {string} label
 * @param {T[]} items
 * @param {number} workers
 * @param {(item: T) => Promise<void | 'stop'>} fn  return 'stop' to end the queue early
 * @returns {Promise<void>}
 */
async function runQueue(label, items, workers, fn) {
  let next = 0
  let finished = 0
  let stopped = false
  const started = Date.now()
  const worker = async () => {
    while (next < items.length && !stopped) {
      const item = items[next++]
      if ((await fn(item)) === 'stop') stopped = true
      finished += 1
      if (finished % 25 === 0 || finished === items.length) {
        const rate = finished / ((Date.now() - started) / 1000)
        const eta = rate > 0 ? Math.round((items.length - finished) / rate / 60) : '?'
        console.log(`  [${label}] ${finished}/${items.length} (~${eta} min left)`)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(workers, items.length) }, worker))
}

/**
 * Watchable ids grouped by sequel-family relations and franchise membership, so
 * one worker handles a whole family and franchise-mates never race on the same
 * characters.
 * @param {string[]} ids
 * @returns {Promise<string[][]>}
 */
async function groupByFamily(ids) {
  const parent = new Map(ids.map((id) => [id, id]))
  const find = (id) => {
    let root = id
    while (parent.get(root) !== root) root = parent.get(root)
    parent.set(id, root)
    return root
  }
  const union = (a, b) => {
    if (!parent.has(a) || !parent.has(b)) return
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(ra, rb)
  }
  const { rows: edges } = await query(
    `SELECT from_id::text AS a, to_id::text AS b FROM content_relations WHERE kind = ANY($1::text[])
     UNION ALL
     SELECT fm.member_id::text, fm2.member_id::text
     FROM franchise_members fm JOIN franchise_members fm2 ON fm2.franchise_id = fm.franchise_id`,
    [FAMILY_KINDS],
  )
  for (const edge of edges) union(edge.a, edge.b)
  const groups = new Map()
  for (const id of ids) {
    const root = find(id)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root).push(id)
  }
  return [...groups.values()].sort((left, right) => right.length - left.length)
}

async function watchableIds(limit) {
  const { rows } = await query(
    `SELECT id::text AS id FROM content WHERE kind IN ('movie', 'series', 'special') ORDER BY id`,
  )
  const ids = rows.map((row) => row.id)
  return limit ? ids.slice(0, limit) : ids
}

async function phaseBackup() {
  const schema = await repair.backupCatalog()
  console.log(`  Backed up catalog tables into schema ${schema}`)
}

async function phaseRepair() {
  const clobbered = await repair.repairClobberedContent()
  console.log('  Overwritten titles/franchises:', clobbered)
  const studios = await repair.repairMisnamedStudios()
  console.log(`  Mis-named studios: ${studios.found} removed, ${studios.works} works re-credited`)
  if (studios.names.length) console.log(`    ${studios.names.join(', ')}`)
  console.log('  Schema link fixes:', await repair.enforceSchemaLinks())
}

/**
 * Write MAL typed relations for one title from an already-fetched related_anime list.
 * @param {string} id
 * @param {object[]} related
 * @param {Map<number, string>} byMal
 * @returns {Promise<number>}
 */
async function replaceMalRelations(id, related, byMal) {
  await query(`DELETE FROM content_relations WHERE from_id = $1 AND source = 'mal'`, [id])
  const seen = new Set()
  for (const relation of related) {
    const toId = byMal.get(Number(relation.node?.id))
    if (!toId || toId === id) continue
    const kind = MAL_RELATION_KIND[String(relation.relation_type || '').toLowerCase()] || 'other'
    const key = `${toId}:${kind}`
    if (seen.has(key)) continue
    seen.add(key)
    await query(
      `INSERT INTO content_relations (from_id, to_id, kind, source)
       VALUES ($1, $2, $3, 'mal') ON CONFLICT (from_id, to_id, kind) DO NOTHING`,
      [id, toId, kind],
    )
  }
  return seen.size
}

/**
 * AniList fields for a title, or null when AniList has no entry or its id
 * already belongs to another row of the same kind.
 * @param {object} content
 * @returns {Promise<object | null>}
 */
async function anilistDataFor(content) {
  if (!content.anilistId && !content.malId) return null
  const media = await getAnilistMedia({ anilistId: content.anilistId, malId: content.malId })
  const data = media ? convertAnilistToContent(media) : null
  if (!data) return null
  if (content.anilistId && content.anilistId !== data.anilistId) return null
  const { rows } = await query(
    `SELECT 1 FROM content o
     WHERE o.anilist_id = $1 AND o.id <> $2
       AND o.kind = (SELECT kind FROM content WHERE id = $2)`,
    [data.anilistId, String(content._id)],
  )
  return rows[0] ? null : data
}

/**
 * Re-fetch one title from TMDB, MAL, and AniList and save it once.
 * @param {string} id
 * @param {DatabasePopulator} populator
 * @param {Map<number, string>} byMal
 * @returns {Promise<'updated' | 'unchanged' | 'missing'>}
 */
async function reloadTitle(id, populator, byMal) {
  const content = await Content.findById(id)
  if (!content) return 'missing'
  const originalStudios = [...(content.studios || [])]
  content.studios = []
  content.studioRefs = []
  let tmdbOk = false
  let malOk = false
  let related = null

  if (content.tmdbId && unifiedContentService.hasTmdbKey) {
    const types =
      content.contentType === 'movie' ? ['movie'] : content.contentType === 'tv' ? ['tv'] : ['movie', 'tv']
    for (const type of types) {
      const details = await unifiedContentService.getTmdbContentDetails(content.tmdbId, type)
      if (!details) continue
      const converted = unifiedContentService.convertTmdbToContent(details, type, { minVoteCount: 0 })
      if (!converted) continue
      await populator.mergeTmdbIntoExisting(content, converted, details, { save: false })
      tmdbOk = true
      break
    }
  }

  if (content.malId && unifiedContentService.hasMalKey) {
    const anime = await unifiedContentService.getMalAnimeDetails(content.malId, {
      extraFields: ['related_anime'],
    })
    const converted = anime ? unifiedContentService.convertMalToContent(anime) : null
    if (converted) {
      await populator.mergeMalIntoExisting(content, converted, { save: false })
      malOk = true
      related = Array.isArray(anime.related_anime) ? anime.related_anime : []
    }
  }

  const anilist = await anilistDataFor(content)
  if (anilist) await populator.mergeAnilistIntoExisting(content, anilist, { save: false })

  if (!tmdbOk && !malOk && !anilist) return 'unchanged'
  if (content.malId && !malOk && !anilist?.studios.length) content.studios = originalStudios
  if (!content.studios.length) content.studios = originalStudios

  await content.save()
  if (related) await replaceMalRelations(String(content._id), related, byMal)
  return 'updated'
}

/**
 * Warm the AniList cache for these titles (25 per request).
 * @param {string[]} ids
 * @param {{ withCharacters?: boolean }} [options]
 * @returns {Promise<number>} Media fetched or cached.
 */
async function prefetchAnilist(ids, options = {}) {
  if (!ids.length) return 0
  const { rows } = await query(
    `SELECT anilist_id, mal_id FROM content
     WHERE id = ANY($1::uuid[]) AND (anilist_id IS NOT NULL OR mal_id IS NOT NULL)`,
    [ids],
  )
  const media = await fetchAnilistMediaBatch(
    {
      anilistIds: rows.filter((row) => row.anilist_id).map((row) => row.anilist_id),
      malIds: rows.filter((row) => !row.anilist_id).map((row) => row.mal_id),
    },
    options,
  )
  return media.length
}

async function malIdMap() {
  const { rows } = await query(
    `SELECT id::text AS id, mal_id FROM content
     WHERE kind IN ('movie', 'series', 'special') AND mal_id IS NOT NULL`,
  )
  return new Map(rows.map((row) => [Number(row.mal_id), row.id]))
}

async function phaseAnilist(options, checkpoint) {
  if (!(await probeAnilist())) {
    console.log('  AniList is unreachable right now; deferring anilist.')
    return false
  }
  const linked = await linkMalTitles({ limit: options.limit })
  console.log('  MAL titles linked to AniList:', linked)
  const bridged = await bridgeTmdbTitles({ limit: options.limit, log: console.log })
  console.log('  TMDB-only titles matched on AniList:', bridged.stats)

  const changed = [...new Set(bridged.changed)]
  if (changed.length) {
    const populator = new DatabasePopulator()
    const byMal = await malIdMap()
    await prefetchAnilist(changed, { withCharacters: true })
    await runQueue('bridged titles', changed, 1, async (id) => {
      try {
        await reloadTitle(id, populator, byMal)
        checkpoint.mark('titles', id)
      } catch (error) {
        console.error(`  Reload of bridged title ${id} failed: ${error.message}`)
      }
    })
    checkpoint.flush()
    console.log(`  Reloaded ${changed.length} bridged titles from TMDB + MAL + AniList`)
  }
  return anilistStatus().consecutiveFailures === 0
}

const INVERSE_RELATION = {
  sequel: 'prequel',
  prequel: 'sequel',
  side_story: 'parent_story',
  parent_story: 'side_story',
  summary: 'full_story',
  full_story: 'summary',
}

/**
 * Mirror a new title's MAL relations onto the titles it points at, so an
 * existing season lists the imported sequel without being re-fetched.
 * @param {string} id
 * @returns {Promise<void>}
 */
async function mirrorMalRelations(id) {
  const { rows } = await query(
    `SELECT to_id::text AS to_id, kind FROM content_relations WHERE from_id = $1 AND source = 'mal'`,
    [id],
  )
  for (const row of rows) {
    await query(
      `INSERT INTO content_relations (from_id, to_id, kind, source)
       VALUES ($1, $2, $3, 'mal') ON CONFLICT (from_id, to_id, kind) DO NOTHING`,
      [row.to_id, id, INVERSE_RELATION[row.kind] || row.kind],
    )
  }
}

async function phaseImport(options, checkpoint) {
  if (!(await probeAnilist())) {
    console.log('  AniList is unreachable right now; deferring import.')
    return false
  }
  const populator = new DatabasePopulator()
  const { stats, touched } = await importPopularAnilist({
    limit: options.importLimit,
    populator,
    log: console.log,
  })
  console.log(`  AniList top ${options.importLimit}:`, stats)
  if (!touched.length) return stats.failed === 0

  const byMal = await malIdMap()
  await prefetchAnilist(touched, { withCharacters: true })
  const counts = { reloaded: 0, withCharacters: 0, failed: 0 }
  await runQueue('imported titles', touched, Math.min(options.workers, 3), async (id) => {
    try {
      await reloadTitle(id, populator, byMal)
      await mirrorMalRelations(id)
      checkpoint.mark('titles', id)
      counts.reloaded += 1
    } catch (error) {
      counts.failed += 1
      console.error(`  Imported title ${id} failed: ${error.message}`)
    }
  })

  const families = await groupByFamily(touched)
  await runQueue('imported characters', families, options.workers, async (family) => {
    for (const id of family) {
      try {
        const content = await Content.findById(id)
        if (!content) continue
        const characters = await ensureCharactersForContent(content, { force: true })
        if (characters.length) counts.withCharacters += 1
        checkpoint.mark('characters', id)
      } catch (error) {
        counts.failed += 1
        console.error(`  Characters for imported title ${id} failed: ${error.message}`)
      }
    }
  })

  const { rows: studios } = await query(
    `SELECT DISTINCT s.id::text AS id FROM studio_credits sc JOIN content s ON s.id = sc.studio_id
     WHERE sc.work_id = ANY($1::uuid[])
       AND (coalesce(s.image_path, '') = '' OR coalesce(s.about, '') = '')`,
    [touched],
  )
  const studioIds = studios.map((row) => row.id)
  for (const id of studioIds) {
    try {
      const entity = await Entity.findById(id)
      if (!entity) continue
      await ensureStudioDetails(entity, { force: true })
      if (entity.duplicateOfId) await repair.mergeStudioInto(id, String(entity.duplicateOfId))
    } catch (error) {
      console.error(`  Studio ${id} failed: ${error.message}`)
    }
  }
  checkpoint.flush()
  console.log('  Imported titles:', { ...counts, studiosChecked: studioIds.length })
  return stats.failed === 0 && counts.failed === 0
}

async function phaseTitles(options, checkpoint) {
  const ids = await watchableIds(options.limit)
  const done = checkpoint.done('titles')
  const todo = ids.filter((id) => !done.has(id))
  console.log(`  ${todo.length} titles to reload (${ids.length - todo.length} already done)`)
  console.log(`  AniList media cached: ${await prefetchAnilist(todo, { withCharacters: true })}`)
  const byMal = await malIdMap()
  const populator = new DatabasePopulator()
  const stats = { updated: 0, unchanged: 0, missing: 0, failed: [] }
  // MAL has no published limit but throttles bursts; stay at 3 concurrent titles.
  await runQueue('titles', todo, Math.min(options.workers, 3), async (id) => {
    try {
      stats[await reloadTitle(id, populator, byMal)] += 1
      checkpoint.mark('titles', id)
    } catch (error) {
      stats.failed.push(id)
      console.error(`  Title ${id} failed: ${error.message}`)
    }
  })
  checkpoint.flush()
  console.log('  Titles:', { ...stats, failed: stats.failed.length })
}

/**
 * Whether a character source is failing right now.
 * @param {() => { consecutiveFailures: number, available: boolean }} status
 * @returns {boolean}
 */
function failing(status) {
  const state = status()
  return !state.available || state.consecutiveFailures > 0
}

async function phaseCharacters(options, checkpoint) {
  const [jikanUp, anilistUp] = await Promise.all([probeJikan(), probeAnilist()])
  console.log(`  Sources: Jikan ${jikanUp ? 'up' : 'down'}, AniList ${anilistUp ? 'up' : 'down'}`)
  if (!jikanUp && !anilistUp) {
    console.log('  Neither Jikan nor AniList is reachable; deferring characters.')
    return false
  }
  const ids = await watchableIds(options.limit)
  const done = checkpoint.done('characters')
  const groups = (await groupByFamily(ids))
    .map((group) => group.filter((id) => !done.has(id)))
    .filter((group) => group.length)
  const todo = groups.flat()
  console.log(`  ${todo.length} titles in ${groups.length} families to ingest characters for`)
  console.log(`  AniList media cached: ${await prefetchAnilist(todo, { withCharacters: true })}`)
  const stats = { titles: 0, withCharacters: 0, withoutMalIds: 0, deferred: 0, failed: 0 }
  let stopped = false
  await runQueue('character families', groups, options.workers, async (group) => {
    for (const id of group) {
      if (!jikanStatus().available && !anilistStatus().available) {
        stopped = true
        return 'stop'
      }
      try {
        const content = await Content.findById(id)
        if (!content) continue
        const characters = await ensureCharactersForContent(content, { force: true })
        stats.titles += 1
        if (characters.length) stats.withCharacters += 1
        const sourced = content.malId || content.anilistId
        const jikanFailed = Boolean(content.malId) && failing(jikanStatus)
        const anilistFailed = failing(anilistStatus)
        if (sourced && jikanFailed && anilistFailed) {
          stats.deferred += 1
          continue
        }
        if (jikanFailed) stats.withoutMalIds += 1
        checkpoint.mark('characters', id)
      } catch (error) {
        stats.failed += 1
        console.error(`  Characters for ${id} failed: ${error.message}`)
      }
    }
  })
  checkpoint.flush()
  console.log('  Characters:', stats)
  if (stats.withoutMalIds) {
    console.log(
      `  ${stats.withoutMalIds} titles got AniList characters while Jikan was down; ` +
        'their MAL character ids fill in when those pages are opened after Jikan recovers.',
    )
  }
  if (stopped) console.log('  Both sources went down mid-phase; rerun --phases characters,cleanup.')
  return !stopped && stats.deferred === 0
}

async function phaseStudios(options, checkpoint) {
  const jikanUp = await probeJikan()
  if (!jikanUp) {
    console.log('  Jikan is down: logos/about come from TMDB; studios stay unchecked for MAL.')
  }
  const { rows } = await query(
    `SELECT s.id::text AS id FROM content s
     WHERE s.kind = 'studio'
       AND EXISTS (SELECT 1 FROM studio_credits sc WHERE sc.studio_id = s.id)
     ORDER BY (SELECT count(*) FROM studio_credits sc WHERE sc.studio_id = s.id) DESC`,
  )
  const done = checkpoint.done('studios')
  const todo = rows.map((row) => row.id).filter((id) => !done.has(id))
  const list = options.limit ? todo.slice(0, options.limit) : todo
  console.log(`  ${list.length} studios to enrich`)
  const stats = { enriched: 0, merged: 0, deferred: 0, failed: 0 }
  // Sequential: studio merges open a transaction on the shared query helper.
  await runQueue('studios', list, 1, async (id) => {
    try {
      const entity = await Entity.findById(id)
      if (!entity) return
      await ensureStudioDetails(entity, { force: true })
      if (entity.duplicateOfId) {
        await repair.mergeStudioInto(id, String(entity.duplicateOfId))
        stats.merged += 1
      } else {
        stats.enriched += 1
      }
      if (failing(jikanStatus)) stats.deferred += 1
      else checkpoint.mark('studios', id)
    } catch (error) {
      stats.failed += 1
      console.error(`  Studio ${id} failed: ${error.message}`)
    }
  })
  checkpoint.flush()
  console.log('  Studios:', stats)
  return stats.deferred === 0
}

async function phaseCleanup() {
  const populator = new DatabasePopulator()
  const titles = await repair.mergeDuplicateTitles((left, right) =>
    populator.isLikelySameContent(left, right),
  )
  console.log(`  Merged ${titles} titles stored twice under differently spaced/cased names`)
  console.log(`  Merged ${await mergeAllFranchiseCharacters()} duplicate franchise characters`)
  console.log(`  Merged ${await repair.mergeDuplicateVoices()} voice actors listed by two sources`)
  console.log(`  Removed ${await repair.dedupeVoiceCredits()} repeated voice credits`)
  console.log(`  Merged ${await repair.mergeDuplicateStudios()} same-name studios`)
  console.log('  Schema link fixes:', await repair.enforceSchemaLinks())
  console.log('  Pruned orphans:', await repair.pruneOrphans())
}

async function run() {
  const options = parseArgs()
  const checkpoint = new Checkpoint(options.fresh)
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set')
  await connectPostgres()
  console.log(`Reloading catalog: ${options.phases.join(' → ')}`)
  console.log('Before:', JSON.stringify(await repair.auditCatalog()))

  const phases = {
    backup: () => phaseBackup(),
    repair: () => phaseRepair(),
    anilist: () => phaseAnilist(options, checkpoint),
    import: () => phaseImport(options, checkpoint),
    titles: () => phaseTitles(options, checkpoint),
    characters: () => phaseCharacters(options, checkpoint),
    studios: () => phaseStudios(options, checkpoint),
    cleanup: () => phaseCleanup(),
  }
  let incomplete = false
  for (const phase of options.phases) {
    const started = Date.now()
    console.log(`\n== ${phase} ==`)
    if ((await phases[phase]()) === false) incomplete = true
    console.log(`  (${Math.round((Date.now() - started) / 1000)}s)`)
  }

  console.log('\nAfter:', JSON.stringify(await repair.auditCatalog()))
  if (options.phases.includes('cleanup') && !options.limit && !incomplete) checkpoint.clear()
  await closePostgres()
}

run().catch(async (error) => {
  console.error('Catalog reload failed:', error)
  await closePostgres()
  process.exit(1)
})
