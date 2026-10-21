/**
 * Where to watch a title: direct streaming links from AniList (the show's own page on
 * Crunchyroll, Netflix, HIDIVE, ...) and the services that carry it in the viewer's
 * country from TMDB, whose data comes from JustWatch (credit required wherever it is
 * shown).
 *
 * Layer: service. Pages read the stored sources (external_cache); the catalog refresh
 * job fetches them (`refreshWatchSources`) when missing or stale. Either source
 * failing just leaves its part empty.
 */

import { query } from '../../config/postgres.js'
import { isUuid } from '../db/ids.js'
import { HttpError } from '../utils/httpError.js'
import { fetchJson } from '../utils/fetchJson.js'
import { anilistRequest } from './anilistService.js'
import { isStale, readCache, requestRefresh, writeCache } from './refreshRequests.js'

const TMDB_BASE = 'https://api.themoviedb.org/3'
const TMDB_LOGO_BASE = 'https://image.tmdb.org/t/p/w92'
/** Stored sources older than this are queued for a refresh. */
const STALE_MS = 12 * 60 * 60 * 1000
const DEFAULT_REGION = 'US'

const STREAMING_LINKS_QUERY = `query ($id: Int, $idMal: Int) {
  Media(id: $id, idMal: $idMal, type: ANIME) {
    externalLinks { site url type language isDisabled icon color }
  }
}`

/**
 * A two-letter country code, or the default.
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeRegion(value) {
  const region = typeof value === 'string' ? value.trim().toUpperCase() : ''
  return /^[A-Z]{2}$/.test(region) ? region : DEFAULT_REGION
}

/**
 * AniList streaming links, one per site (English first when a site has several).
 * @param {Array<{ site: string, url: string, type: string, language?: string | null, isDisabled?: boolean }> | null | undefined} links
 * @returns {Array<{ site: string, url: string, language: string | null }>}
 */
export function streamingLinks(links) {
  const usable = (links || []).filter(
    (link) => link?.type === 'STREAMING' && !link.isDisabled && /^https:\/\//.test(link.url || ''),
  )
  const rank = (link) => (link.language && link.language !== 'English' ? 1 : 0)
  const bySite = new Map()
  for (const link of [...usable].sort((a, b) => rank(a) - rank(b))) {
    if (!bySite.has(link.site)) {
      bySite.set(link.site, {
        site: link.site,
        url: link.url,
        language: link.language || null,
        // AniList's site icon and brand color, shown as the link's logo.
        icon: /^https:\/\//.test(link.icon || '') ? link.icon : null,
        color: link.color || null,
      })
    }
  }
  return [...bySite.values()]
}

/**
 * TMDB providers for one country: where it streams (subscription, free, or with ads)
 * and where it can be bought or rented.
 * @param {object | null | undefined} country - `results[region]` from TMDB.
 * @returns {{ link: string | null, stream: object[], buy: object[] }}
 */
export function regionProviders(country) {
  const pick = (...lists) => {
    const seen = new Set()
    const out = []
    for (const provider of lists.flat()) {
      if (!provider?.provider_id || seen.has(provider.provider_id)) continue
      seen.add(provider.provider_id)
      out.push({
        id: provider.provider_id,
        name: provider.provider_name,
        logo: provider.logo_path ? `${TMDB_LOGO_BASE}${provider.logo_path}` : null,
      })
    }
    return out
  }
  return {
    link: country?.link || null,
    stream: pick(country?.flatrate || [], country?.free || [], country?.ads || []),
    buy: pick(country?.rent || [], country?.buy || []),
  }
}

async function loadAnilistLinks(row) {
  if (!row.anilist_id && !row.mal_id) return []
  try {
    const data = await anilistRequest(
      STREAMING_LINKS_QUERY,
      row.anilist_id ? { id: row.anilist_id } : { idMal: row.mal_id },
    )
    return streamingLinks(data?.Media?.externalLinks)
  } catch {
    return []
  }
}

async function loadTmdbRegions(row) {
  const apiKey = process.env.TMDB_API_KEY
  const type = row.kind === 'movie' ? 'movie' : row.kind === 'series' ? 'tv' : null
  if (!apiKey || !row.tmdb_id || !type) return {}
  const { status, body } = await fetchJson(
    `${TMDB_BASE}/${type}/${row.tmdb_id}/watch/providers?api_key=${encodeURIComponent(apiKey)}`,
  )
  return status === 200 && body?.results ? body.results : {}
}

/**
 * Where to watch `contentId` in `region`.
 * @param {string} contentId
 * @param {unknown} region - Two-letter country code (default US).
 * @returns {Promise<{ region: string, streaming: object[], providers: { link: string | null, stream: object[], buy: object[] } }>}
 * @throws {HttpError} 404 unknown title.
 */
export async function getWhereToWatch(contentId, region) {
  const row = await loadWatchRow(contentId)
  if (!row) throw new HttpError(404, 'Title not found.')
  const country = normalizeRegion(region)
  const stored = await readCache('watch', row.id)
  if (isStale(stored, STALE_MS)) await requestRefresh('watch', row.id)
  const { streaming = [], regions = {} } = stored?.data || {}
  return { region: country, streaming, providers: regionProviders(regions[country]) }
}

/**
 * Fetch and store both sources for a title (every region). Run by the refresh job.
 * @param {string} contentId
 * @returns {Promise<void>}
 */
export async function refreshWatchSources(contentId) {
  const row = await loadWatchRow(contentId)
  if (!row) return
  const [streaming, regions] = await Promise.all([loadAnilistLinks(row), loadTmdbRegions(row)])
  await writeCache('watch', row.id, { streaming, regions })
}

/**
 * The title's ids for both sources, or null for an unknown title.
 * @param {string} contentId
 * @returns {Promise<object | null>}
 */
async function loadWatchRow(contentId) {
  if (!isUuid(contentId)) return null
  const { rows } = await query(
    // A season streams where its show does (TMDB lists the show); a series links out
    // through its first season's AniList entry.
    `SELECT c.id, CASE WHEN c.kind = 'season' THEN 'series' ELSE c.kind END AS kind,
            COALESCE(c.tmdb_id, show.tmdb_id) AS tmdb_id,
            COALESCE(c.anilist_id, first.anilist_id) AS anilist_id,
            COALESCE(c.mal_id, first.mal_id) AS mal_id
     FROM content c
     LEFT JOIN seasons sn ON sn.content_id = c.id
     LEFT JOIN content show ON show.id = sn.series_id
     LEFT JOIN LATERAL (
       SELECT f.anilist_id, f.mal_id FROM seasons x JOIN content f ON f.id = x.content_id
       WHERE x.series_id = c.id ORDER BY x.season_number, x.part_number LIMIT 1
     ) first ON c.kind = 'series'
     WHERE c.id = $1 AND c.kind IN ('movie', 'series', 'season', 'special')`,
    [contentId],
  )
  return rows[0] || null
}

export default { getWhereToWatch, refreshWatchSources }
