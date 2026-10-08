/**
 * Import a user's list from AniList, MyAnimeList, or TMDB into their watchlist.
 *
 * Domain service behind `/watchlist/import/*` (controllers/watchlistImportController.js).
 * Each source is read into the same entry shape (status, progress, 1-10 score, start and
 * finish dates, rewatches, notes), matched to catalog titles by AniList, MAL, or TMDB id,
 * and written in one transaction. Anime the catalog lacks can be added through the
 * AniList importer first (no cap; large lists just take longer). Imports run as one
 * background job per user
 * because large lists take longer than a request should; the job lives in memory, so a
 * restart only loses the progress report, never half-written rows.
 *
 * Sources:
 * - AniList: the connected account (services/connectionService.js, private lists too),
 *   or a public list by username (GraphQL, no key).
 * - MyAnimeList: the connected account, a public list by username (API v2,
 *   `MAL_CLIENT_ID`), or the XML file from MAL's export page.
 * - TMDB: the connected account's watchlist and ratings.
 */
import { gunzipSync } from 'node:zlib'
import { getPool, query } from '../../config/postgres.js'
import { fetchJson } from '../utils/fetchJson.js'
import DatabasePopulator from './contentSyncService.js'
import { anilistRequest, fetchAnilistMediaBatch } from './anilistService.js'
import { addAnilistTitle } from './anilistImport.js'
import { writeImportedHistory } from './watchEvents.js'
import { calculateUnifiedScore } from '../utils/ratings.js'
import { HttpError } from '../utils/httpError.js'
import {
  MAL_API,
  RECONNECT_STATUS,
  TMDB_API,
  accessTokenFor,
  loadConnection,
  providerLabel,
} from './connectionService.js'
import { saveUnifiedScores } from '../models/Content.js'

export const IMPORT_SOURCES = ['anilist', 'mal', 'mal_file', 'tmdb']
/** Order sources run in when several are imported together. */
const SOURCE_ORDER = ['anilist', 'mal', 'mal_file', 'tmdb']

const MAX_NOTE_LENGTH = 500
/** Finished jobs stay readable this long, and a new import waits this long after one. */
const JOB_TTL_MS = 60 * 60 * 1000
const IMPORT_COOLDOWN_MS = 60 * 1000


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
 * A source score on a 10-point scale as a 1-10 rating to the tenth (AniList keeps
 * decimals). 0 means unrated on every source.
 * @param {unknown} value
 * @returns {number|null}
 */
export function toRating(value) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return null
  return Math.min(10, Math.max(1, Math.round(number * 10) / 10))
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
    throw new ImportError(
      "That file isn't a MyAnimeList export. Use the anime list file from MAL's export page.",
    )
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
      throw new ImportError(
        "Couldn't unzip that file. Upload the .xml.gz from MAL as is, or the .xml inside it.",
      )
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
query ($userName: String, $userId: Int, $chunk: Int) {
  MediaListCollection(userName: $userName, userId: $userId, type: ANIME, chunk: $chunk, perChunk: 500) {
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
 * Every chunk of an AniList anime list. Custom lists repeat entries from the status
 * lists, so they are skipped.
 * @param {{ userName?: string, userId?: number }} who
 * @param {{ token?: string, failure: string }} options - `failure` is shown when the
 *   first chunk can't be read.
 * @returns {Promise<ImportEntry[]>}
 */
async function fetchAnilistCollection(who, { token, failure }) {
  const entries = new Map()
  for (let chunk = 1; ; chunk += 1) {
    const data = await anilistRequest(ANILIST_LIST_QUERY, { ...who, chunk }, { token })
    if (!data?.MediaListCollection) {
      if (chunk > 1) break
      throw new ImportError(failure)
    }
    for (const list of data.MediaListCollection.lists || []) {
      if (list.isCustomList) continue
      for (const raw of list.entries || []) {
        const entry = mapAnilistEntry(raw)
        if (entry) entries.set(entry.anilistId, entry)
      }
    }
    if (!data.MediaListCollection.hasNextChunk) break
  }
  return [...entries.values()]
}

/**
 * A public AniList anime list.
 * @param {string} username
 * @returns {Promise<ImportEntry[]>}
 */
export async function fetchAnilistList(username) {
  const userName = cleanUsername(username)
  return fetchAnilistCollection(
    { userName },
    {
      failure: `Couldn't read AniList user "${userName}". Check the name, and that the list isn't private.`,
    },
  )
}

const MAL_LIST_FIELDS =
  'list_status{status,score,num_episodes_watched,is_rewatching,start_date,finish_date,num_times_rewatched,comments,updated_at}'

/**
 * Every page of a MyAnimeList anime list (API v2), following `paging.next`.
 * @param {string} who - `@me` or a username.
 * @param {Record<string, string>} headers - Client id or bearer token.
 * @param {(status: number) => ImportError | null} explain - User-facing error for a status.
 * @returns {Promise<ImportEntry[]>}
 */
async function fetchMalPages(who, headers, explain) {
  const entries = []
  let url =
    `${MAL_API}/users/${encodeURIComponent(who)}/animelist` +
    `?fields=${encodeURIComponent(MAL_LIST_FIELDS)}&limit=1000&nsfw=true`
  while (url) {
    const { status, body } = await fetchJson(url, { headers })
    if (status !== 200 || !body) {
      throw explain(status) || new ImportError("MyAnimeList didn't answer. Try again in a few minutes.", 502)
    }
    for (const item of body.data || []) {
      const entry = mapMalApiEntry(item)
      if (entry) entries.push(entry)
    }
    const next = body.paging?.next
    url = typeof next === 'string' && next.startsWith(`${MAL_API}/`) ? next : null
  }
  return entries
}

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
  return fetchMalPages(name, { 'X-MAL-CLIENT-ID': clientId }, (status) => {
    if (status === 404) return new ImportError(`There's no MyAnimeList user named "${name}".`)
    if (status === 403) {
      return new ImportError(
        `${name}'s MyAnimeList is private. Connect MyAnimeList instead, or upload your MAL export file.`,
      )
    }
    return null
  })
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
 * Every page of one TMDB account list.
 * @param {string} path - e.g. `/account/1/watchlist/movies`
 * @param {string} sessionId
 * @returns {Promise<object[]>}
 */
async function fetchTmdbPages(path, sessionId) {
  const results = []
  for (let page = 1; ; page += 1) {
    const { status, body } = await fetchJson(
      `${TMDB_API}${path}?api_key=${tmdbKey()}&session_id=${encodeURIComponent(sessionId)}&page=${page}`,
    )
    if (status === 401) throw new ImportError('Your TMDB sign-in expired. Reconnect TMDB.', RECONNECT_STATUS)
    if (status !== 200 || !body)
      throw new ImportError("TMDB didn't answer. Try again in a few minutes.", 502)
    results.push(...(body.results || []))
    if (page >= Number(body.total_pages || 1)) break
  }
  return results
}

/**
 * A TMDB account's watchlist and ratings.
 * @param {string|number} accountId
 * @param {string} sessionId
 * @returns {Promise<ImportEntry[]>}
 */
export async function fetchTmdbLists(accountId, sessionId) {
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
}

/**
 * The full list of the user's connected account on a site (private lists included).
 * @param {string} userId
 * @param {'anilist'|'mal'|'tmdb'} provider
 * @returns {Promise<ImportEntry[]>}
 */
export async function fetchConnectedList(userId, provider) {
  const label = providerLabel(provider)
  const row = await loadConnection(userId, provider)
  if (!row) throw new ImportError(`Connect ${label} first.`)
  let token
  try {
    token = await accessTokenFor(row)
  } catch (error) {
    throw new ImportError(error.message, error.status || RECONNECT_STATUS)
  }
  switch (provider) {
    case 'anilist':
      return fetchAnilistCollection(
        { userId: Number(row.external_id) },
        { token, failure: "Couldn't read your AniList list. Reconnect AniList and try again." },
      )
    case 'mal':
      return fetchMalPages('@me', { Authorization: `Bearer ${token}` }, (status) =>
        status === 401
          ? new ImportError('Your MyAnimeList sign-in expired. Reconnect MyAnimeList.', RECONNECT_STATUS)
          : null,
      )
    case 'tmdb':
      return fetchTmdbLists(row.external_id, token)
    default:
      throw new ImportError('Choose AniList, MyAnimeList, or TMDB.')
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
 * Several entries from one source can land on one catalog title (e.g. MAL splits a
 * show into seasons that the catalog keeps as one). Keep one row per source and title
 * with the combined status and progress, the best score, the earliest start, and the
 * latest finish. Different sources stay apart; `planImport` compares them.
 * @param {Array<{ entry: ImportEntry, title: CatalogTitle }>} matched
 * @returns {Array<{ entry: ImportEntry, title: CatalogTitle }>}
 */
export function mergeByTitle(matched) {
  const byId = new Map()
  for (const pair of matched) {
    const key = `${pair.entry.source}:${pair.title.id}`
    const previous = byId.get(key)
    if (!previous) {
      byId.set(key, { entry: { ...pair.entry }, title: pair.title })
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

/** Longest one catalog addition may take before the import moves on without it. */
const ADD_TITLE_TIMEOUT_MS = 90 * 1000

/**
 * Resolve with the promise, or with `fallback` once `ms` pass. The slow work keeps
 * running in the background; the import just stops waiting for it.
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @param {T} fallback
 * @returns {Promise<T>}
 */
function withTimeout(promise, ms, fallback) {
  let timer
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

/**
 * Bring unmatched anime into the catalog through the AniList importer, linking titles
 * the catalog already holds under another id.
 * @param {ImportEntry[]} unmatched
 * @param {{ onProgress?: (done: number, total: number) => void }} [options]
 * @returns {Promise<{ linked: number, added: number }>}
 */
async function addMissingAnime(unmatched, { onProgress = () => {} } = {}) {
  const anime = unmatched.filter((entry) => entry.anilistId || entry.malId)
  if (!anime.length) return { linked: 0, added: 0 }
  const media = await fetchAnilistMediaBatch({
    anilistIds: anime.map((entry) => entry.anilistId).filter(Boolean),
    malIds: anime.filter((entry) => !entry.anilistId).map((entry) => entry.malId),
  })
  const populator = new DatabasePopulator()
  let linked = 0
  let added = 0
  for (const [index, item] of media.entries()) {
    try {
      const { outcome } = await withTimeout(
        addAnilistTitle(item, populator),
        ADD_TITLE_TIMEOUT_MS,
        { outcome: 'failed' },
      )
      if (outcome === 'added') added += 1
      else if (outcome === 'existing' || outcome === 'merged') linked += 1
      else if (outcome === 'failed')
        console.warn(`Watchlist import: AniList ${item.id} was not added`)
    } catch (error) {
      console.warn(`Watchlist import: adding AniList ${item.id} failed: ${error.message}`)
    }
    onProgress(index + 1, media.length)
  }
  return { linked, added }
}

// ---------------------------------------------------------------------------
// Planning: what to add, what already matches, what clashes
// ---------------------------------------------------------------------------

/**
 * @typedef {object} ImportRow - One source's version of a title (see `toWatchlistRow`).
 * @property {string} content_id
 * @property {string} status
 * @property {number} current_episode
 * @property {number|null} score
 * @property {string|null} started_on
 * @property {string|null} completed_on
 * @property {number} rewatch_count
 * @property {string|null} notes
 * @property {string|null} updated_at
 */

/**
 * @typedef {object} ImportOption - A version of a title offered when sources clash.
 * @property {string} key - The sources it came from, joined with `+` (e.g. `anilist+mal`).
 * @property {string[]} sources
 */

/**
 * Two versions agree when status and progress match and their scores don't
 * contradict (a missing score agrees with any score).
 * @param {{ status: string, current_episode: number, score: number|null }} a
 * @param {{ status: string, current_episode: number, score: number|null }} b
 * @returns {boolean}
 */
export function rowsAgree(a, b) {
  return (
    a.status === b.status &&
    Number(a.current_episode) === Number(b.current_episode) &&
    (a.score == null || b.score == null || Number(a.score) === Number(b.score))
  )
}

/**
 * Fold versions that agree into one: the score either has, the earliest start, the
 * latest finish, the most rewatches, the first notes.
 * @param {ImportRow} a
 * @param {ImportRow} b
 * @returns {ImportRow}
 */
function combineRows(a, b) {
  return {
    ...a,
    score: a.score ?? b.score ?? null,
    started_on: [a.started_on, b.started_on].filter(Boolean).sort()[0] || null,
    completed_on: [a.completed_on, b.completed_on].filter(Boolean).sort().at(-1) || null,
    rewatch_count: Math.max(a.rewatch_count || 0, b.rewatch_count || 0),
    notes: a.notes || b.notes || null,
    updated_at: [a.updated_at, b.updated_at].filter(Boolean).sort().at(-1) || null,
  }
}

/**
 * Group each title's source versions into distinct options (versions that agree
 * share one option and list every source behind it).
 * @param {Array<{ source: string, row: ImportRow }>} versions - In source order.
 * @returns {Array<ImportRow & ImportOption>}
 */
export function distinctOptions(versions) {
  const options = []
  for (const { source, row } of versions) {
    const same = options.find((option) => rowsAgree(option, row))
    if (same) {
      Object.assign(same, combineRows(same, row))
      same.sources.push(source)
      same.key = same.sources.join('+')
    } else {
      options.push({ ...row, sources: [source], key: source })
    }
  }
  return options
}

/**
 * Decide each title's fate.
 * - One option, not on the watchlist: add it.
 * - One option that agrees with the watchlist row: keep the row, filling in dates,
 *   rewatches, and a missing score from the import.
 * - Otherwise (sources disagree, or the import disagrees with the watchlist): a clash
 *   the user resolves.
 * @param {Map<string, Array<{ source: string, row: ImportRow }>>} versionsByTitle
 * @param {Map<string, { status: string, current_episode: number, score: number|null }>} existing
 * @returns {{ add: ImportRow[], fill: ImportRow[], clashes: Array<{ contentId: string, options: object[] }> }}
 */
export function planImport(versionsByTitle, existing) {
  const add = []
  const fill = []
  const clashes = []
  for (const [contentId, versions] of versionsByTitle) {
    const options = distinctOptions(versions)
    const current = existing.get(contentId)
    if (options.length === 1 && !current) {
      add.push(stripOption(options[0]))
    } else if (options.length === 1 && rowsAgree(options[0], current)) {
      fill.push(stripOption(options[0]))
    } else {
      clashes.push({ contentId, options })
    }
  }
  return { add, fill, clashes }
}

/**
 * @param {ImportRow & Partial<ImportOption>} option
 * @returns {ImportRow}
 */
function stripOption(option) {
  const { key: _key, sources: _sources, ...row } = option
  return row
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

const ROW_COLUMNS = `content_id uuid, status text, current_episode int, notes text,
  started_on date, completed_on date, rewatch_count int, updated_at timestamptz, score numeric`

/**
 * Insert new titles, or replace existing rows (`replace`), and set their scores.
 * Runs on the caller's transaction client.
 * @param {import('pg').PoolClient} client
 * @param {string} userId
 * @param {ImportRow[]} rows
 * @param {{ replace: boolean }} options
 * @returns {Promise<string[]>} Titles whose rating changed.
 */
async function upsertRows(client, userId, rows, { replace }) {
  if (!rows.length) return []
  const payload = JSON.stringify(rows)
  // New rows and replaced rows get a fresh estimate of when they were watched.
  await writeImportedHistory(client, userId, rows, { replace: true })
  await client.query(
    `INSERT INTO watchlist (
       user_id, content_id, status, current_episode, previous_episode, current_season, notes,
       started_on, completed_on, rewatch_count, imported_at, added_at, updated_at
     )
     SELECT $1, r.content_id, r.status, r.current_episode, 0, 1, r.notes,
            r.started_on, r.completed_on, r.rewatch_count, now(),
            LEAST(COALESCE(r.updated_at, now()), now()), LEAST(COALESCE(r.updated_at, now()), now())
     FROM jsonb_to_recordset($2::jsonb) AS r(${ROW_COLUMNS})
     ON CONFLICT (user_id, content_id) DO ${
       replace
         ? `UPDATE SET
              status = EXCLUDED.status,
              previous_episode = watchlist.current_episode,
              current_episode = EXCLUDED.current_episode,
              notes = COALESCE(EXCLUDED.notes, watchlist.notes),
              started_on = COALESCE(EXCLUDED.started_on, watchlist.started_on),
              completed_on = EXCLUDED.completed_on,
              rewatch_count = EXCLUDED.rewatch_count,
              imported_at = now(),
              updated_at = now()`
         : 'NOTHING'
     }`,
    [userId, payload],
  )
  // A version without a score leaves an existing rating alone.
  const { rows: rated } = await client.query(
    `INSERT INTO ratings (user_id, content_id, score, rated_at)
     SELECT $1, r.content_id, r.score, COALESCE(r.updated_at, now())
     FROM jsonb_to_recordset($2::jsonb) AS r(${ROW_COLUMNS})
     WHERE r.score BETWEEN 1 AND 10
     ON CONFLICT (user_id, content_id) DO UPDATE SET score = EXCLUDED.score
       WHERE ratings.score IS DISTINCT FROM EXCLUDED.score
     RETURNING content_id::text AS id`,
    [userId, payload],
  )
  return rated.map((row) => row.id)
}

/**
 * Fill what an agreeing import knows and the watchlist row lacks: dates, rewatches,
 * notes, and a score. Status and progress already match, so they stay.
 * @param {import('pg').PoolClient} client
 * @param {string} userId
 * @param {ImportRow[]} rows
 * @returns {Promise<string[]>} Titles that gained a rating.
 */
async function fillRows(client, userId, rows) {
  if (!rows.length) return []
  const payload = JSON.stringify(rows)
  // Agreeing rows keep any history they have; rows without one get the estimate.
  await writeImportedHistory(client, userId, rows, { replace: false })
  await client.query(
    `UPDATE watchlist w SET
       started_on = COALESCE(w.started_on, r.started_on),
       completed_on = COALESCE(w.completed_on, r.completed_on),
       rewatch_count = GREATEST(w.rewatch_count, r.rewatch_count),
       notes = COALESCE(w.notes, r.notes)
     FROM jsonb_to_recordset($2::jsonb) AS r(${ROW_COLUMNS})
     WHERE w.user_id = $1 AND w.content_id = r.content_id`,
    [userId, payload],
  )
  const { rows: rated } = await client.query(
    `INSERT INTO ratings (user_id, content_id, score, rated_at)
     SELECT $1, r.content_id, r.score, COALESCE(r.updated_at, now())
     FROM jsonb_to_recordset($2::jsonb) AS r(${ROW_COLUMNS})
     WHERE r.score BETWEEN 1 AND 10
     ON CONFLICT (user_id, content_id) DO NOTHING
     RETURNING content_id::text AS id`,
    [userId, payload],
  )
  return rated.map((row) => row.id)
}

/**
 * Run `work` in one transaction on a dedicated client (not startSession(): the job
 * keeps querying afterwards and must not inherit the transaction's async context).
 * @template T
 * @param {(client: import('pg').PoolClient) => Promise<T>} work
 * @returns {Promise<T>}
 */
async function inTransaction(work) {
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    const result = await work(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

/**
 * The user's watchlist rows (status, progress, score) for these titles.
 * @param {string} userId
 * @param {string[]} contentIds
 * @returns {Promise<Map<string, { status: string, current_episode: number, score: number|null }>>}
 */
async function loadExisting(userId, contentIds) {
  const { rows } = await query(
    `SELECT w.content_id::text AS id, w.status, w.current_episode, r.score
     FROM watchlist w
     LEFT JOIN ratings r ON r.user_id = w.user_id AND r.content_id = w.content_id
     WHERE w.user_id = $1 AND w.content_id = ANY($2::uuid[])`,
    [userId, contentIds],
  )
  return new Map(
    rows.map((row) => [
      row.id,
      {
        status: row.status,
        current_episode: Number(row.current_episode),
        score: row.score != null ? Number(row.score) : null,
      },
    ]),
  )
}

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
  await saveUnifiedScores(
    rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      score: calculateUnifiedScore(
        row.vote_average,
        row.vote_count,
        row.mal_score,
        row.mal_votes,
        row.user_rating_average != null ? Number(row.user_rating_average) : null,
        Number(row.user_rating_count || 0),
      ),
    })),
  )
}

/**
 * Match entries from every source, optionally grow the catalog, then add new titles,
 * fill agreeing ones, and save clashes for the user to resolve. Exported for tests
 * and scripts.
 * @param {string} userId
 * @param {ImportEntry[]} entries - From every source, in source order.
 * @param {{ addMissing?: boolean, onProgress?: (phase: string, done?: number, total?: number) => void }} [options]
 * @returns {Promise<object>} The import summary.
 */
export async function importEntries(userId, entries, options = {}) {
  const { addMissing = true, onProgress = () => {} } = options
  onProgress('matching')
  let { matched, unmatched } = matchEntries(entries, await loadCatalogTitles(entries))

  let catalogAdded = 0
  let catalogLinked = 0
  if (addMissing && unmatched.length) {
    const result = await addMissingAnime(unmatched, {
      onProgress: (done, total) => onProgress('adding', done, total),
    })
    catalogAdded = result.added
    catalogLinked = result.linked
    if (catalogAdded || catalogLinked) {
      const retry = matchEntries(unmatched, await loadCatalogTitles(unmatched))
      matched = matched.concat(retry.matched)
      unmatched = retry.unmatched
    }
  }

  onProgress('saving')
  const versionsByTitle = new Map()
  for (const { entry, title } of mergeByTitle(matched)) {
    const versions = versionsByTitle.get(title.id) || []
    versions.push({ source: entry.source, row: toWatchlistRow(entry, title) })
    versionsByTitle.set(title.id, versions)
  }
  const existing = await loadExisting(userId, [...versionsByTitle.keys()])
  const plan = planImport(versionsByTitle, existing)

  const ratingIds = await inTransaction(async (client) => {
    const added = await upsertRows(client, userId, plan.add, { replace: false })
    const filled = await fillRows(client, userId, plan.fill)
    if (plan.clashes.length) {
      await client.query(
        `INSERT INTO watchlist_import_conflicts (user_id, content_id, options)
         SELECT $1, c.content_id, c.options
         FROM jsonb_to_recordset($2::jsonb) AS c(content_id uuid, options jsonb)
         ON CONFLICT (user_id, content_id)
           DO UPDATE SET options = EXCLUDED.options, created_at = now()`,
        [
          userId,
          JSON.stringify(
            plan.clashes.map((clash) => ({ content_id: clash.contentId, options: clash.options })),
          ),
        ],
      )
    }
    return [...added, ...filled]
  })
  await refreshScores(ratingIds)

  return {
    total: entries.length,
    matched: matched.length,
    added: plan.add.length,
    unchanged: plan.fill.length,
    conflicts: plan.clashes.length,
    rated: ratingIds.length,
    catalogAdded,
    catalogLinked,
    notFound: unmatched.length,
    notFoundTitles: unmatched.slice(0, 50).map((entry) => entry.title),
  }
}

// ---------------------------------------------------------------------------
// Clashes
// ---------------------------------------------------------------------------

/**
 * @param {object} option - A stored ImportOption row (snake_case).
 * @returns {object} The camelCase shape the page shows.
 */
function publicOption(option) {
  return {
    key: option.key,
    sources: option.sources,
    status: option.status,
    currentEpisode: Number(option.current_episode || 0),
    score: option.score ?? null,
    startedOn: option.started_on || null,
    completedOn: option.completed_on || null,
    rewatchCount: Number(option.rewatch_count || 0),
  }
}

/**
 * Unresolved clashes, oldest first, with the title and the user's current row (if any).
 * @param {string} userId
 * @returns {Promise<object[]>}
 */
export async function listImportConflicts(userId) {
  const { rows } = await query(
    `SELECT c.content_id::text AS id, c.options, c.created_at,
            wk.title, wk.poster_path, wk.content_type, wk.episode_count,
            w.status AS current_status, w.current_episode AS current_episode, r.score AS current_score
     FROM watchlist_import_conflicts c
     JOIN works wk ON wk.id = c.content_id
     LEFT JOIN watchlist w ON w.user_id = c.user_id AND w.content_id = c.content_id
     LEFT JOIN ratings r ON r.user_id = c.user_id AND r.content_id = c.content_id
     WHERE c.user_id = $1
     ORDER BY c.created_at, wk.title`,
    [userId],
  )
  return rows.map((row) => ({
    contentId: row.id,
    title: row.title,
    posterPath: row.poster_path || '',
    contentType: row.content_type,
    episodeCount: row.episode_count != null ? Number(row.episode_count) : null,
    current: row.current_status
      ? {
          status: row.current_status,
          currentEpisode: Number(row.current_episode || 0),
          score: row.current_score != null ? Number(row.current_score) : null,
        }
      : null,
    options: (row.options || []).map(publicOption),
  }))
}

/**
 * Settle clashes. `choice` is an option key to use that version, or `keep` to leave
 * the watchlist as it is (for a title not on it yet, that means don't add it).
 * @param {string} userId
 * @param {Array<{ contentId: string, choice: string }>} choices
 * @returns {Promise<{ resolved: number, remaining: number }>}
 */
export async function resolveImportConflicts(userId, choices) {
  const wanted = new Map()
  for (const { contentId, choice } of choices || []) {
    if (typeof contentId === 'string' && typeof choice === 'string') wanted.set(contentId, choice)
  }
  if (!wanted.size) throw new ImportError('Choose a version for at least one title.')

  const { rows } = await query(
    `SELECT content_id::text AS id, options FROM watchlist_import_conflicts
     WHERE user_id = $1 AND content_id = ANY($2::uuid[])`,
    [userId, [...wanted.keys()]],
  )
  const apply = []
  const settled = []
  for (const row of rows) {
    const choice = wanted.get(row.id)
    if (choice === 'keep') {
      settled.push(row.id)
      continue
    }
    const option = (row.options || []).find((candidate) => candidate.key === choice)
    if (!option) continue
    apply.push({ ...stripOption(option), content_id: row.id })
    settled.push(row.id)
  }

  const ratingIds = await inTransaction(async (client) => {
    const rated = await upsertRows(client, userId, apply, { replace: true })
    await client.query(
      'DELETE FROM watchlist_import_conflicts WHERE user_id = $1 AND content_id = ANY($2::uuid[])',
      [userId, settled],
    )
    return rated
  })
  await refreshScores(ratingIds)

  const { rows: left } = await query(
    'SELECT count(*)::int AS count FROM watchlist_import_conflicts WHERE user_id = $1',
    [userId],
  )
  return { resolved: settled.length, remaining: left[0].count }
}

// ---------------------------------------------------------------------------
// Requests and jobs
// ---------------------------------------------------------------------------

/**
 * Check a request's sources and return their loaders in run order (AniList, then
 * MyAnimeList, then TMDB). Problems the user can fix (bad username, unreadable
 * file, the same site twice) throw here, before a job starts.
 * @param {Array<{ source: string, connected?: boolean, username?: string, file?: { xml?: string, gzipBase64?: string } }>} sources
 * @param {string} [userId] - Needed for `connected` sources.
 * @returns {Array<{ source: string, load: () => Promise<ImportEntry[]> }>}
 */
export function prepareSources(sources, userId) {
  if (!Array.isArray(sources) || !sources.length) {
    throw new ImportError('Enter at least one username to import.')
  }
  const sites = new Set()
  const prepared = []
  for (const item of sources) {
    const site = item?.source === 'mal_file' ? 'mal' : item?.source
    if (sites.has(site)) throw new ImportError('Each site can only be imported once at a time.')
    sites.add(site)
    prepared.push({ source: item.source, load: prepareImport(item.source, item, userId) })
  }
  return prepared.sort((a, b) => SOURCE_ORDER.indexOf(a.source) - SOURCE_ORDER.indexOf(b.source))
}

/**
 * The loader for one source. `connected` reads the user's connected account on that
 * site instead of a public list; TMDB can only be read that way.
 * @param {string} source
 * @param {{ connected?: boolean, username?: string, file?: { xml?: string, gzipBase64?: string } }} body
 * @param {string} [userId]
 * @returns {() => Promise<ImportEntry[]>}
 */
export function prepareImport(source, body = {}, userId) {
  if (body.connected === true || source === 'tmdb') {
    if (!['anilist', 'mal', 'tmdb'].includes(source)) {
      throw new ImportError('Choose AniList, MyAnimeList, or TMDB.')
    }
    if (!userId) throw new ImportError(`Connect ${providerLabel(source)} first.`)
    return () => fetchConnectedList(String(userId), source)
  }
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
    default:
      throw new ImportError('Choose AniList, MyAnimeList, or TMDB.')
  }
}

/** Watchlist columns the import writes (db/schema.sql). */
const IMPORT_COLUMNS = ['started_on', 'completed_on', 'rewatch_count', 'imported_at']
let schemaReady = false

/**
 * Refuse to start when the database predates the import's schema, before anything
 * (including catalog additions) is written. Checked once per process once it passes.
 * @returns {Promise<void>}
 */
export async function assertImportSchema() {
  if (schemaReady) return
  const { rows } = await query(
    `SELECT
       (SELECT count(*)::int FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'watchlist'
          AND column_name = ANY($1)) AS columns,
       to_regclass('watchlist_import_conflicts') IS NOT NULL AS conflicts_table`,
    [IMPORT_COLUMNS],
  )
  if (rows[0].columns < IMPORT_COLUMNS.length || !rows[0].conflicts_table) {
    console.error('Watchlist import: database schema is out of date; run `npm run db:schema`.')
    throw new ImportError("Importing isn't available yet. Nothing was changed.", 503)
  }
  schemaReady = true
}

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

/** A running job whose stored progress is older than this lost its instance. */
const STALE_JOB_MS = 5 * 60 * 1000
/** Minimum gap between progress writes while a job runs. */
const PERSIST_EVERY_MS = 1000

/**
 * Store a job's progress in `watchlist_import_jobs` so a progress poll that reaches a
 * different server instance still finds it. Throttled while running; `force` for the
 * start and the end. Failures only cost cross-instance visibility, never the import.
 * @param {object} job
 * @param {{ force?: boolean }} [options]
 * @returns {Promise<void>}
 */
async function persistJob(job, { force = false } = {}) {
  const now = Date.now()
  if (!force && now - (job.persistedAt || 0) < PERSIST_EVERY_MS) return
  Object.defineProperty(job, 'persistedAt', { value: now, writable: true, configurable: true })
  await query(
    `INSERT INTO watchlist_import_jobs (user_id, job, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (user_id) DO UPDATE SET job = EXCLUDED.job, updated_at = now()`,
    [job.userId, JSON.stringify(publicJob(job))],
  ).catch((error) => {
    if (error.code !== '42P01') console.warn(`Watchlist import: progress not stored: ${error.message}`)
  })
}

/**
 * A job another instance stored, or null (none, expired, or table missing).
 * @param {string} key
 * @returns {Promise<object|null>}
 */
async function storedJob(key) {
  try {
    const { rows } = await query(
      'SELECT job, updated_at FROM watchlist_import_jobs WHERE user_id = $1',
      [key],
    )
    if (!rows[0]) return null
    const job = rows[0].job
    if (job.state === 'running' && Date.now() - new Date(rows[0].updated_at).getTime() > STALE_JOB_MS) {
      return {
        ...job,
        state: 'failed',
        phase: null,
        error: 'The import stopped unexpectedly. Your watchlist keeps what was saved; try again.',
        finishedAt: new Date(rows[0].updated_at).toISOString(),
      }
    }
    return job
  } catch {
    return null
  }
}

/**
 * The user's current or most recent import (finished ones expire after an hour), from
 * this instance's memory or, failing that, the progress another instance stored.
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
export async function getImportJob(userId) {
  const key = String(userId)
  const job = jobs.get(key) ? publicJob(jobs.get(key)) : await storedJob(key)
  if (!job) return null
  if (job.finishedAt && Date.now() - new Date(job.finishedAt).getTime() > JOB_TTL_MS) {
    jobs.delete(key)
    return null
  }
  return job
}

/**
 * Start an import in the background. Sources are read in order; one that fails
 * (private list, unknown user) is reported and the rest still import.
 * @param {string} userId
 * @param {Array<{ source: string, load: () => Promise<ImportEntry[]> }>} sources - From `prepareSources`.
 * @param {{ addMissing?: boolean }} [options]
 * @returns {Promise<object>} The new job.
 */
export async function startImportJob(userId, sources, options = {}) {
  const key = String(userId)
  const current = await getImportJob(key)
  if (current?.state === 'running') {
    throw new ImportError('An import is already running. Wait for it to finish.', 409)
  }
  if (
    current?.finishedAt &&
    Date.now() - new Date(current.finishedAt).getTime() < IMPORT_COOLDOWN_MS
  ) {
    throw new ImportError('You just imported a list. Try again in a minute.', 429)
  }
  const job = {
    userId: key,
    sources: sources.map((item) => item.source),
    source: sources[0]?.source || null,
    state: 'running',
    phase: 'reading',
    done: 0,
    total: 0,
    sourceResults: [],
    result: null,
    error: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
  }
  // Claim the user's row atomically, so two instances can't both start an import.
  const claimed = await query(
    `INSERT INTO watchlist_import_jobs (user_id, job, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (user_id) DO UPDATE SET job = EXCLUDED.job, updated_at = now()
       WHERE watchlist_import_jobs.job->>'state' <> 'running'
          OR watchlist_import_jobs.updated_at < now() - make_interval(secs => $3)
     RETURNING user_id`,
    [key, JSON.stringify(publicJob(job)), STALE_JOB_MS / 1000],
  ).then(
    (result) => result.rows.length > 0,
    (error) => {
      if (error.code !== '42P01') throw error
      return true // Table not added yet: single-instance behaviour.
    },
  )
  if (!claimed) {
    throw new ImportError('An import is already running. Wait for it to finish.', 409)
  }
  jobs.set(key, job)

  const run = async () => {
    try {
      const entries = []
      for (const item of sources) {
        job.source = item.source
        job.phase = 'reading'
        try {
          const loaded = await item.load()
          entries.push(...loaded)
          job.sourceResults.push({ source: item.source, entries: loaded.length, error: null })
        } catch (error) {
          if (!(error instanceof ImportError))
            console.error(`Watchlist import (${item.source}):`, error)
          job.sourceResults.push({
            source: item.source,
            entries: 0,
            error: error instanceof ImportError ? error.message : "Couldn't read that list.",
          })
        }
      }
      if (!entries.length) {
        const reasons = job.sourceResults.map((result) => result.error).filter(Boolean)
        throw new ImportError(
          reasons[0] || 'Those lists are empty, so there was nothing to import.',
        )
      }
      job.total = entries.length
      job.result = await importEntries(key, entries, {
        ...options,
        onProgress: (phase, done = 0, total = 0) => {
          job.phase = phase
          job.done = done
          job.total = total || job.total
          void persistJob(job)
        },
      })
      job.state = 'done'
      await query('UPDATE users SET watchlist_imported_at = now() WHERE id = $1', [key]).catch(
        (error) => console.warn(`Watchlist import: could not record the import: ${error.message}`),
      )
    } catch (error) {
      job.state = 'failed'
      job.error =
        error instanceof ImportError
          ? error.message
          : 'The import failed and your watchlist was not changed. Try again later.'
      if (!(error instanceof ImportError)) console.error('Watchlist import failed:', error)
    } finally {
      job.phase = null
      job.finishedAt = new Date().toISOString()
      await persistJob(job, { force: true })
    }
  }
  run()
  return publicJob(job)
}

/** Forget every job (tests). */
export function resetImportJobs() {
  jobs.clear()
}
