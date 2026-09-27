/**
 * Add AniList's most popular anime that the catalog does not have yet.
 *
 * Domain service used by `scripts/reloadCatalog.js` (import phase). Each new
 * anime goes through the MAL importer when AniList knows its MAL id (so it
 * dedupes against TMDB-only rows by title like any MAL ingest), otherwise it
 * is built from AniList alone. New titles then pick up a TMDB id when TMDB
 * lists exactly one animated title with the same name and start year.
 */
import { query } from '../../config/postgres.js'
import Content from '../models/Content.js'
import unifiedContentService from './unifiedContentService.js'
import {
  anilistContentType,
  anilistToNewContent,
  convertAnilistToContent,
  fetchAnilistPopular,
} from './anilistService.js'
import { claimExternalId } from './anilistLinking.js'
import { collectContentTitles, titlesEqual } from '../utils/titles.js'

const WATCHABLE = `('movie', 'series', 'special')`
const PAGE_SIZE = 50

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function releaseYear(value) {
  if (!value) return null
  const year = new Date(value).getUTCFullYear()
  return Number.isFinite(year) ? year : null
}

/**
 * The single TMDB search hit that is this title: a shared name and a start
 * year within one. Ambiguous or missing hits return null.
 * @param {object} content
 * @param {object[]} hits - Content-shaped TMDB search results
 * @returns {object | null}
 */
export function pickTmdbMatch(content, hits) {
  const titles = collectContentTitles(content)
  const year = releaseYear(content.releaseDate)
  const matches = (Array.isArray(hits) ? hits : []).filter((hit) => {
    if (!hit?.tmdbId) return false
    if (!collectContentTitles(hit).some((name) => titles.some((title) => titlesEqual(name, title)))) {
      return false
    }
    const hitYear = releaseYear(hit.releaseDate)
    return Boolean(year && hitYear && Math.abs(hitYear - year) <= 1)
  })
  const ids = new Set(matches.map((hit) => Number(hit.tmdbId)))
  return ids.size === 1 ? matches[0] : null
}

/**
 * Search TMDB by the title's English then main name and claim the match.
 * @param {object} content
 * @returns {Promise<boolean>} True when a TMDB id was stored.
 */
async function linkTmdb(content) {
  const type = { movie: 'movie', tv: 'tv' }[content.contentType]
  if (!type || content.tmdbId || !unifiedContentService.hasTmdbKey) return false
  const tried = new Set()
  for (const title of [content.englishTitle, content.title]) {
    const key = String(title || '').toLowerCase()
    if (!key || tried.has(key)) continue
    tried.add(key)
    const match = pickTmdbMatch(content, await unifiedContentService.searchTmdb(title, type, 20))
    if (match) return claimExternalId(String(content._id), 'tmdb_id', Number(match.tmdbId))
  }
  return false
}

/**
 * The catalog title already holding this AniList anime (by AniList or MAL id).
 * @param {object} media
 * @returns {Promise<{ id: string, anilist_id: number | null } | null>}
 */
async function catalogOwner(media) {
  const { rows } = await query(
    `SELECT id::text AS id, anilist_id FROM content
     WHERE kind IN ${WATCHABLE} AND (anilist_id = $1 OR ($2::int IS NOT NULL AND mal_id = $2))
     ORDER BY (anilist_id = $1) DESC NULLS LAST
     LIMIT 1`,
    [media.id, Number(media.idMal) > 0 ? Number(media.idMal) : null],
  )
  return rows[0] || null
}

/**
 * Merge AniList fields unless the row is already another AniList anime.
 * @param {object} content
 * @param {object} anilistData
 * @param {import('./contentSyncService.js').default} populator
 * @returns {Promise<void>}
 */
async function attachAnilist(content, anilistData, populator) {
  if (content.anilistId && content.anilistId !== anilistData.anilistId) return
  await populator.mergeAnilistIntoExisting(content, anilistData)
}

/**
 * Create or merge one AniList anime into the catalog.
 * @param {object} media
 * @param {import('./contentSyncService.js').default} populator
 * @returns {Promise<{ outcome: 'added' | 'merged' | 'failed', content?: object }>}
 */
async function importOne(media, populator) {
  const anilistData = convertAnilistToContent(media)
  const malId = Number(media.idMal) > 0 ? Number(media.idMal) : null

  if (malId && unifiedContentService.hasMalKey) {
    const anime = await unifiedContentService.getMalAnimeDetails(malId)
    if (anime) {
      const added = populator.stats.newAdded
      await populator.saveMalContent(anime)
      const content = await Content.findOne({ malId })
      if (content) {
        await attachAnilist(content, anilistData, populator)
        return { outcome: populator.stats.newAdded > added ? 'added' : 'merged', content }
      }
    }
  }

  const data = anilistToNewContent(media)
  if (!data) return { outcome: 'failed' }
  const [duplicate] = await populator.findDuplicateContent(data)
  if (duplicate) {
    await attachAnilist(duplicate.content, anilistData, populator)
    return { outcome: 'merged', content: duplicate.content }
  }
  const content = new Content({
    ...data,
    genres: populator.deduplicateGenres(data.genres),
    userRatingAverage: null,
    userRatingCount: 0,
    userRatingSum: 0,
  })
  await content.save()
  return { outcome: 'added', content }
}

/**
 * Walk AniList's popularity ranking and add every anime the catalog lacks.
 * @param {{ limit?: number, populator: import('./contentSyncService.js').default, log?: (message: string) => void }} options
 * @returns {Promise<{ stats: Record<string, number>, touched: string[] }>}
 */
export async function importPopularAnilist({ limit = 1000, populator, log = () => {} }) {
  const stats = {
    considered: 0,
    alreadyInCatalog: 0,
    added: 0,
    mergedIntoExisting: 0,
    tmdbLinked: 0,
    skipped: 0,
    failed: 0,
  }
  const touched = []
  for (let page = 1; stats.considered < limit; page += 1) {
    const result = await fetchAnilistPopular({ page, perPage: PAGE_SIZE })
    if (!result) {
      log(`  AniList stopped answering at page ${page}; rerun --phases import to continue.`)
      stats.failed += 1
      break
    }
    for (const media of result.media) {
      if (stats.considered >= limit) break
      stats.considered += 1
      if (!anilistContentType(media.format)) {
        stats.skipped += 1
        continue
      }
      const owner = await catalogOwner(media)
      if (owner) {
        if (owner.anilist_id == null) await claimExternalId(owner.id, 'anilist_id', media.id)
        stats.alreadyInCatalog += 1
        continue
      }
      try {
        const { outcome, content } = await importOne(media, populator)
        if (outcome === 'failed' || !content) {
          stats.failed += 1
          continue
        }
        if (outcome === 'added') stats.added += 1
        else stats.mergedIntoExisting += 1
        if (await linkTmdb(content)) stats.tmdbLinked += 1
        touched.push(String(content._id))
        const name = content.englishTitle || content.title
        log(`  ${outcome === 'added' ? 'added' : 'merged'} "${name}" (AniList ${media.id})`)
      } catch (error) {
        stats.failed += 1
        log(`  AniList ${media.id} failed: ${error.message}`)
      }
    }
    if (!result.hasNextPage) break
  }
  return { stats, touched: [...new Set(touched)] }
}
