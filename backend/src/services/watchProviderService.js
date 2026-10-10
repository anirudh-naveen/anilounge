/**
 * Where to watch a title: direct streaming links from AniList (the show's own page on
 * Crunchyroll, Netflix, HIDIVE, ...) and the services that carry it in the viewer's
 * country from TMDB, whose data comes from JustWatch (credit required wherever it is
 * shown).
 *
 * Layer: service. Both sources are fetched on demand and cached in memory; either one
 * failing just leaves its part empty.
 */

import { query } from '../../config/postgres.js'
import { isUuid } from '../db/ids.js'
import { HttpError } from '../utils/httpError.js'
import { fetchJson } from '../utils/fetchJson.js'
import { anilistRequest } from './anilistService.js'

const TMDB_BASE = 'https://api.themoviedb.org/3'
const TMDB_LOGO_BASE = 'https://image.tmdb.org/t/p/w92'
const CACHE_TTL_MS = 12 * 60 * 60 * 1000
const CACHE_MAX = 2000
const DEFAULT_REGION = 'US'

const cache = new Map()

const STREAMING_LINKS_QUERY = `query ($id: Int, $idMal: Int) {
  Media(id: $id, idMal: $idMal, type: ANIME) {
    externalLinks { site url type language isDisabled }
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
      bySite.set(link.site, { site: link.site, url: link.url, language: link.language || null })
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

/** Both sources for a title (every region), cached. */
async function sourcesFor(row) {
  const key = String(row.id)
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value
  const value = Promise.all([loadAnilistLinks(row), loadTmdbRegions(row)]).then(
    ([streaming, regions]) => ({ streaming, regions }),
  )
  value.catch(() => cache.delete(key))
  cache.set(key, { at: Date.now(), value })
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value)
  return value
}

/**
 * Where to watch `contentId` in `region`.
 * @param {string} contentId
 * @param {unknown} region - Two-letter country code (default US).
 * @returns {Promise<{ region: string, streaming: object[], providers: { link: string | null, stream: object[], buy: object[] } }>}
 * @throws {HttpError} 404 unknown title.
 */
export async function getWhereToWatch(contentId, region) {
  if (!isUuid(contentId)) throw new HttpError(404, 'Title not found.')
  const { rows } = await query(
    `SELECT id, kind, tmdb_id, anilist_id, mal_id FROM content
     WHERE id = $1 AND kind IN ('movie', 'series', 'special')`,
    [contentId],
  )
  if (!rows[0]) throw new HttpError(404, 'Title not found.')
  const country = normalizeRegion(region)
  const { streaming, regions } = await sourcesFor(rows[0])
  return { region: country, streaming, providers: regionProviders(regions[country]) }
}

export default { getWhereToWatch }
