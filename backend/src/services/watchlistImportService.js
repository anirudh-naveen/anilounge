/**
 * Import a user's list from AniList, MyAnimeList, or TMDB into their watchlist.
 *
 * Domain service behind `/watchlist/import/*` (controllers/watchlistImportController.js).
 * Each source is read into the same entry shape (status, progress, 1-10 score, start and
 * finish dates, rewatches, notes), matched to catalog titles by AniList, MAL, or TMDB id,
 * and written in one transaction. Anime the catalog lacks can be added through the
 * AniList importer first (capped per run). Imports run as one background job per user
 * because large lists take longer than a request should; the job lives in memory, so a
 * restart only loses the progress report, never half-written rows.
 *
 * Sources:
 * - AniList: public list by username (GraphQL, no key).
 * - MyAnimeList: public list by username (API v2, `MAL_CLIENT_ID`), or the XML file from
 *   MAL's export page, which also works for private lists.
 * - TMDB: the user approves a request token on themoviedb.org; the session made from it
 *   reads their watchlist and ratings once and is deleted right after.
 */
import { gunzipSync } from 'node:zlib'
import { getPool, query } from '../../config/postgres.js'
import DatabasePopulator from './contentSyncService.js'
import { anilistRequest, fetchAnilistMediaBatch } from './anilistService.js'
import { addAnilistTitle } from './anilistImport.js'
import { calculateUnifiedScore } from '../utils/ratings.js'
import { HttpError } from '../utils/httpError.js'

export const IMPORT_SOURCES = ['anilist', 'mal', 'mal_file', 'tmdb']

/** Catalog titles one import may add; the rest are reported as not in the catalog. */
export const MAX_CATALOG_ADDS = 60
/** Entries read from one list (AniList and MAL both cap far below this in practice). */
const MAX_ENTRIES = 5000
const MAX_NOTE_LENGTH = 500
/** Finished jobs stay readable this long, and a new import waits this long after one. */
const JOB_TTL_MS = 60 * 60 * 1000
const IMPORT_COOLDOWN_MS = 60 * 1000
const FETCH_TIMEOUT_MS = 20000

const MAL_API = 'https://api.myanimelist.net/v2'
const TMDB_API = 'https://api.themoviedb.org/3'
const TMDB_MAX_PAGES = 50

/**
 * A request the user can fix (bad username, private list, unreadable file).
 */
export class ImportError extends HttpError {
  /**
   * @param {string} message - Shown to the user.
   * @param {number} [status=400]
   */
  constructor(message, status = 400) {
    super(status, message)
    this.name = 'ImportError'
  }
}

/**
 * @typedef {object} ImportEntry
 * @property {'anilist'|'mal'|'tmdb'} source
 * @property {number|null} anilistId
 * @property {number|null} malId
 * @property {number|null} tmdbId
 * @property {'movie'|'tv'|null} tmdbType
 * @property {string} title - For the "not in catalog" report.
 * @property {'plan_to_watch'|'watching'|'completed'|'on_hold'|'dropped'} status
 * @property {number} progress - Episodes watched.
 * @property {number|null} score - 1-10, or null when unrated.
 * @property {string|null} startedOn - `YYYY-MM-DD`
 * @property {string|null} completedOn - `YYYY-MM-DD`
 * @property {number} rewatchCount
 * @property {string|null} notes
 * @property {string|null} updatedAt - ISO time the source last changed the entry.
 */

// ---------------------------------------------------------------------------
// Field mapping (pure)
// ---------------------------------------------------------------------------

/**
 * @param {unknown} value
 * @returns {number|null}
 */
function positiveInt(value) {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : null
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function count(value) {
  const number = Math.floor(Number(value))
  return Number.isFinite(number) && number > 0 ? number : 0
}

/**
 * A source score on a 10-point scale as a 1-10 rating. 0 means unrated on every source.
 * @param {unknown} value
 * @returns {number|null}
 */
export function toRating(value) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return null
  return Math.min(10, Math.max(1, Math.round(number)))
}

/**
 * `YYYY-MM-DD` from a full or year-month date; a bare year or an empty MAL date
 * (`0000-00-00`) is too vague to keep.
 * @param {number|string|null|undefined} year
 * @param {number|string|null|undefined} month
 * @param {number|string|null|undefined} [day]
 * @returns {string|null}
 */
export function toDate(year, month, day) {
  const y = Number(year)
  const m = Number(month)
  const d = Number(day) || 1
  if (!Number.isInteger(y) || y < 1900 || y > 2100) return null
  if (!Number.isInteger(m) || m < 1 || m > 12) return null
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCMonth() !== m - 1) return null
  return date.toISOString().slice(0, 10)
}

/**
 * @param {string|null|undefined} text - `YYYY-MM-DD`, `YYYY-MM`, or `YYYY`.
 * @returns {string|null}
 */
function parseDateText(text) {
  const match = String(text || '').match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/)
  return match ? toDate(match[1], match[2], match[3]) : null
}

/**
 * @param {unknown} text
 * @returns {string|null}
 */
function cleanNotes(text) {
  const value = String(text ?? '').trim()
  return value ? value.slice(0, MAX_NOTE_LENGTH) : null
}

/**
 * @param {unknown} value - Seconds or milliseconds since the epoch, or a date string.
 * @returns {string|null}
 */
function toIsoTime(value) {
  if (value == null || value === '') return null
  const number = Number(value)
  const date = Number.isFinite(number)
    ? new Date(number < 1e12 ? number * 1000 : number)
    : new Date(String(value))
  return Number.isNaN(date.getTime()) || date.getTime() <= 0 ? null : date.toISOString()
}

const ANILIST_STATUSES = {
  CURRENT: 'watching',
  REPEATING: 'watching',
  COMPLETED: 'completed',
  PAUSED: 'on_hold',
  DROPPED: 'dropped',
  PLANNING: 'plan_to_watch',
}

/**
 * One AniList MediaList entry (scores requested as POINT_10_DECIMAL).
 * @param {object} entry
 * @returns {ImportEntry|null}
 */
export function mapAnilistEntry(entry) {
  const media = entry?.media
  const anilistId = positiveInt(media?.id)
  if (!anilistId) return null
  return {
    source: 'anilist',
    anilistId,
    malId: positiveInt(media.idMal),
    tmdbId: null,
    tmdbType: null,
    title: media.title?.english || media.title?.romaji || `AniList #${anilistId}`,
    status: ANILIST_STATUSES[entry.status] || 'plan_to_watch',
    progress: count(entry.progress),
    score: toRating(entry.score),
    startedOn: toDate(entry.startedAt?.year, entry.startedAt?.month, entry.startedAt?.day),
    completedOn: toDate(entry.completedAt?.year, entry.completedAt?.month, entry.completedAt?.day),
    rewatchCount: count(entry.repeat),
    notes: cleanNotes(entry.notes),
    updatedAt: toIsoTime(entry.updatedAt) || toIsoTime(entry.createdAt),
  }
}

const MAL_STATUSES = {
  watching: 'watching',
  completed: 'completed',
  on_hold: 'on_hold',
  dropped: 'dropped',
  plan_to_watch: 'plan_to_watch',
}

/**
 * One item of MAL API v2 `users/{name}/animelist` (`{ node, list_status }`).
 * @param {object} item
 * @returns {ImportEntry|null}
 */
export function mapMalApiEntry(item) {
  const malId = positiveInt(item?.node?.id)
  if (!malId) return null
  const status = item.list_status || {}
  return {
    source: 'mal',
    anilistId: null,
    malId,
    tmdbId: null,
    tmdbType: null,
    title: item.node.title || `MAL #${malId}`,
    status: status.is_rewatching ? 'watching' : MAL_STATUSES[status.status] || 'plan_to_watch',
    progress: count(status.num_episodes_watched),
    score: toRating(status.score),
    startedOn: parseDateText(status.start_date),
    completedOn: parseDateText(status.finish_date),
    rewatchCount: count(status.num_times_rewatched),
    notes: cleanNotes(status.comments),
    updatedAt: toIsoTime(status.updated_at),
  }
}

/** `my_status` in MAL exports: words in current files, numbers in old ones. */
const MAL_EXPORT_STATUSES = {
  watching: 'watching',
  1: 'watching',
  completed: 'completed',
  2: 'completed',
  'on-hold': 'on_hold',
  'on hold': 'on_hold',
  3: 'on_hold',
  dropped: 'dropped',
  4: 'dropped',
  'plan to watch': 'plan_to_watch',
  6: 'plan_to_watch',
}

/**
 * @param {string} text
 * @returns {string}
 */
function decodeXmlText(text) {
  const cdata = text.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/)
  if (cdata) return cdata[1]
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, '&')
}

/**
 * Anime entries from a MyAnimeList XML export (Profile > Export, the `.xml` or `.xml.gz`).
 * @param {string} xml
 * @returns {ImportEntry[]}
 */
export function parseMalExport(xml) {
  const text = String(xml || '')
  if (!/<myanimelist>/i.test(text)) {
    throw new ImportError("That file isn't a MyAnimeList export. Use the anime list file from MAL's export page.")
  }
  const entries = []
  for (const [, block] of text.matchAll(/<anime>([\s\S]*?)<\/anime>/gi)) {
    /** @param {string} tag */
    const field = (tag) => {
      const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'))
      return match ? decodeXmlText(match[1]).trim() : ''
    }
    const malId = positiveInt(field('series_animedb_id'))
    if (!malId) continue
    const rewatching = ['1', 'yes'].includes(field('my_rewatching').toLowerCase())
    entries.push({
      source: 'mal',
      anilistId: null,
      malId,
      tmdbId: null,
      tmdbType: null,
      title: field('series_title') || `MAL #${malId}`,
      status: rewatching
        ? 'watching'
        : MAL_EXPORT_STATUSES[field('my_status').toLowerCase()] || 'plan_to_watch',
      progress: count(field('my_watched_episodes')),
      score: toRating(field('my_score')),
      startedOn: parseDateText(field('my_start_date')),
      completedOn: parseDateText(field('my_finish_date')),
      rewatchCount: count(field('my_times_watched')),
      notes: cleanNotes(field('my_comments')),
      updatedAt: null,
    })
    if (entries.length >= MAX_ENTRIES) break
  }
  return entries
}

/**
 * Text of an uploaded MAL export, sent as plain XML or base64 gzip.
 * @param {{ xml?: string, gzipBase64?: string }} file
 * @returns {string}
 */
export function readMalExportFile({ xml, gzipBase64 } = {}) {
  if (typeof xml === 'string' && xml.trim()) return xml
  if (typeof gzipBase64 === 'string' && gzipBase64) {
    try {
      return gunzipSync(Buffer.from(gzipBase64, 'base64')).toString('utf8')
    } catch {
      throw new ImportError("Couldn't unzip that file. Upload the .xml.gz from MAL as is, or the .xml inside it.")
    }
  }
  throw new ImportError('Choose your MyAnimeList export file.')
}

/**
 * TMDB account items. A rating means the user watched it; the watchlist is planned.
 * @param {{ watchlist: { movies: object[], tv: object[] }, rated: { movies: object[], tv: object[] } }} lists
 * @returns {ImportEntry[]}
 */
export function mapTmdbLists({ watchlist, rated }) {
  const byKey = new Map()
  /**
   * @param {object[]} items
   * @param {'movie'|'tv'} tmdbType
   * @param {boolean} isRated
   */
  const add = (items, tmdbType, isRated) => {
    for (const item of items || []) {
      const tmdbId = positiveInt(item?.id)
      if (!tmdbId) continue
      const key = `${tmdbType}:${tmdbId}`
      const previous = byKey.get(key)
      if (previous && !isRated) continue
      byKey.set(key, {
        source: 'tmdb',
        anilistId: null,
        malId: null,
        tmdbId,
        tmdbType,
        title: item.title || item.name || `TMDB #${tmdbId}`,
        status: isRated ? 'completed' : 'plan_to_watch',
        progress: 0,
        score: isRated ? toRating(item.account_rating?.value ?? item.rating) : null,
        startedOn: null,
        completedOn: isRated ? parseDateText(item.account_rating?.created_at) : null,
        rewatchCount: 0,
        notes: null,
        updatedAt: toIsoTime(item.account_rating?.created_at),
      })
    }
  }
  add(watchlist?.movies, 'movie', false)
  add(watchlist?.tv, 'tv', false)
  add(rated?.movies, 'movie', true)
  add(rated?.tv, 'tv', true)
  return [...byKey.values()]
}

// ---------------------------------------------------------------------------
// Source readers
// ---------------------------------------------------------------------------

/**
 * @param {string} url
 * @param {RequestInit} [init]
 * @returns {Promise<{ status: number, body: any }>}
 */
async function fetchJson(url, init = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    const body = await response.json().catch(() => null)
    return { status: response.status, body }
  } catch {
    return { status: 0, body: null }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * @param {unknown} username
 * @returns {string}
 */
function cleanUsername(username) {
  const value = String(username || '').trim()
  if (!/^[A-Za-z0-9_-]{2,30}$/.test(value)) {
    throw new ImportError('Enter the username exactly as it appears on your profile.')
  }
  return value
}

const ANILIST_LIST_QUERY = `
query ($userName: String, $chunk: Int) {
  MediaListCollection(userName: $userName, type: ANIME, chunk: $chunk, perChunk: 500) {
    hasNextChunk
    lists {
      isCustomList
      entries {
        status score(format: POINT_10_DECIMAL) progress repeat notes updatedAt createdAt
        startedAt { year month day }
        completedAt { year month day }
        media { id idMal title { romaji english } }
      }
    }
  }
}`

/**
 * A public AniList anime list. Custom lists repeat entries from the status lists, so
 * they are skipped.
 * @param {string} username
 * @returns {Promise<ImportEntry[]>}
 */
export async function fetchAnilistList(username) {
  const userName = cleanUsername(username)
  const entries = new Map()
  for (let chunk = 1; chunk <= 20; chunk += 1) {
    const data = await anilistRequest(ANILIST_LIST_QUERY, { userName, chunk })
    if (!data?.MediaListCollection) {
      if (chunk > 1) break
      throw new ImportError(
        `Couldn't read AniList user "${userName}". Check the name, and that the list isn't private.`,
      )
    }
    for (const list of data.MediaListCollection.lists || []) {
      if (list.isCustomList) continue
      for (const raw of list.entries || []) {
        const entry = mapAnilistEntry(raw)
        if (entry) entries.set(entry.anilistId, entry)
      }
    }
    if (!data.MediaListCollection.hasNextChunk || entries.size >= MAX_ENTRIES) break
  }
  return [...entries.values()]
}

const MAL_LIST_FIELDS =
  'list_status{status,score,num_episodes_watched,is_rewatching,start_date,finish_date,num_times_rewatched,comments,updated_at}'

/**
 * A public MyAnimeList anime list through the official API.
 * @param {string} username
 * @returns {Promise<ImportEntry[]>}
 */
export async function fetchMalList(username) {
  const name = cleanUsername(username)
  const clientId = process.env.MAL_CLIENT_ID
  if (!clientId) {
    throw new ImportError(
      "MyAnimeList username import isn't set up on this server. Upload your MAL export file instead.",
      503,
    )
  }
  const entries = []
  let url =
    `${MAL_API}/users/${encodeURIComponent(name)}/animelist` +
    `?fields=${encodeURIComponent(MAL_LIST_FIELDS)}&limit=1000&nsfw=true`
  for (let page = 0; url && page < 10; page += 1) {
    const { status, body } = await fetchJson(url, { headers: { 'X-MAL-CLIENT-ID': clientId } })
    if (status === 404) throw new ImportError(`There's no MyAnimeList user named "${name}".`)
    if (status === 403) {
      throw new ImportError(
        `${name}'s MyAnimeList is private. Make it public for a moment, or upload your MAL export file.`,
      )
    }
    if (status !== 200 || !body) {
      throw new ImportError("MyAnimeList didn't answer. Try again in a few minutes.", 502)
    }
    for (const item of body.data || []) {
      const entry = mapMalApiEntry(item)
      if (entry) entries.push(entry)
    }
    const next = body.paging?.next
    url = typeof next === 'string' && next.startsWith(`${MAL_API}/`) ? next : null
    if (entries.length >= MAX_ENTRIES) break
  }
  return entries
}

/**
 * @returns {string}
 */
function tmdbKey() {
  const key = process.env.TMDB_API_KEY
  if (!key) throw new ImportError("TMDB import isn't set up on this server.", 503)
  return encodeURIComponent(key)
}

/**
 * Step 1 of the TMDB import: a request token for the user to approve on themoviedb.org.
 * @param {string} redirectTo - Where TMDB sends the user back (an allowed frontend URL).
 * @returns {Promise<{ requestToken: string, authorizeUrl: string }>}
 */
export async function createTmdbRequestToken(redirectTo) {
  const { status, body } = await fetchJson(`${TMDB_API}/authentication/token/new?api_key=${tmdbKey()}`)
  if (status !== 200 || !body?.request_token) {
    throw new ImportError("TMDB didn't answer. Try again in a few minutes.", 502)
  }
  const token = body.request_token
  return {
    requestToken: token,
    authorizeUrl:
      `https://www.themoviedb.org/authenticate/${encodeURIComponent(token)}` +
      `?redirect_to=${encodeURIComponent(redirectTo)}`,
  }
}

/**
 * Every page of one TMDB account list.
 * @param {string} path - e.g. `/account/1/watchlist/movies`
 * @param {string} sessionId
 * @returns {Promise<object[]>}
 */
async function fetchTmdbPages(path, sessionId) {
  const results = []
  for (let page = 1; page <= TMDB_MAX_PAGES; page += 1) {
    const { status, body } = await fetchJson(
      `${TMDB_API}${path}?api_key=${tmdbKey()}&session_id=${encodeURIComponent(sessionId)}&page=${page}`,
    )
    if (status !== 200 || !body) throw new ImportError("TMDB didn't answer. Try again in a few minutes.", 502)
    results.push(...(body.results || []))
    if (page >= Number(body.total_pages || 1)) break
  }
  return results
}

/**
 * Step 2 of the TMDB import: turn the approved token into a session, read the
 * watchlist and ratings, and delete the session.
 * @param {string} requestToken
 * @returns {Promise<ImportEntry[]>}
 */
export async function fetchTmdbLists(requestToken) {
  if (typeof requestToken !== 'string' || !/^[A-Za-z0-9]{10,80}$/.test(requestToken)) {
    throw new ImportError('That TMDB sign-in link is invalid. Start the TMDB import again.')
  }
  const session = await fetchJson(`${TMDB_API}/authentication/session/new?api_key=${tmdbKey()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ request_token: requestToken }),
  })
  const sessionId = session.body?.session_id
  if (!sessionId) {
    throw new ImportError(
      "TMDB didn't approve the import. Start it again and choose Approve on TMDB.",
    )
  }
  try {
    const account = await fetchJson(
      `${TMDB_API}/account?api_key=${tmdbKey()}&session_id=${encodeURIComponent(sessionId)}`,
    )
    const accountId = account.body?.id
    if (!accountId) throw new ImportError("Couldn't read your TMDB account.", 502)
    const base = `/account/${accountId}`
    const [watchMovies, watchTv, ratedMovies, ratedTv] = await Promise.all([
      fetchTmdbPages(`${base}/watchlist/movies`, sessionId),
      fetchTmdbPages(`${base}/watchlist/tv`, sessionId),
      fetchTmdbPages(`${base}/rated/movies`, sessionId),
      fetchTmdbPages(`${base}/rated/tv`, sessionId),
    ])
    return mapTmdbLists({
      watchlist: { movies: watchMovies, tv: watchTv },
      rated: { movies: ratedMovies, tv: ratedTv },
    })
  } finally {
    await fetchJson(`${TMDB_API}/authentication/session?api_key=${tmdbKey()}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
    })
  }
}

// ---------------------------------------------------------------------------
// Catalog matching
// ---------------------------------------------------------------------------

/**
 * @typedef {object} CatalogTitle
 * @property {string} id
 * @property {string} kind
 * @property {number|null} malId
 * @property {number|null} anilistId
 * @property {number|null} tmdbId
 * @property {number|null} episodeCount
 */

/**
 * Catalog titles carrying any of the entries' external ids.
 * @param {ImportEntry[]} entries
 * @returns {Promise<CatalogTitle[]>}
 */
async function loadCatalogTitles(entries) {
  const ids = (key) => [...new Set(entries.map((entry) => entry[key]).filter(Boolean))]
  const { rows } = await query(
    `SELECT id::text AS id, kind, mal_id, anilist_id, tmdb_id, episode_count
     FROM works
     WHERE anilist_id = ANY($1::int[]) OR mal_id = ANY($2::int[]) OR tmdb_id = ANY($3::int[])`,
    [ids('anilistId'), ids('malId'), ids('tmdbId')],
  )
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    malId: row.mal_id,
    anilistId: row.anilist_id,
    tmdbId: row.tmdb_id,
    episodeCount: row.episode_count != null ? Number(row.episode_count) : null,
  }))
}

/**
 * Pair entries with catalog titles: AniList id first, then MAL id, then TMDB id of
 * the same kind (TMDB movies are movies; TMDB shows are series or specials).
 * @param {ImportEntry[]} entries
 * @param {CatalogTitle[]} titles
 * @returns {{ matched: Array<{ entry: ImportEntry, title: CatalogTitle }>, unmatched: ImportEntry[] }}
 */
export function matchEntries(entries, titles) {
  const byAnilist = new Map()
  const byMal = new Map()
  const byTmdb = new Map()
  for (const title of titles) {
    if (title.anilistId) byAnilist.set(Number(title.anilistId), title)
    if (title.malId) byMal.set(Number(title.malId), title)
    if (title.tmdbId) {
      const type = title.kind === 'movie' ? 'movie' : 'tv'
      const key = `${type}:${title.tmdbId}`
      // Prefer the series over a special sharing its TMDB id.
      if (!byTmdb.has(key) || title.kind === 'series') byTmdb.set(key, title)
    }
  }
  const matched = []
  const unmatched = []
  for (const entry of entries) {
    const title =
      (entry.anilistId && byAnilist.get(entry.anilistId)) ||
      (entry.malId && byMal.get(entry.malId)) ||
      (entry.tmdbId && byTmdb.get(`${entry.tmdbType}:${entry.tmdbId}`)) ||
      null
    if (title) matched.push({ entry, title })
    else unmatched.push(entry)
  }
  return { matched, unmatched }
}

/**
 * Status for two source entries on one catalog title: the same status stays; any
 * part in progress (or finished parts next to unstarted ones) makes it watching.
 * @param {string} a
 * @param {string} b
 * @returns {string}
 */
export function combineStatus(a, b) {
  if (a === b) return a
  const either = (status) => a === status || b === status
  if (either('watching')) return 'watching'
  if (either('on_hold')) return 'on_hold'
  if (either('dropped')) return 'dropped'
  return 'watching'
}

/**
 * Several source entries can land on one catalog title (e.g. MAL splits a show into
 * seasons that the catalog keeps as one). Keep one row per title with the combined
 * status and progress, the best score, the earliest start, and the latest finish.
 * @param {Array<{ entry: ImportEntry, title: CatalogTitle }>} matched
 * @returns {Array<{ entry: ImportEntry, title: CatalogTitle }>}
 */
export function mergeByTitle(matched) {
  const byId = new Map()
  for (const pair of matched) {
    const previous = byId.get(pair.title.id)
    if (!previous) {
      byId.set(pair.title.id, { entry: { ...pair.entry }, title: pair.title })
      continue
    }
    const a = previous.entry
    const b = pair.entry
    const status = combineStatus(a.status, b.status)
    const earliest = [a.startedOn, b.startedOn].filter(Boolean).sort()[0] || null
    const latest = [a.completedOn, b.completedOn].filter(Boolean).sort().at(-1) || null
    previous.entry = {
      ...a,
      status,
      progress: a.progress + b.progress,
      score: Math.max(a.score || 0, b.score || 0) || null,
      startedOn: earliest,
      completedOn: latest,
      rewatchCount: Math.max(a.rewatchCount, b.rewatchCount),
      notes: [a.notes, b.notes].filter(Boolean).join('\n').slice(0, MAX_NOTE_LENGTH) || null,
      updatedAt: [a.updatedAt, b.updatedAt].filter(Boolean).sort().at(-1) || null,
    }
  }
  return [...byId.values()]
}

/**
 * The watchlist row an entry becomes. Completed titles count every episode; progress
 * never passes the title's episode count.
 * @param {ImportEntry} entry
 * @param {CatalogTitle} title
 * @returns {object}
 */
export function toWatchlistRow(entry, title) {
  const total = title.episodeCount || (title.kind === 'movie' ? 1 : 0)
  let episode = entry.progress
  if (entry.status === 'completed') episode = Math.max(episode, total)
  if (total) episode = Math.min(episode, total)
  return {
    content_id: title.id,
    status: entry.status,
    current_episode: episode,
    started_on: entry.startedOn,
    completed_on: entry.status === 'completed' ? entry.completedOn : null,
    rewatch_count: entry.rewatchCount,
    notes: entry.notes,
    // When the source doesn't say, the start or finish date places the row in time.
    updated_at: entry.updatedAt || entry.completedOn || entry.startedOn || null,
    score: entry.score,
  }
}

/**
 * Add anime the catalog lacks through the AniList importer, up to `limit`.
 * @param {ImportEntry[]} unmatched
 * @param {{ limit: number, onProgress?: (done: number, total: number) => void }} options
 * @returns {Promise<number>} Titles added or linked.
 */
async function addMissingAnime(unmatched, { limit, onProgress = () => {} }) {
  const anime = unmatched.filter((entry) => entry.anilistId || entry.malId).slice(0, limit)
  if (!anime.length) return 0
  const media = await fetchAnilistMediaBatch({
    anilistIds: anime.map((entry) => entry.anilistId).filter(Boolean),
    malIds: anime.filter((entry) => !entry.anilistId).map((entry) => entry.malId),
  })
  const populator = new DatabasePopulator()
  let added = 0
  for (const [index, item] of media.entries()) {
    try {
      const { outcome } = await addAnilistTitle(item, populator)
      if (outcome !== 'skipped' && outcome !== 'failed') added += 1
    } catch (error) {
      console.warn(`Watchlist import: adding AniList ${item.id} failed: ${error.message}`)
    }
    onProgress(index + 1, media.length)
  }
  return added
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/**
 * Write the rows in one transaction. Without `overwrite`, titles already on the
 * watchlist (and ratings already given) are left as they are.
 * @param {string} userId
 * @param {object[]} rows - From `toWatchlistRow`.
 * @param {{ overwrite: boolean }} options
 * @returns {Promise<{ added: number, updated: number, unchanged: number, ratingIds: string[] }>}
 */
async function writeRows(userId, rows, { overwrite }) {
  if (!rows.length) return { added: 0, updated: 0, unchanged: 0, ratingIds: [] }
  const payload = JSON.stringify(rows)
  // A dedicated client rather than startSession(): the job keeps running queries after
  // this, and they must not inherit the transaction's async context.
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    const { rows: existing } = await client.query(
      'SELECT content_id::text AS id FROM watchlist WHERE user_id = $1 AND content_id = ANY($2::uuid[])',
      [userId, rows.map((row) => row.content_id)],
    )
    const already = new Set(existing.map((row) => row.id))

    await client.query(
      `INSERT INTO watchlist (
         user_id, content_id, status, current_episode, previous_episode, current_season, notes,
         started_on, completed_on, rewatch_count, imported_at, added_at, updated_at
       )
       SELECT $1, r.content_id, r.status, r.current_episode, 0, 1, r.notes,
              r.started_on, r.completed_on, r.rewatch_count, now(),
              LEAST(COALESCE(r.updated_at, now()), now()), LEAST(COALESCE(r.updated_at, now()), now())
       FROM jsonb_to_recordset($2::jsonb) AS r(
         content_id uuid, status text, current_episode int, notes text,
         started_on date, completed_on date, rewatch_count int, updated_at timestamptz
       )
       ON CONFLICT (user_id, content_id) DO ${
         overwrite
           ? `UPDATE SET
                status = EXCLUDED.status,
                previous_episode = watchlist.current_episode,
                current_episode = EXCLUDED.current_episode,
                notes = COALESCE(EXCLUDED.notes, watchlist.notes),
                started_on = COALESCE(EXCLUDED.started_on, watchlist.started_on),
                completed_on = COALESCE(EXCLUDED.completed_on, watchlist.completed_on),
                rewatch_count = GREATEST(EXCLUDED.rewatch_count, watchlist.rewatch_count),
                imported_at = now(),
                updated_at = now()`
           : 'NOTHING'
       }`,
      [userId, payload],
    )

    // Without overwrite, titles already on the watchlist keep their rating (or lack of one).
    const ratingRows = overwrite ? rows : rows.filter((row) => !already.has(row.content_id))
    const { rows: rated } = await client.query(
      `INSERT INTO ratings (user_id, content_id, score, rated_at)
       SELECT $1, r.content_id, r.score, COALESCE(r.updated_at, now())
       FROM jsonb_to_recordset($2::jsonb) AS r(content_id uuid, score int, updated_at timestamptz)
       WHERE r.score BETWEEN 1 AND 10
       ON CONFLICT (user_id, content_id) DO ${
         overwrite
           ? 'UPDATE SET score = EXCLUDED.score WHERE ratings.score IS DISTINCT FROM EXCLUDED.score'
           : 'NOTHING'
       }
       RETURNING content_id::text AS id`,
      [userId, JSON.stringify(ratingRows)],
    )

    await client.query('COMMIT')
    const added = rows.filter((row) => !already.has(row.content_id)).length
    const updated = overwrite ? rows.length - added : 0
    return {
      added,
      updated,
      unchanged: rows.length - added - updated,
      ratingIds: rated.map((row) => row.id),
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

const SCORE_TABLES = { movie: 'movies', series: 'series', special: 'specials' }

/**
 * Recompute the blended score of titles whose user ratings changed (the same math
 * the rating endpoint applies one vote at a time).
 * @param {string[]} contentIds
 * @returns {Promise<void>}
 */
async function refreshScores(contentIds) {
  if (!contentIds.length) return
  const { rows } = await query(
    `SELECT id::text AS id, kind, vote_average, vote_count, mal_score, mal_votes,
            user_rating_average, user_rating_count
     FROM works WHERE id = ANY($1::uuid[])`,
    [contentIds],
  )
  for (const row of rows) {
    const table = SCORE_TABLES[row.kind]
    if (!table) continue
    const score = calculateUnifiedScore(
      row.vote_average,
      row.vote_count,
      row.mal_score,
      row.mal_votes,
      row.user_rating_average != null ? Number(row.user_rating_average) : null,
      Number(row.user_rating_count || 0),
    )
    await query(`UPDATE ${table} SET unified_score = $2 WHERE content_id = $1`, [row.id, score])
  }
}

/**
 * Match, optionally grow the catalog, and write. Exported for tests and scripts.
 * @param {string} userId
 * @param {ImportEntry[]} entries
 * @param {{ overwrite?: boolean, addMissing?: boolean, onProgress?: (phase: string, done?: number, total?: number) => void }} [options]
 * @returns {Promise<object>} The import summary.
 */
export async function importEntries(userId, entries, options = {}) {
  const { overwrite = false, addMissing = true, onProgress = () => {} } = options
  onProgress('matching')
  let { matched, unmatched } = matchEntries(entries, await loadCatalogTitles(entries))

  let catalogAdded = 0
  if (addMissing && unmatched.length) {
    catalogAdded = await addMissingAnime(unmatched, {
      limit: MAX_CATALOG_ADDS,
      onProgress: (done, total) => onProgress('adding', done, total),
    })
    if (catalogAdded) {
      const retry = matchEntries(unmatched, await loadCatalogTitles(unmatched))
      matched = matched.concat(retry.matched)
      unmatched = retry.unmatched
    }
  }

  onProgress('saving')
  const merged = mergeByTitle(matched)
  const rows = merged.map(({ entry, title }) => toWatchlistRow(entry, title))
  const written = await writeRows(userId, rows, { overwrite })
  await refreshScores(written.ratingIds)

  return {
    total: entries.length,
    matched: matched.length,
    added: written.added,
    updated: written.updated,
    unchanged: written.unchanged,
    rated: written.ratingIds.length,
    catalogAdded,
    notFound: unmatched.length,
    notFoundTitles: unmatched.slice(0, 50).map((entry) => entry.title),
  }
}

/**
 * Check a request and return the loader for its source. Problems the user can fix
 * (bad username, unreadable file) throw here, before a job starts.
 * @param {string} source
 * @param {{ username?: string, file?: { xml?: string, gzipBase64?: string }, requestToken?: string }} body
 * @returns {() => Promise<ImportEntry[]>}
 */
export function prepareImport(source, body = {}) {
  switch (source) {
    case 'anilist': {
      const username = cleanUsername(body.username)
      return () => fetchAnilistList(username)
    }
    case 'mal': {
      const username = cleanUsername(body.username)
      return () => fetchMalList(username)
    }
    case 'mal_file': {
      const entries = parseMalExport(readMalExportFile(body.file))
      return async () => entries
    }
    case 'tmdb': {
      const { requestToken } = body
      return () => fetchTmdbLists(requestToken)
    }
    default:
      throw new ImportError('Choose AniList, MyAnimeList, or TMDB.')
  }
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

/** @type {Map<string, object>} userId -> job */
const jobs = new Map()

/**
 * @param {object} job
 * @returns {object}
 */
function publicJob(job) {
  const { userId: _userId, ...rest } = job
  return rest
}

/**
 * The user's current or most recent import (finished ones expire after an hour).
 * @param {string} userId
 * @returns {object|null}
 */
export function getImportJob(userId) {
  const job = jobs.get(String(userId))
  if (!job) return null
  if (job.finishedAt && Date.now() - new Date(job.finishedAt).getTime() > JOB_TTL_MS) {
    jobs.delete(String(userId))
    return null
  }
  return publicJob(job)
}

/**
 * Start an import in the background. `load` reads the source; its ImportErrors
 * become the job's error message.
 * @param {string} userId
 * @param {'anilist'|'mal'|'mal_file'|'tmdb'} source
 * @param {() => Promise<ImportEntry[]>} load
 * @param {{ overwrite?: boolean, addMissing?: boolean }} [options]
 * @returns {object} The new job.
 */
export function startImportJob(userId, source, load, options = {}) {
  const key = String(userId)
  const current = jobs.get(key)
  if (current?.state === 'running') {
    throw new ImportError('An import is already running. Wait for it to finish.', 409)
  }
  if (current?.finishedAt && Date.now() - new Date(current.finishedAt).getTime() < IMPORT_COOLDOWN_MS) {
    throw new ImportError('You just imported a list. Try again in a minute.', 429)
  }
  const job = {
    userId: key,
    source,
    state: 'running',
    phase: 'reading',
    done: 0,
    total: 0,
    result: null,
    error: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
  }
  jobs.set(key, job)

  const run = async () => {
    try {
      const entries = await load()
      if (!entries.length) throw new ImportError('That list is empty, so there was nothing to import.')
      job.total = entries.length
      job.result = await importEntries(key, entries, {
        ...options,
        onProgress: (phase, done = 0, total = 0) => {
          job.phase = phase
          job.done = done
          job.total = total || job.total
        },
      })
      job.state = 'done'
    } catch (error) {
      job.state = 'failed'
      job.error =
        error instanceof ImportError ? error.message : 'The import failed and your watchlist was not changed. Try again later.'
      if (!(error instanceof ImportError)) console.error('Watchlist import failed:', error)
    } finally {
      job.phase = null
      job.finishedAt = new Date().toISOString()
    }
  }
  run()
  return publicJob(job)
}

/** Forget every job (tests). */
export function resetImportJobs() {
  jobs.clear()
}
