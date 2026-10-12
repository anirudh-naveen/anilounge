/**
 * Find TMDB's western animation that the catalog lacks: every animated movie and show
 * (genre 16) with at least `minVotes` votes whose original language isn't Japanese,
 * Korean, or Chinese (those come in as anime through AniList and MAL).
 *
 * Domain service used by `scripts/reloadCatalog.js` (western phase). TMDB's discover
 * ignores `without_original_language`, so languages are filtered here; it pages by vote
 * count, most voted first, and stops at TMDB's 500-page cap.
 */
import { query } from '../../config/postgres.js'
import unifiedContentService from './unifiedContentService.js'

/** Fewest TMDB votes a western title needs to enter the catalog. */
export const WESTERN_MIN_VOTES = 20

const EAST_ASIAN_LANGUAGES = new Set(['ja', 'ko', 'zh', 'cn'])
const CATALOG_KINDS = { movie: ['movie', 'special'], tv: ['series', 'season'] }

/**
 * Whether a TMDB discover result is western animation (not anime, donghua, or aeni).
 * @param {object} result
 * @returns {boolean}
 */
export function isWesternResult(result) {
  if (!result?.id) return false
  return !EAST_ASIAN_LANGUAGES.has(String(result.original_language || '').toLowerCase())
}

/**
 * Western animation of one type on TMDB, most voted first.
 * @param {'movie' | 'tv'} type
 * @param {number} minVotes
 * @param {(message: string) => void} log
 * @returns {Promise<{ found: Array<{ tmdbId: number, type: 'movie' | 'tv', title: string }>, complete: boolean }>}
 *   `complete: false` when TMDB stopped answering partway.
 */
async function discoverWestern(type, minVotes, log) {
  // Keyed by id: a title can move between pages while they're fetched.
  const found = new Map()
  let totalPages = 1
  for (let page = 1; page <= totalPages; page += 1) {
    const result = await unifiedContentService.discoverTmdbAnimatedByVotes(type, page, minVotes)
    if (!result) {
      log(`  TMDB stopped answering at ${type} page ${page}`)
      return { found: [...found.values()], complete: false }
    }
    totalPages = result.totalPages
    for (const item of result.results.filter(isWesternResult)) {
      found.set(item.id, { tmdbId: item.id, type, title: item.title || item.name || String(item.id) })
    }
  }
  return { found: [...found.values()], complete: true }
}

/**
 * The TMDB ids of one type the catalog already holds.
 * @param {'movie' | 'tv'} type
 * @param {number[]} tmdbIds
 * @returns {Promise<Set<number>>}
 */
async function heldTmdbIds(type, tmdbIds) {
  const { rows } = await query(
    `SELECT DISTINCT tmdb_id FROM content WHERE kind = ANY($1::text[]) AND tmdb_id = ANY($2::int[])`,
    [CATALOG_KINDS[type], tmdbIds],
  )
  return new Set(rows.map((row) => Number(row.tmdb_id)))
}

/**
 * Western animation TMDB lists that the catalog doesn't have, most voted first.
 * @param {{ minVotes?: number, log?: (message: string) => void }} [options]
 * @returns {Promise<{ missing: Array<{ tmdbId: number, type: 'movie' | 'tv', title: string }>,
 *   stats: Record<string, number>, complete: boolean }>}
 */
export async function findMissingWesternTmdb({ minVotes = WESTERN_MIN_VOTES, log = () => {} } = {}) {
  const missing = []
  const stats = { onTmdb: 0, inCatalog: 0, missing: 0 }
  let complete = true
  for (const type of ['tv', 'movie']) {
    const result = await discoverWestern(type, minVotes, log)
    complete &&= result.complete
    const held = await heldTmdbIds(
      type,
      result.found.map((item) => item.tmdbId),
    )
    stats.onTmdb += result.found.length
    stats.inCatalog += held.size
    missing.push(...result.found.filter((item) => !held.has(item.tmdbId)))
  }
  stats.missing = missing.length
  return { missing, stats, complete }
}
