/**
 * Keep connected sites and the AniLounge watchlist in step (services/connectionService.js
 * holds the connections). Only titles the catalog links to the site (AniList, MAL, or
 * TMDB id) take part.
 *
 * - AniLounge → sites: every watchlist write is sent, after its transaction commits, to
 *   each site the user connected. Writes go out one at a time per site and never fail the
 *   request. AniList and MyAnimeList get the full entry; TMDB keeps only a watchlist
 *   (plan to watch) and ratings, so that is what it gets.
 * - Sites → AniLounge (AniList and MyAnimeList): neither has webhooks, so each
 *   connection's recently updated entries are polled. An entry is applied when it is
 *   newer than the watchlist row and disagrees with it, then passed on to the user's
 *   other sites; our own writes echo back as no-ops. Removals on a site are not mirrored
 *   (their "recently updated" lists don't show deletions).
 *
 * Polling shares AniList's per-IP limit (30-90 requests a minute) with catalog work, so
 * it runs on a budget: each tick polls the connections that have waited longest, at most
 * CONNECTIONS_ANILIST_POLLS_PER_MINUTE / CONNECTIONS_MAL_POLLS_PER_MINUTE a minute, and
 * none more often than CONNECTIONS_POLL_INTERVAL_SECONDS. A quiet poll is one request.
 * With many connections each one is polled less often; "Sync now" on the Connections
 * page pulls one account straight away.
 *
 * CONNECTIONS_SYNC_ENABLED=false turns off sending and polling on this server (sign-in
 * and imports still work). Set it on a dev machine that uses the production database so
 * it doesn't sync real users' accounts alongside the live server.
 */
import { query, startSession } from '../../config/postgres.js'
import { withJobLock } from '../utils/jobLock.js'
import Content from '../models/Content.js'
import User from '../models/User.js'
import { fetchJson } from '../utils/fetchJson.js'
import { anilistRequest, anilistStatus } from './anilistService.js'
import {
  CONNECTION_PROVIDERS,
  ConnectionError,
  MAL_API,
  RECONNECT_STATUS,
  TMDB_API,
  accessTokenFor,
  envValue,
  isProviderConfigured,
  loadConnection,
  loadConnections,
  providerLabel,
  recordSync,
} from './connectionService.js'
import { mapAnilistEntry, mapMalApiEntry } from './watchlistImportService.js'
import { recordWatch } from './watchEvents.js'
import {
  applyContentRatingChange,
  getEffectiveUserRating,
  setWatchedEpisode,
  stampListDates,
  syncLegacyUserRating,
} from './watchlistWrites.js'
import { watchUnits } from '../utils/profileStats.js'

const TICK_MS = 15 * 1000
const MAX_PULL_PAGES = 5
/** "Sync now" may run once per connection in this window. */
const SYNC_NOW_COOLDOWN_MS = 30 * 1000

const STATUS_TO_ANILIST = {
  plan_to_watch: 'PLANNING',
  watching: 'CURRENT',
  completed: 'COMPLETED',
  on_hold: 'PAUSED',
  dropped: 'DROPPED',
}

const SAVE_MUTATION = `
  mutation ($mediaId: Int, $status: MediaListStatus, $scoreRaw: Int, $progress: Int,
            $repeat: Int, $startedAt: FuzzyDateInput, $completedAt: FuzzyDateInput) {
    SaveMediaListEntry(mediaId: $mediaId, status: $status, scoreRaw: $scoreRaw, progress: $progress,
                       repeat: $repeat, startedAt: $startedAt, completedAt: $completedAt) { id }
  }
`
const ENTRY_QUERY = `query ($mediaId: Int) { Media(id: $mediaId, type: ANIME) { mediaListEntry { id } } }`
const DELETE_MUTATION = `mutation ($id: Int) { DeleteMediaListEntry(id: $id) { deleted } }`
const RECENT_QUERY = `
  query ($userId: Int, $page: Int) {
    Page(page: $page, perPage: 50) {
      pageInfo { hasNextPage }
      mediaList(userId: $userId, type: ANIME, sort: UPDATED_TIME_DESC) {
        status score(format: POINT_10_DECIMAL) progress repeat notes updatedAt createdAt
        startedAt { year month day }
        completedAt { year month day }
        media { id idMal title { romaji english } }
      }
    }
  }
`
const MAL_RECENT_FIELDS =
  'list_status{status,score,num_episodes_watched,is_rewatching,start_date,finish_date,num_times_rewatched,updated_at}'

/** @type {Map<string, Promise<void>>} provider -> tail of its write queue */
const pushQueues = new Map()
const scheduler = { timer: null, running: new Set() }
/** @type {Map<string, number>} `${userId}:${provider}` -> last "Sync now" */
const syncNowAt = new Map()

// ---------------------------------------------------------------------------
// Field mapping (pure)
// ---------------------------------------------------------------------------

/**
 * @param {unknown} value - `YYYY-MM-DD` string, Date, or empty.
 * @returns {{ year: number | null, month: number | null, day: number | null }}
 */
export function toFuzzyDate(value) {
  const empty = { year: null, month: null, day: null }
  const iso = isoDay(value)
  if (!iso) return empty
  const [year, month, day] = iso.split('-').map(Number)
  return { year, month, day }
}

/**
 * @param {unknown} value
 * @returns {string | null} `YYYY-MM-DD`
 */
function isoDay(value) {
  if (!value) return null
  const text = value instanceof Date ? value.toISOString() : String(value)
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text)
  return match ? match[0] : null
}

/**
 * AniList SaveMediaListEntry variables for a watchlist row.
 * @param {number} mediaId
 * @param {object} item - Watchlist row.
 * @returns {object}
 */
export function anilistEntryVariables(mediaId, item) {
  const rating = Number(item.rating)
  return {
    mediaId,
    status: STATUS_TO_ANILIST[item.status] || 'PLANNING',
    scoreRaw: Number.isFinite(rating) && rating > 0 ? Math.round(rating * 10) : 0,
    progress: Math.max(0, Number(item.currentEpisode) || 0),
    repeat: Math.max(0, Number(item.rewatchCount) || 0),
    startedAt: toFuzzyDate(item.startedOn),
    completedAt: toFuzzyDate(item.completedOn),
  }
}

/**
 * MAL `my_list_status` form fields for a watchlist row. MAL scores are whole numbers.
 * @param {object} item - Watchlist row.
 * @returns {Record<string, string>}
 */
export function malListStatusFields(item) {
  const rating = Number(item.rating)
  const fields = {
    status: STATUS_TO_ANILIST[item.status] ? item.status : 'plan_to_watch',
    score: String(Number.isFinite(rating) && rating > 0 ? Math.min(10, Math.max(1, Math.round(rating))) : 0),
    num_watched_episodes: String(Math.max(0, Number(item.currentEpisode) || 0)),
    num_times_rewatched: String(Math.max(0, Number(item.rewatchCount) || 0)),
  }
  const started = isoDay(item.startedOn)
  const finished = isoDay(item.completedOn)
  if (started) fields.start_date = started
  if (finished) fields.finish_date = finished
  return fields
}

/**
 * TMDB rating for a 1-10 rating (TMDB takes half steps from 0.5 to 10).
 * @param {unknown} rating
 * @returns {number | null}
 */
export function tmdbRatingValue(rating) {
  const value = Number(rating)
  if (!Number.isFinite(value) || value <= 0) return null
  return Math.min(10, Math.max(0.5, Math.round(value * 2) / 2))
}

/**
 * Whether a watchlist row already says what a site's entry says. MyAnimeList only keeps
 * whole-number scores, so a 7.5 here matches an 8 there.
 * @param {object} item - Watchlist row.
 * @param {{ status: string, score: number | null, rewatchCount: number }} entry - ImportEntry.
 * @param {number} progress - The entry's progress clamped to the title.
 * @param {string} provider
 * @returns {boolean}
 */
export function rowMatchesEntry(item, entry, progress, provider) {
  const rating = Number(item.rating) > 0 ? Number(item.rating) : null
  const ours = provider === 'mal' && rating != null ? Math.round(rating) : rating
  return (
    item.status === entry.status &&
    Number(item.currentEpisode || 0) === progress &&
    ours === entry.score &&
    Number(item.rewatchCount || 0) === entry.rewatchCount
  )
}

/**
 * @param {object | null} item
 * @returns {object | null}
 */
function snapshot(item) {
  if (!item) return null
  return {
    status: item.status,
    rating: item.rating,
    currentEpisode: item.currentEpisode,
    rewatchCount: item.rewatchCount,
    startedOn: item.startedOn,
    completedOn: item.completedOn,
  }
}

/**
 * @param {string | null | undefined} iso
 * @returns {number}
 */
function timeOf(iso) {
  const time = iso ? new Date(iso).getTime() : 0
  return Number.isFinite(time) ? time : 0
}

// ---------------------------------------------------------------------------
// Site adapters
// ---------------------------------------------------------------------------

/**
 * A MyAnimeList API call with the connection's token, refreshing it once on a 401.
 * @param {object} row - Connection.
 * @param {string} url
 * @param {RequestInit} [init]
 * @returns {Promise<{ status: number, body: any }>}
 */
async function malFetch(row, url, init = {}) {
  let token = await accessTokenFor(row)
  for (let attempt = 0; ; attempt += 1) {
    const result = await fetchJson(url, {
      ...init,
      headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` },
    })
    if (result.status !== 401 || attempt > 0) return result
    token = await accessTokenFor(row, { force: true })
  }
}

/**
 * @param {object} row - TMDB connection.
 * @param {string} path
 * @param {string} method
 * @param {object} [body]
 * @returns {Promise<{ status: number, body: any }>}
 */
async function tmdbFetch(row, path, method, body) {
  const sessionId = await accessTokenFor(row)
  const url =
    `${TMDB_API}${path}?api_key=${encodeURIComponent(envValue('TMDB_API_KEY'))}` +
    `&session_id=${encodeURIComponent(sessionId)}`
  return fetchJson(url, {
    method,
    headers: { 'Content-Type': 'application/json;charset=utf-8' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
}

/**
 * Per-site behaviour: which catalog id it uses, how to send a change, how to read recent
 * changes (two-way sites only), and how to find the catalog title for one of its entries.
 */
const ADAPTERS = {
  anilist: {
    remoteId: (content) => positive(content?.anilistId),
    async push(row, mediaId, item) {
      const token = await accessTokenFor(row)
      if (item) {
        const data = await anilistRequest(SAVE_MUTATION, anilistEntryVariables(mediaId, item), { token })
        if (!data?.SaveMediaListEntry) throw new Error(`save failed for media ${mediaId}`)
        return
      }
      const found = await anilistRequest(ENTRY_QUERY, { mediaId }, { token })
      const entryId = found?.Media?.mediaListEntry?.id
      if (!entryId) return
      const data = await anilistRequest(DELETE_MUTATION, { id: entryId }, { token })
      if (!data?.DeleteMediaListEntry?.deleted) throw new Error(`delete failed for media ${mediaId}`)
    },
    async recent(row, cursor) {
      const token = await accessTokenFor(row)
      const fresh = []
      for (let page = 1; page <= MAX_PULL_PAGES; page += 1) {
        const data = await anilistRequest(
          RECENT_QUERY,
          { userId: Number(row.external_id), page },
          { token },
        )
        if (!data?.Page) {
          throw new ConnectionError(
            anilistStatus().available
              ? 'AniList refused the request. Reconnect AniList if this keeps happening.'
              : "AniList isn't answering right now.",
            502,
          )
        }
        const entries = (data.Page.mediaList || []).map(mapAnilistEntry).filter(Boolean)
        const newer = entries.filter((entry) => timeOf(entry.updatedAt) > cursor)
        fresh.push(...newer)
        if (newer.length < entries.length || !data.Page.pageInfo?.hasNextPage) break
      }
      return fresh
    },
    findContent: (entry) => Content.findOne({ anilistId: entry.anilistId }),
  },

  mal: {
    remoteId: (content) => positive(content?.malId),
    async push(row, malId, item) {
      const url = `${MAL_API}/anime/${malId}/my_list_status`
      const result = item
        ? await malFetch(row, url, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(malListStatusFields(item)).toString(),
          })
        : await malFetch(row, url, { method: 'DELETE' })
      if (result.status !== 200 && !(result.status === 404 && !item)) {
        throw new Error(`HTTP ${result.status} for anime ${malId}`)
      }
    },
    async recent(row, cursor) {
      const fresh = []
      let url =
        `${MAL_API}/users/@me/animelist?fields=${encodeURIComponent(MAL_RECENT_FIELDS)}` +
        '&sort=list_updated_at&limit=100&nsfw=true'
      for (let page = 0; url && page < MAX_PULL_PAGES; page += 1) {
        const { status, body } = await malFetch(row, url)
        if (status !== 200 || !body) {
          throw new ConnectionError("MyAnimeList isn't answering right now.", 502)
        }
        const entries = (body.data || []).map(mapMalApiEntry).filter(Boolean)
        const newer = entries.filter((entry) => timeOf(entry.updatedAt) > cursor)
        fresh.push(...newer)
        const next = body.paging?.next
        url =
          newer.length === entries.length && typeof next === 'string' && next.startsWith(`${MAL_API}/`)
            ? next
            : null
      }
      return fresh
    },
    findContent: (entry) => Content.findOne({ malId: entry.malId }),
  },

  tmdb: {
    remoteId: (content) => {
      const id = positive(content?.tmdbId)
      return id ? { id, type: content.contentType === 'tv' ? 'tv' : 'movie' } : null
    },
    async push(row, { id, type }, item) {
      const watch = await tmdbFetch(row, `/account/${row.external_id}/watchlist`, 'POST', {
        media_type: type,
        media_id: id,
        watchlist: item?.status === 'plan_to_watch',
      })
      if (watch.status === 401) throw new ConnectionError('TMDB sign-in expired. Reconnect TMDB.', RECONNECT_STATUS)
      const value = tmdbRatingValue(item?.rating)
      if (value) await tmdbFetch(row, `/${type}/${id}/rating`, 'POST', { value })
      else await tmdbFetch(row, `/${type}/${id}/rating`, 'DELETE')
    },
    recent: null,
    findContent: null,
  },
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function positive(value) {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : null
}

/**
 * @param {string} provider
 * @returns {boolean}
 */
export function providerPulls(provider) {
  return Boolean(ADAPTERS[provider]?.recent)
}

// ---------------------------------------------------------------------------
// AniLounge → sites
// ---------------------------------------------------------------------------

/**
 * @param {string} provider
 * @param {() => Promise<void>} task
 */
function enqueue(provider, task) {
  const tail = (pushQueues.get(provider) || Promise.resolve()).then(task)
  pushQueues.set(
    provider,
    tail.catch(() => {}),
  )
}

/**
 * Send a watchlist change to each site the user connected. Returns immediately; call
 * only after the change has committed.
 * @param {{ _id?: unknown, id?: unknown }} user
 * @param {object | null} content - Catalog title (needs its AniList/MAL/TMDB ids).
 * @param {object | null} item - The saved watchlist row, or null when removed.
 * @param {{ except?: string }} [options] - Skip this site (the change came from it).
 * @returns {void}
 */
export function mirrorWatchlistChange(user, content, item, { except } = {}) {
  const userId = String(user?._id || user?.id || '')
  if (!userId || !content || !syncEnabled()) return
  const row = snapshot(item)
  const targets = CONNECTION_PROVIDERS.filter(
    (provider) => provider !== except && ADAPTERS[provider].remoteId(content),
  )
  if (!targets.length) return
  loadConnections(userId)
    .then((connections) => {
      for (const connection of connections) {
        if (!targets.includes(connection.provider)) continue
        const adapter = ADAPTERS[connection.provider]
        const remoteId = adapter.remoteId(content)
        enqueue(connection.provider, async () => {
          try {
            await adapter.push(connection, remoteId, row)
          } catch (error) {
            console.warn(`Connections: sending to ${connection.provider} failed: ${error.message}`)
            if (error instanceof ConnectionError) {
              await recordSync(connection, { error: error.message, synced: false }).catch(() => {})
            }
          }
        })
      }
    })
    .catch((error) => console.warn(`Connections: loading connections failed: ${error.message}`))
}

// ---------------------------------------------------------------------------
// Sites → AniLounge
// ---------------------------------------------------------------------------

/**
 * Apply one site entry to the user's watchlist (last writer wins).
 * @param {string} userId
 * @param {import('./watchlistImportService.js').ImportEntry} entry
 * @param {string} provider
 * @returns {Promise<{ content: object, item: object } | null>} The change, or null.
 */
async function applyEntry(userId, entry, provider) {
  const content = await ADAPTERS[provider].findContent(entry)
  if (!content) return null
  const contentId = String(content._id)
  const updatedAt = timeOf(entry.updatedAt)
  const session = await startSession()
  try {
    await session.startTransaction()
    const user = await User.findById(userId).session(session)
    if (!user) {
      await session.abortTransaction()
      return null
    }
    const maxEpisodes =
      content.episodeCount || content.malEpisodes || (content.contentType === 'movie' ? 1 : 0)
    const progress = maxEpisodes ? Math.min(entry.progress, maxEpisodes) : entry.progress
    let item = user.watchlist.find((row) => row.content.toString() === contentId)
    const stale = item && new Date(item.updatedAt).getTime() >= updatedAt
    if (item && (stale || rowMatchesEntry(item, entry, progress, provider))) {
      await session.abortTransaction()
      return null
    }

    const previousRating = getEffectiveUserRating(user, contentId)
    const unitsBefore = item ? watchUnits({ ...item, content }) : 0
    if (!item) {
      user.watchlist.push({
        content: contentId,
        status: entry.status,
        currentEpisode: 0,
        previousEpisode: 0,
        currentSeason: 1,
        totalEpisodes: maxEpisodes,
        totalSeasons: content.seasonCount || 1,
        notes: '',
        rewatchCount: 0,
        addedAt: new Date(),
      })
      item = user.watchlist[user.watchlist.length - 1]
    }
    item.status = entry.status
    // MAL's whole-number score shouldn't overwrite a finer rating that rounds to it.
    const keepRating =
      provider === 'mal' && entry.score != null && Math.round(Number(item.rating)) === entry.score
    if (!keepRating) item.rating = entry.score
    setWatchedEpisode(item, progress)
    item.rewatchCount = entry.rewatchCount
    if (entry.startedOn) item.startedOn = entry.startedOn
    if (entry.completedOn) item.completedOn = entry.completedOn
    stampListDates(item)
    item.updatedAt = new Date()

    syncLegacyUserRating(user, contentId, getEffectiveUserRating(user, contentId))
    await applyContentRatingChange(
      content,
      previousRating,
      getEffectiveUserRating(user, contentId),
      session,
    )
    await user.save({ session })
    await recordWatch(userId, contentId, watchUnits({ ...item, content }) - unitsBefore)
    await session.commitTransaction()
    return { content, item }
  } catch (error) {
    await session.abortTransaction()
    throw error
  } finally {
    session.endSession()
  }
}

/**
 * Pull one connection's entries changed since its cursor, and pass what changed on to
 * the user's other sites.
 * @param {object} row - Connection.
 * @returns {Promise<{ applied: number, checked: number }>}
 */
export async function pullConnection(row) {
  const adapter = ADAPTERS[row.provider]
  if (!adapter?.recent) return { applied: 0, checked: 0 }
  const cursor = Number(row.sync_cursor) || 0
  let fresh
  try {
    fresh = await adapter.recent(row, cursor)
  } catch (error) {
    const message =
      error instanceof ConnectionError ? error.message : `Couldn't reach ${providerLabel(row.provider)}.`
    await recordSync(row, { error: message, synced: false })
    throw error
  }

  let applied = 0
  let newest = cursor
  // Oldest first so the cursor only moves past entries that were handled.
  for (const entry of fresh.reverse()) {
    try {
      const change = await applyEntry(String(row.user_id), entry, row.provider)
      if (change) {
        applied += 1
        mirrorWatchlistChange({ _id: row.user_id }, change.content, change.item, {
          except: row.provider,
        })
      }
    } catch (error) {
      console.warn(`Connections: applying ${row.provider} entry failed: ${error.message}`)
    }
    newest = Math.max(newest, timeOf(entry.updatedAt))
  }
  await recordSync(row, { cursor: newest })
  return { applied, checked: fresh.length }
}

/**
 * "Sync now" for one of the user's connections.
 * @param {string} userId
 * @param {string} provider
 * @returns {Promise<{ applied: number, checked: number }>}
 */
export async function syncNow(userId, provider) {
  if (!syncEnabled()) throw new ConnectionError('Syncing is turned off on this server.', 503)
  const row = await loadConnection(userId, provider)
  if (!row) throw new ConnectionError(`${providerLabel(provider)} isn't connected.`, 404)
  if (!providerPulls(provider)) {
    throw new ConnectionError(
      `${providerLabel(provider)} doesn't share changes back. Use Import to bring its list over.`,
    )
  }
  const key = `${userId}:${provider}`
  if (Date.now() - (syncNowAt.get(key) || 0) < SYNC_NOW_COOLDOWN_MS) {
    throw new ConnectionError('Just synced. Try again in a few seconds.', 429)
  }
  syncNowAt.set(key, Date.now())
  await query(
    'UPDATE account_connections SET last_polled_at = now() WHERE user_id = $1 AND provider = $2',
    [userId, provider],
  )
  return pullConnection(row)
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

/**
 * Whether this server sends and polls (on unless CONNECTIONS_SYNC_ENABLED is false/0/off/no).
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function syncEnabled(env = process.env) {
  return !/^(false|0|off|no)$/i.test(String(env.CONNECTIONS_SYNC_ENABLED ?? '').trim())
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ intervalSeconds: number, perMinute: Record<string, number> }}
 */
export function pollConfig(env = process.env) {
  const number = (value, fallback, min) => Math.max(min, Number(value) || fallback)
  return {
    intervalSeconds: number(env.CONNECTIONS_POLL_INTERVAL_SECONDS, 120, 30),
    perMinute: {
      anilist: number(env.CONNECTIONS_ANILIST_POLLS_PER_MINUTE, 12, 1),
      mal: number(env.CONNECTIONS_MAL_POLLS_PER_MINUTE, 20, 1),
    },
  }
}

/**
 * Poll the connections of one site that have waited longest, within its budget.
 * @param {string} provider
 * @returns {Promise<number>} Connections polled.
 */
async function pollProvider(provider) {
  if (scheduler.running.has(provider) || !isProviderConfigured(provider)) return 0
  scheduler.running.add(provider)
  try {
    const { intervalSeconds, perMinute } = pollConfig()
    const batch = Math.max(1, Math.round((perMinute[provider] * TICK_MS) / 60000))
    // Claim the batch first so a slow poll isn't picked again by the next tick.
    const { rows } = await query(
      `UPDATE account_connections SET last_polled_at = now()
       WHERE (user_id, provider) IN (
         SELECT user_id, provider FROM account_connections
         WHERE provider = $1
           AND (last_polled_at IS NULL OR last_polled_at < now() - make_interval(secs => $2))
         ORDER BY last_polled_at NULLS FIRST
         LIMIT $3
         FOR UPDATE SKIP LOCKED
       )
       RETURNING *`,
      [provider, intervalSeconds, batch],
    )
    for (const row of rows) {
      try {
        const { applied } = await pullConnection(row)
        if (applied) console.log(`Connections: pulled ${applied} change(s) from ${provider}`)
      } catch (error) {
        if (!(error instanceof ConnectionError)) {
          console.warn(`Connections: polling ${provider} failed: ${error.message}`)
        }
      }
    }
    return rows.length
  } finally {
    scheduler.running.delete(provider)
  }
}

/**
 * Start polling the two-way sites (AniList, MyAnimeList).
 * @returns {NodeJS.Timeout | null} null when CONNECTIONS_SYNC_ENABLED is off.
 */
export function startConnectionSync() {
  if (!syncEnabled()) {
    console.log('Connections sync disabled (CONNECTIONS_SYNC_ENABLED=false)')
    return null
  }
  if (scheduler.timer) return scheduler.timer
  const run = () => {
    for (const provider of CONNECTION_PROVIDERS.filter(providerPulls)) {
      // One instance per tick, so the per-minute budget holds across instances.
      withJobLock(`connections-${provider}`, () => pollProvider(provider), {
        ttlMs: 10 * 60_000,
        minIntervalMs: TICK_MS - 2000,
      }).catch((error) => {
        // Before `npm run db:schema` adds the table, stay quiet instead of logging every tick.
        if (error?.code !== '42P01') console.warn(`Connections: poll failed: ${error.message}`)
      })
    }
  }
  scheduler.timer = setInterval(run, TICK_MS)
  scheduler.timer.unref?.()
  const { intervalSeconds, perMinute } = pollConfig()
  console.log(
    `Connections sync: polling every ${intervalSeconds}s per account ` +
      `(budget ${perMinute.anilist}/min AniList, ${perMinute.mal}/min MyAnimeList)`,
  )
  return scheduler.timer
}
