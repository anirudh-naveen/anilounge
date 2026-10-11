/**
 * TVmaze (api.tvmaze.com): character images for western shows, which TMDB lacks.
 * A show is found by its TVDB or IMDb id (stored by the catalog import), and its cast
 * pairs each actor with their character, often with the character's own image.
 * TVmaze data is CC BY-SA; the site credits it on title pages.
 *
 * Domain service used by entityService.js (TMDB character ingest). No key needed;
 * TVmaze allows about 20 calls per 10 seconds, so calls are spaced out and cached.
 */

const BASE = 'https://api.tvmaze.com'
const GAP_MS = 550
const TIMEOUT_MS = 15000
const CACHE_TTL_MS = 12 * 60 * 60 * 1000
const CACHE_MAX = 2000

const cache = new Map()
let nextSlot = 0

/**
 * Wait for this call's turn.
 * @returns {Promise<void>}
 */
async function reserveSlot() {
  const now = Date.now()
  const at = Math.max(now, nextSlot)
  nextSlot = at + GAP_MS
  if (at > now) await new Promise((resolve) => setTimeout(resolve, at - now))
}

/**
 * GET a TVmaze path, cached. 404 is a stored "nothing"; other failures return null
 * uncached so a later call can try again.
 * @param {string} path
 * @param {{ fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<unknown>}
 */
async function tvmazeGet(path, { fetchImpl = fetch } = {}) {
  const hit = cache.get(path)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value
  await reserveSlot()
  try {
    const response = await fetchImpl(`${BASE}${path}`, {
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: 'application/json' },
    })
    if (response.status === 404) {
      cache.set(path, { at: Date.now(), value: null })
      return null
    }
    if (!response.ok) return null
    const value = await response.json()
    cache.set(path, { at: Date.now(), value })
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value)
    return value
  } catch {
    return null
  }
}

/**
 * TVmaze's show id for a show, by TVDB id then IMDb id.
 * @param {{ tvdb?: string | number | null, imdb?: string | null }} ids
 * @param {{ fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<number | null>}
 */
export async function lookupTvmazeShow({ tvdb, imdb }, options = {}) {
  if (Number(tvdb) > 0) {
    const show = await tvmazeGet(`/lookup/shows?thetvdb=${Number(tvdb)}`, options)
    if (Number(show?.id) > 0) return Number(show.id)
  }
  if (/^tt\d+$/.test(String(imdb || ''))) {
    const show = await tvmazeGet(`/lookup/shows?imdb=${imdb}`, options)
    if (Number(show?.id) > 0) return Number(show.id)
  }
  return null
}

/**
 * A TVmaze show's cast: `{ person, character, voice }` rows.
 * @param {number} showId
 * @param {{ fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<object[]>}
 */
export async function tvmazeCast(showId, options = {}) {
  if (!(Number(showId) > 0)) return []
  const cast = await tvmazeGet(`/shows/${Number(showId)}/cast`, options)
  return Array.isArray(cast) ? cast : []
}
