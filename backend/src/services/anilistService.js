/**
 * anilistService.js — AniList GraphQL client and mappers.
 *
 * Third catalog source next to TMDB and MyAnimeList. AniList media carry their
 * MAL id, so they link MAL titles, bridge TMDB-only anime to their MAL entry,
 * and supply characters, voice actors, and animation studios with AniList ids.
 * AniList characters and staff have no MAL ids; callers merge them by AniList
 * id first, then by name within the title's franchise.
 *
 * API reference: https://docs.anilist.co
 */
import {
  characterImportanceScore,
  cleanCharacterName,
  displayPersonName,
  isUsableCharacterName,
  normalizeEntityName,
  uniqueEntityNames,
} from '../utils/entities.js'
import { buildTitleFields, titlesEqual } from '../utils/titles.js'

const ANILIST_URL = 'https://graphql.anilist.co'
const FETCH_TIMEOUT_MS = 20000
const WINDOW_MS = 60 * 1000
/** AniList advertises its per-minute limit in `X-RateLimit-Limit` (30 while degraded, 90 normally). */
const DEFAULT_LIMIT = 30
const RETRIES = 3
const OUTAGE_THRESHOLD = 5
const OUTAGE_COOLDOWN_MS = 2 * 60 * 1000
const BATCH_SIZE = 25
export const ANILIST_CHARACTERS_PER_TITLE = 12

const limiter = { limit: DEFAULT_LIMIT, window: [], pausedUntil: 0 }
const outage = { failures: 0, downUntil: 0 }
const cacheConfig = { ttlMs: 60 * 60 * 1000, maxEntries: 4000 }
const mediaCache = new Map()

/**
 * Bulk runs keep fetched media longer than page views need.
 * @param {{ ttlMs?: number, maxEntries?: number }} config
 */
export function configureAnilistCache({ ttlMs, maxEntries } = {}) {
  if (Number(ttlMs) > 0) cacheConfig.ttlMs = Number(ttlMs)
  if (Number(maxEntries) > 0) cacheConfig.maxEntries = Number(maxEntries)
}

const MEDIA_FIELDS = `
  id idMal format status countryOfOrigin isAdult
  title { romaji english native }
  synonyms
  startDate { year month day }
  endDate { year month day }
  season seasonYear episodes duration
  genres averageScore popularity
  description(asHtml: false)
  coverImage { extraLarge large }
  studios { edges { isMain node { id name isAnimationStudio } } }
`

const CHARACTER_FIELDS = `
  characters(sort: [ROLE, RELEVANCE, ID], perPage: ${ANILIST_CHARACTERS_PER_TITLE}) {
    edges {
      role
      node { id name { first middle last full native alternative } image { large } favourites }
      voiceActorRoles(sort: [RELEVANCE, ID]) {
        voiceActor { id name { full native } image { large } languageV2 }
      }
    }
  }
`

const ROLE_LABELS = { MAIN: 'Main', SUPPORTING: 'Supporting', BACKGROUND: 'Cameo' }
const VOICE_LANGUAGES = ['Japanese', 'English']
const FORMAT_TYPES = {
  TV: 'tv',
  TV_SHORT: 'tv',
  ONA: 'tv',
  MOVIE: 'movie',
  OVA: 'special',
  SPECIAL: 'special',
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function positiveInt(value) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

/**
 * Wait until another request fits the advertised per-minute limit.
 * @returns {Promise<void>}
 */
async function reserveSlot() {
  for (;;) {
    const now = Date.now()
    while (limiter.window.length && now - limiter.window[0] >= WINDOW_MS) limiter.window.shift()
    const cap = Math.max(1, limiter.limit - 2)
    const windowWait = limiter.window.length >= cap ? WINDOW_MS - (now - limiter.window[0]) : 0
    const wait = Math.max(windowWait, limiter.pausedUntil - now)
    if (wait <= 0) break
    await sleep(wait)
  }
  limiter.window.push(Date.now())
}

/**
 * Adopt AniList's advertised limit and pause when the window is spent.
 * @param {Headers | undefined} headers
 */
function readRateHeaders(headers) {
  const limit = Number(headers?.get?.('x-ratelimit-limit'))
  if (Number.isFinite(limit) && limit > 0) limiter.limit = limit
  const remaining = Number(headers?.get?.('x-ratelimit-remaining'))
  const reset = Number(headers?.get?.('x-ratelimit-reset'))
  if (remaining === 0 && Number.isFinite(reset) && reset > 0) {
    limiter.pausedUntil = Math.max(limiter.pausedUntil, reset * 1000)
  }
}

/**
 * @returns {{ consecutiveFailures: number, downUntil: number, available: boolean }}
 */
export function anilistStatus() {
  return {
    consecutiveFailures: outage.failures,
    downUntil: outage.downUntil,
    available: Date.now() >= outage.downUntil,
  }
}

function recordOutage() {
  outage.failures += 1
  if (outage.failures >= OUTAGE_THRESHOLD) outage.downUntil = Date.now() + OUTAGE_COOLDOWN_MS
}

/**
 * POST one GraphQL query. 429 waits for `Retry-After`; 5xx/network failures
 * retry once; "Not Found" and other client errors return null. After repeated
 * outage failures AniList is skipped for a cooldown.
 * @param {string} query
 * @param {object} [variables]
 * @param {{ fetchImpl?: typeof fetch, token?: string }} [options] - `token` is an AniList
 *   OAuth access token, sent as a Bearer header (needed for list mutations).
 * @returns {Promise<object|null>} The `data` object.
 */
export async function anilistRequest(query, variables = {}, { fetchImpl = fetch, token } = {}) {
  if (!anilistStatus().available) return null
  let serverRetries = 0
  for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
    await reserveSlot()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    let status = 0
    let body = null
    let headers
    try {
      const response = await fetchImpl(ANILIST_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      })
      status = response.status
      headers = response.headers
      body = await response.json().catch(() => null)
    } catch {
      status = 0
    } finally {
      clearTimeout(timer)
    }
    readRateHeaders(headers)

    if (status === 200 && body?.data) {
      outage.failures = 0
      return body.data
    }
    if (status === 429 && attempt < RETRIES) {
      const retryAfter = Number(headers?.get?.('retry-after'))
      await sleep((Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 60) * 1000)
      continue
    }
    const serverError = status === 0 || status >= 500
    if (serverError && serverRetries < 1) {
      serverRetries += 1
      await sleep(1000)
      continue
    }
    if (serverError) recordOutage()
    else outage.failures = 0
    return null
  }
  return null
}

/**
 * Whether AniList answers a trivial query.
 * @returns {Promise<boolean>}
 */
export async function probeAnilist() {
  return Boolean(await anilistRequest('query { Media(id: 1, type: ANIME) { id } }'))
}

function cacheKeys(media) {
  const keys = [`al:${media.id}`]
  if (positiveInt(media.idMal)) keys.push(`mal:${media.idMal}`)
  return keys
}

function store(key, entry) {
  mediaCache.delete(key)
  mediaCache.set(key, entry)
  while (mediaCache.size > cacheConfig.maxEntries) {
    mediaCache.delete(mediaCache.keys().next().value)
  }
}

function remember(media, withCharacters) {
  if (!media?.id) return
  const entry = { media, withCharacters, at: Date.now() }
  for (const key of cacheKeys(media)) store(key, entry)
}

/** AniList has no anime for this id; remembered so batches do not re-ask. */
function rememberMissing(key) {
  store(key, { media: null, withCharacters: true, at: Date.now() })
}

/**
 * @param {string} key
 * @param {boolean} withCharacters
 * @returns {{ media: object | null } | null} null when not cached.
 */
function cached(key, withCharacters) {
  const entry = mediaCache.get(key)
  if (!entry || Date.now() - entry.at > cacheConfig.ttlMs) return null
  if (withCharacters && !entry.withCharacters) return null
  return entry
}

/**
 * Fetch AniList media by AniList or MAL ids, 25 per request, caching results
 * so later per-title lookups do not hit the API.
 * @param {{ anilistIds?: number[], malIds?: number[] }} ids
 * @param {{ withCharacters?: boolean, fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<object[]>}
 */
export async function fetchAnilistMediaBatch(
  { anilistIds = [], malIds = [] },
  { withCharacters = false, fetchImpl } = {},
) {
  const fields = withCharacters ? `${MEDIA_FIELDS}${CHARACTER_FIELDS}` : MEDIA_FIELDS
  const results = []
  const groups = [
    ['id_in', 'al', [...new Set(anilistIds.map(positiveInt).filter(Boolean))]],
    ['idMal_in', 'mal', [...new Set(malIds.map(positiveInt).filter(Boolean))]],
  ]
  for (const [argument, prefix, ids] of groups) {
    const missing = []
    for (const id of ids) {
      const hit = cached(`${prefix}:${id}`, withCharacters)
      if (!hit) missing.push(id)
      else if (hit.media) results.push(hit.media)
    }
    for (let i = 0; i < missing.length; i += BATCH_SIZE) {
      const chunk = missing.slice(i, i + BATCH_SIZE)
      const data = await anilistRequest(
        `query ($ids: [Int]) { Page(perPage: ${BATCH_SIZE}) { media(${argument}: $ids, type: ANIME) { ${fields} } } }`,
        { ids: chunk },
        { fetchImpl },
      )
      if (!data) continue
      const found = new Set()
      for (const media of data.Page?.media || []) {
        remember(media, withCharacters)
        results.push(media)
        found.add(prefix === 'al' ? media.id : media.idMal)
      }
      for (const id of chunk) if (!found.has(id)) rememberMissing(`${prefix}:${id}`)
    }
  }
  return results
}

/**
 * One AniList anime by AniList id or MAL id (cached).
 * @param {{ anilistId?: number, malId?: number }} ids
 * @param {{ withCharacters?: boolean, fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<object|null>}
 */
export async function getAnilistMedia({ anilistId, malId } = {}, options = {}) {
  const alId = positiveInt(anilistId)
  const mal = positiveInt(malId)
  if (!alId && !mal) return null
  const key = alId ? `al:${alId}` : `mal:${mal}`
  const hit = cached(key, options.withCharacters)
  if (hit) return hit.media
  const [media] = await fetchAnilistMediaBatch(
    alId ? { anilistIds: [alId] } : { malIds: [mal] },
    options,
  )
  return media || null
}

/**
 * Anime search hits for a title (no characters).
 * @param {string} search
 * @param {{ fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<object[]>}
 */
export async function searchAnilistMedia(search, { fetchImpl } = {}) {
  const term = normalizeEntityName(search)
  if (!term) return []
  const data = await anilistRequest(
    `query ($search: String) { Page(perPage: 10) { media(search: $search, type: ANIME) { ${MEDIA_FIELDS} } } }`,
    { search: term },
    { fetchImpl },
  )
  const list = data?.Page?.media || []
  for (const media of list) remember(media, false)
  return list
}

/** Formats the catalog imports (everything but music videos). */
export const ANILIST_IMPORT_FORMATS = ['TV', 'TV_SHORT', 'MOVIE', 'ONA', 'OVA', 'SPECIAL']

/**
 * One page of AniList's most popular released, non-adult anime.
 * @param {{ page?: number, perPage?: number }} [paging]
 * @param {{ fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<{ media: object[], hasNextPage: boolean } | null>} null when AniList failed.
 */
export async function fetchAnilistPopular({ page = 1, perPage = 50 } = {}, { fetchImpl } = {}) {
  const data = await anilistRequest(
    `query ($page: Int, $perPage: Int, $formats: [MediaFormat]) {
      Page(page: $page, perPage: $perPage) {
        pageInfo { hasNextPage }
        media(type: ANIME, sort: [POPULARITY_DESC], isAdult: false, format_in: $formats,
              status_not_in: [NOT_YET_RELEASED, CANCELLED]) { ${MEDIA_FIELDS} }
      }
    }`,
    { page, perPage, formats: ANILIST_IMPORT_FORMATS },
    { fetchImpl },
  )
  if (!data) return null
  const media = data.Page?.media || []
  for (const row of media) remember(row, false)
  return { media, hasNextPage: Boolean(data.Page?.pageInfo?.hasNextPage) }
}

/**
 * AniList character detail (description, portrait, native name, aliases).
 * @param {number} id
 * @param {{ fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<object|null>}
 */
export async function getAnilistCharacter(id, options = {}) {
  if (!positiveInt(id)) return null
  const data = await anilistRequest(
    `query ($id: Int) { Character(id: $id) {
      id name { first middle last full native alternative } image { large } description(asHtml: false)
    } }`,
    { id: positiveInt(id) },
    options,
  )
  return data?.Character || null
}

/**
 * AniList staff detail plus voiced characters (most popular media first).
 * @param {number} id
 * @param {{ fetchImpl?: typeof fetch, withCharacters?: boolean }} [options]
 * @returns {Promise<object|null>}
 */
export async function getAnilistStaff(id, { withCharacters = false, fetchImpl } = {}) {
  if (!positiveInt(id)) return null
  const credits = withCharacters
    ? `characterMedia(perPage: 50, sort: [POPULARITY_DESC]) {
        edges {
          characterRole
          node { id idMal type }
          characters { id name { first middle last full native alternative } image { large } }
        }
      }`
    : ''
  const data = await anilistRequest(
    `query ($id: Int) { Staff(id: $id) {
      id name { first middle last full native alternative } image { large } description(asHtml: false)
      languageV2 ${credits}
    } }`,
    { id: positiveInt(id) },
    { fetchImpl },
  )
  return data?.Staff || null
}

/**
 * AniList image URL, or empty for the placeholder `default.jpg`.
 * @param {unknown} url
 * @returns {string}
 */
export function anilistImage(url) {
  const value = normalizeEntityName(url)
  if (!value || /\/default\.(jpe?g|png)$/i.test(value)) return ''
  return value
}

/**
 * Plain text from an AniList description: spoiler blocks, markdown, and HTML removed.
 * @param {unknown} text
 * @returns {string}
 */
export function cleanAnilistText(text) {
  return normalizeEntityName(text)
    .replace(/~!([\s\S]*?)!~/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Every title AniList knows the anime by.
 * @param {object} media
 * @returns {string[]}
 */
export function anilistMediaTitles(media) {
  return uniqueEntityNames(
    media?.title?.english,
    media?.title?.romaji,
    media?.title?.native,
    media?.synonyms || [],
  )
}

/**
 * Catalog contentType for an AniList format, or null for music videos.
 * @param {unknown} format
 * @returns {'tv' | 'movie' | 'special' | null}
 */
export function anilistContentType(format) {
  return FORMAT_TYPES[String(format || '').toUpperCase()] || null
}

/**
 * Studios credited on an AniList anime, main animation studios first.
 * @param {object} media
 * @param {{ animationOnly?: boolean }} [options]
 * @returns {Array<{ name: string, anilistId: number, isMain: boolean, animation: boolean }>}
 */
export function anilistStudioRefs(media, { animationOnly = false } = {}) {
  const seen = new Set()
  const refs = []
  for (const edge of media?.studios?.edges || []) {
    const id = positiveInt(edge?.node?.id)
    const name = normalizeEntityName(edge?.node?.name)
    if (!id || !name || seen.has(id)) continue
    const animation = Boolean(edge.node.isAnimationStudio)
    if (animationOnly && !animation) continue
    seen.add(id)
    refs.push({ name, anilistId: id, isMain: Boolean(edge.isMain), animation })
  }
  return refs.sort(
    (left, right) =>
      Number(right.animation) - Number(left.animation) || Number(right.isMain) - Number(left.isMain),
  )
}

/**
 * Map one AniList character edge onto the character upsert payload shape used
 * for Jikan rows (Japanese then English voice actors, at most three).
 * @param {object} edge
 * @param {unknown} contentId
 * @returns {object | null}
 */
/**
 * AniList's `full` drops the middle name ("Luffy Monkey" for first "Luffy",
 * middle "D.", last "Monkey"). Rebuild it from the parts when that happens.
 * @param {{ first?: string, middle?: string, last?: string, full?: string } | null | undefined} name
 * @returns {string}
 */
export function anilistFullName(name) {
  const full = normalizeEntityName(name?.full)
  const middle = normalizeEntityName(name?.middle)
  if (!middle || full.includes(middle)) return full
  return [name?.first, middle, name?.last].map(normalizeEntityName).filter(Boolean).join(' ')
}

export function mapAnilistCharacterEdge(edge, contentId) {
  const node = edge?.node
  const anilistId = positiveInt(node?.id)
  const name =
    cleanCharacterName(anilistFullName(node?.name)) || cleanCharacterName(node?.name?.native)
  if (!anilistId || !isUsableCharacterName(name)) return null
  const role = ROLE_LABELS[edge?.role] || 'Supporting'

  const seen = new Set()
  const voiceActors = (edge?.voiceActorRoles || [])
    .map((row) => row?.voiceActor)
    .filter((actor) => actor && VOICE_LANGUAGES.includes(actor.languageV2))
    .sort(
      (left, right) =>
        VOICE_LANGUAGES.indexOf(left.languageV2) - VOICE_LANGUAGES.indexOf(right.languageV2),
    )
    .filter((actor) => {
      const id = positiveInt(actor.id)
      if (!id || seen.has(id) || !displayPersonName(actor.name?.full)) return false
      seen.add(id)
      return true
    })
    .slice(0, 3)
    .map((actor) => ({
      name: displayPersonName(actor.name.full),
      nativeName: normalizeEntityName(actor.name?.native),
      language: actor.languageV2,
      anilistId: positiveInt(actor.id),
      imagePath: anilistImage(actor.image?.large),
    }))

  return {
    anilistId,
    name,
    nativeName: normalizeEntityName(node?.name?.native),
    alternativeNames: uniqueEntityNames(node?.name?.alternative || []).filter(
      (alias) => alias !== name,
    ),
    imagePath: anilistImage(node?.image?.large),
    appearance: {
      content: contentId,
      role,
      importance: characterImportanceScore({ role, favorites: node?.favourites }),
      voiceActors,
    },
  }
}

/**
 * The AniList anime that is the same title as a catalog row: a shared title,
 * a compatible format, and a start year within one. Ambiguous hits return null.
 * @param {object[]} candidates
 * @param {{ titles: string[], contentType: string, year?: number | null }} content
 * @returns {object | null}
 */
export function pickAnilistMatch(candidates, { titles = [], contentType, year = null } = {}) {
  const wanted = uniqueEntityNames(titles)
  const scored = []
  for (const media of Array.isArray(candidates) ? candidates : []) {
    if (anilistContentType(media?.format) !== contentType) continue
    const names = anilistMediaTitles(media)
    if (!names.some((name) => wanted.some((title) => titlesEqual(name, title)))) continue
    const mediaYear = positiveInt(media?.startDate?.year)
    if (year && mediaYear && Math.abs(mediaYear - year) > 1) continue
    scored.push({ media, exact: Boolean(year && mediaYear === year) })
  }
  const exact = scored.filter((row) => row.exact)
  if (exact.length === 1) return exact[0].media
  if (!exact.length && scored.length === 1) return scored[0].media
  return null
}

/** TMDB origin countries whose titles AniList catalogs (anime, donghua, aeni). */
export const ANILIST_ORIGIN_COUNTRIES = new Set(['JP', 'CN', 'KR', 'TW'])

/**
 * Search AniList by a catalog row's English then native title and return the
 * unambiguous match, if any.
 * @param {{ titles: string[], contentType: string, year?: number | null }} content
 * @param {{ fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<object | null>}
 */
export async function findAnilistMatch(content, options = {}) {
  const tried = new Set()
  for (const title of uniqueEntityNames(content.titles || []).slice(0, 2)) {
    const key = title.toLowerCase()
    if (tried.has(key)) continue
    tried.add(key)
    const match = pickAnilistMatch(await searchAnilistMedia(title, options), content)
    if (match) return match
  }
  return null
}

/**
 * Content-shaped fields from an AniList anime, for merging onto a catalog row.
 * @param {object} media
 * @returns {object | null}
 */
export function convertAnilistToContent(media) {
  const anilistId = positiveInt(media?.id)
  if (!anilistId) return null
  const english = normalizeEntityName(media.title?.english)
  const romaji = normalizeEntityName(media.title?.romaji)
  const animation = anilistStudioRefs(media, { animationOnly: true })
  return {
    anilistId,
    malId: positiveInt(media.idMal),
    contentType: anilistContentType(media.format),
    englishTitle: english || romaji,
    nativeTitle: normalizeEntityName(media.title?.native),
    alternativeTitles: anilistMediaTitles(media),
    overview: cleanAnilistText(media.description),
    posterPath: anilistImage(media.coverImage?.extraLarge || media.coverImage?.large),
    studios: animation.map((ref) => ref.name),
    studioRefs: animation.map(({ name, anilistId: id }) => ({ name, anilistId: id })),
    allStudioRefs: anilistStudioRefs(media).map(({ name, anilistId: id }) => ({ name, anilistId: id })),
  }
}

/**
 * @param {{ year?: number, month?: number, day?: number } | undefined} date
 * @returns {Date | null}
 */
function anilistDate(date) {
  const year = positiveInt(date?.year)
  if (!year) return null
  return new Date(Date.UTC(year, (positiveInt(date.month) || 1) - 1, positiveInt(date.day) || 1))
}

/**
 * A complete catalog title for an anime only AniList lists (no MAL entry).
 * @param {object} media
 * @returns {object | null}
 */
export function anilistToNewContent(media) {
  const base = convertAnilistToContent(media)
  if (!base?.contentType) return null
  const romaji = normalizeEntityName(media.title?.romaji)
  const content = {
    ...buildTitleFields({
      englishTitle: media.title?.english,
      nativeTitle: base.nativeTitle,
      fallbackTitle: romaji,
      alternativeTitles: base.alternativeTitles,
    }),
    anilistId: base.anilistId,
    contentType: base.contentType,
    overview: base.overview,
    posterPath: base.posterPath,
    studios: base.studios,
    studioRefs: base.studioRefs,
    genres: uniqueEntityNames(media.genres || []).map((name) => ({ name })),
    originCountries: media.countryOfOrigin ? [media.countryOfOrigin] : [],
    unifiedScore: Number(media.averageScore) > 0 ? Number(media.averageScore) / 10 : null,
    dataSources: { anilist: { hasData: true, lastUpdated: new Date() } },
  }
  const start = anilistDate(media.startDate)
  if (start) content.releaseDate = start
  const end = anilistDate(media.endDate)
  if (end) content.lastAirDate = end
  const season = String(media.season || '').toLowerCase()
  if (positiveInt(media.seasonYear)) content.startSeasonYear = media.seasonYear
  if (['winter', 'spring', 'summer', 'fall'].includes(season)) content.startSeason = season
  if (base.contentType === 'movie') {
    if (positiveInt(media.duration)) content.runtime = media.duration
  } else if (positiveInt(media.episodes)) {
    content.episodeCount = media.episodes
  }
  return content
}

/**
 * Test hook: forget cached media and limiter/outage state.
 */
export function resetAnilistState() {
  mediaCache.clear()
  limiter.window.length = 0
  limiter.limit = DEFAULT_LIMIT
  limiter.pausedUntil = 0
  outage.failures = 0
  outage.downUntil = 0
}
