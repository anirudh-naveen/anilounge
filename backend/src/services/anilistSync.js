/**
 * Two-way sync between one account's watchlist and its AniList anime list.
 *
 * Only the user whose email matches ANILIST_SYNC_EMAIL is synced, using the
 * personal AniList access token in ANILIST_SYNC_TOKEN. Only titles with an
 * AniList id take part.
 *
 * - AniLounge → AniList: watchlist writes are pushed after their transaction
 *   commits, one at a time in order, and never fail the request.
 * - AniList → AniLounge: AniList has no webhooks, so recently updated entries
 *   are polled (every ANILIST_SYNC_INTERVAL_SECONDS, default 60). An entry is
 *   applied when it is newer than the watchlist row and disagrees with it, so
 *   our own pushes echo back as no-ops. Removals on AniList are not mirrored.
 *
 * Env: ANILIST_SYNC_EMAIL, ANILIST_SYNC_TOKEN (both required to enable),
 * ANILIST_SYNC_INTERVAL_SECONDS.
 */
import { query, startSession } from '../../config/postgres.js'
import Content from '../models/Content.js'
import User from '../models/User.js'
import { anilistRequest } from './anilistService.js'
import { toDate, toRating } from './watchlistImportService.js'
import { recordWatch } from './watchEvents.js'
import {
  applyContentRatingChange,
  getEffectiveUserRating,
  setWatchedEpisode,
  stampListDates,
  syncLegacyUserRating,
} from './watchlistWrites.js'
import { watchUnits } from '../utils/profileStats.js'

const STATUS_TO_ANILIST = {
  plan_to_watch: 'PLANNING',
  watching: 'CURRENT',
  completed: 'COMPLETED',
  on_hold: 'PAUSED',
  dropped: 'DROPPED',
}

const STATUS_FROM_ANILIST = {
  PLANNING: 'plan_to_watch',
  CURRENT: 'watching',
  REPEATING: 'watching',
  COMPLETED: 'completed',
  PAUSED: 'on_hold',
  DROPPED: 'dropped',
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
const VIEWER_QUERY = `query { Viewer { id } }`
const RECENT_QUERY = `
  query ($userId: Int, $page: Int) {
    Page(page: $page, perPage: 50) {
      pageInfo { hasNextPage }
      mediaList(userId: $userId, type: ANIME, sort: UPDATED_TIME_DESC) {
        status score(format: POINT_10_DECIMAL) progress repeat updatedAt
        startedAt { year month day }
        completedAt { year month day }
        media { id }
      }
    }
  }
`

const MAX_PULL_PAGES = 5

let pushQueue = Promise.resolve()
const pull = { viewerId: null, cursor: 0, running: false, timer: null }

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ email: string, token: string } | null}
 */
function syncConfig(env = process.env) {
  const email = String(env.ANILIST_SYNC_EMAIL || '').trim().toLowerCase()
  const token = String(env.ANILIST_SYNC_TOKEN || '').trim()
  return email && token ? { email, token } : null
}

/**
 * @param {{ email?: string } | null | undefined} user
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function isAnilistSyncUser(user, env = process.env) {
  const config = syncConfig(env)
  return Boolean(config) && String(user?.email || '').trim().toLowerCase() === config.email
}

/**
 * @param {unknown} value - `YYYY-MM-DD` string, Date, or empty.
 * @returns {{ year: number | null, month: number | null, day: number | null }}
 */
export function toFuzzyDate(value) {
  const empty = { year: null, month: null, day: null }
  if (!value) return empty
  const iso = value instanceof Date ? value.toISOString() : String(value)
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!match) return empty
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
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

// ---------------------------------------------------------------------------
// AniLounge → AniList
// ---------------------------------------------------------------------------

/**
 * @param {number} mediaId
 * @param {object | null} item - null removes the entry.
 * @param {string} token
 * @returns {Promise<void>}
 */
async function pushEntry(mediaId, item, token) {
  if (item) {
    const data = await anilistRequest(SAVE_MUTATION, anilistEntryVariables(mediaId, item), { token })
    if (!data?.SaveMediaListEntry) console.warn(`AniList sync: save failed for media ${mediaId}`)
    return
  }
  const found = await anilistRequest(ENTRY_QUERY, { mediaId }, { token })
  const entryId = found?.Media?.mediaListEntry?.id
  if (!entryId) return
  const data = await anilistRequest(DELETE_MUTATION, { id: entryId }, { token })
  if (!data?.DeleteMediaListEntry?.deleted) {
    console.warn(`AniList sync: delete failed for media ${mediaId}`)
  }
}

/**
 * Queue a watchlist change for AniList when it belongs to the sync account.
 * Returns immediately; call only after the change has committed.
 * @param {{ email?: string }} user
 * @param {{ anilistId?: number | null } | null} content
 * @param {object | null} item - The saved watchlist row, or null when removed.
 * @returns {void}
 */
export function mirrorToAnilist(user, content, item) {
  const mediaId = Number(content?.anilistId)
  if (!isAnilistSyncUser(user) || !Number.isInteger(mediaId) || mediaId <= 0) return
  const snapshot = item
    ? {
        status: item.status,
        rating: item.rating,
        currentEpisode: item.currentEpisode,
        rewatchCount: item.rewatchCount,
        startedOn: item.startedOn,
        completedOn: item.completedOn,
      }
    : null
  const { token } = syncConfig()
  pushQueue = pushQueue
    .then(() => pushEntry(mediaId, snapshot, token))
    .catch((error) => console.warn(`AniList sync: media ${mediaId} failed: ${error.message}`))
}

// ---------------------------------------------------------------------------
// AniList → AniLounge
// ---------------------------------------------------------------------------

/**
 * One AniList MediaList entry in watchlist terms.
 * @param {object} entry
 * @returns {{ anilistId: number, status: string, rating: number | null, progress: number,
 *   rewatchCount: number, startedOn: string | null, completedOn: string | null, updatedAt: number }}
 */
export function fromAnilistEntry(entry) {
  return {
    anilistId: Number(entry.media?.id),
    status: STATUS_FROM_ANILIST[entry.status] || 'plan_to_watch',
    rating: toRating(entry.score),
    progress: Math.max(0, Number(entry.progress) || 0),
    rewatchCount: Math.max(0, Number(entry.repeat) || 0),
    startedOn: toDate(entry.startedAt?.year, entry.startedAt?.month, entry.startedAt?.day),
    completedOn: toDate(entry.completedAt?.year, entry.completedAt?.month, entry.completedAt?.day),
    updatedAt: (Number(entry.updatedAt) || 0) * 1000,
  }
}

/**
 * Whether a watchlist row already says what the AniList entry says.
 * @param {object} item - Watchlist row.
 * @param {ReturnType<typeof fromAnilistEntry>} entry
 * @param {number} progress - The entry's progress clamped to the title.
 * @returns {boolean}
 */
export function rowMatchesEntry(item, entry, progress) {
  const rating = Number(item.rating) > 0 ? Number(item.rating) : null
  return (
    item.status === entry.status &&
    Number(item.currentEpisode || 0) === progress &&
    rating === entry.rating &&
    Number(item.rewatchCount || 0) === entry.rewatchCount
  )
}

/**
 * Apply one AniList entry to the user's watchlist (last writer wins).
 * @param {string} userId
 * @param {ReturnType<typeof fromAnilistEntry>} entry
 * @returns {Promise<boolean>} True when the watchlist changed.
 */
async function applyEntry(userId, entry) {
  const content = await Content.findOne({ anilistId: entry.anilistId })
  if (!content) return false
  const contentId = String(content._id)
  const session = await startSession()
  try {
    await session.startTransaction()
    const user = await User.findById(userId).session(session)
    if (!user) {
      await session.abortTransaction()
      return false
    }
    const maxEpisodes =
      content.episodeCount || content.malEpisodes || (content.contentType === 'movie' ? 1 : 0)
    const progress = maxEpisodes ? Math.min(entry.progress, maxEpisodes) : entry.progress
    let item = user.watchlist.find((row) => row.content.toString() === contentId)
    const stale = item && new Date(item.updatedAt).getTime() >= entry.updatedAt
    if (item && (stale || rowMatchesEntry(item, entry, progress))) {
      await session.abortTransaction()
      return false
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
    item.rating = entry.rating
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
    return true
  } catch (error) {
    await session.abortTransaction()
    throw error
  } finally {
    session.endSession()
  }
}

/**
 * Pull AniList entries updated since the last poll into the sync account's watchlist.
 * @returns {Promise<{ applied: number, checked: number } | null>} null when disabled or unreachable.
 */
export async function pullFromAnilist() {
  const config = syncConfig()
  if (!config || pull.running) return null
  pull.running = true
  try {
    const { rows } = await query(`SELECT id::text AS id FROM users WHERE lower(email) = $1 LIMIT 1`, [
      config.email,
    ])
    const userId = rows[0]?.id
    if (!userId) return null
    if (!pull.viewerId) {
      const viewer = await anilistRequest(VIEWER_QUERY, {}, { token: config.token })
      pull.viewerId = viewer?.Viewer?.id || null
      if (!pull.viewerId) {
        console.warn('AniList sync: token rejected or AniList unreachable')
        return null
      }
    }

    const fresh = []
    for (let page = 1; page <= MAX_PULL_PAGES; page += 1) {
      const data = await anilistRequest(
        RECENT_QUERY,
        { userId: pull.viewerId, page },
        { token: config.token },
      )
      if (!data?.Page) return null
      const entries = (data.Page.mediaList || []).map(fromAnilistEntry)
      const newer = entries.filter((entry) => entry.updatedAt > pull.cursor && entry.anilistId > 0)
      fresh.push(...newer)
      if (newer.length < entries.length || !data.Page.pageInfo?.hasNextPage) break
    }

    let applied = 0
    // Oldest first so the cursor only moves past entries that were handled.
    for (const entry of fresh.reverse()) {
      try {
        if (await applyEntry(userId, entry)) applied += 1
      } catch (error) {
        console.warn(`AniList sync: applying media ${entry.anilistId} failed: ${error.message}`)
      }
      pull.cursor = Math.max(pull.cursor, entry.updatedAt)
    }
    if (applied) console.log(`AniList sync: pulled ${applied} change(s) from AniList`)
    return { applied, checked: fresh.length }
  } finally {
    pull.running = false
  }
}

/**
 * Start polling AniList when ANILIST_SYNC_EMAIL and ANILIST_SYNC_TOKEN are set.
 * @returns {NodeJS.Timeout | null}
 */
export function startAnilistSync() {
  if (!syncConfig() || pull.timer) return pull.timer
  const seconds = Math.max(30, Number(process.env.ANILIST_SYNC_INTERVAL_SECONDS) || 60)
  const run = () =>
    pullFromAnilist().catch((error) => console.warn(`AniList sync: poll failed: ${error.message}`))
  pull.timer = setInterval(run, seconds * 1000)
  pull.timer.unref?.()
  run()
  console.log(`AniList sync: enabled, polling every ${seconds}s`)
  return pull.timer
}
