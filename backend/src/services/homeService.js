/**
 * Homepage feeds: watchlist activity, release updates, and character of the day.
 *
 * Layer: service. Reads Postgres directly; classification and shaping helpers
 * are pure so they can be tested without a database.
 */

import { query } from '../../config/postgres.js'
import { contentTypeFromKind } from '../db/kinds.js'
import { mapContentRow } from '../models/Content.js'
import Entity from '../models/Entity.js'
import { ensureCharacterAbout, serializeEntityDetails } from './entityService.js'
import { friendIds } from './friendService.js'

const DAY_MS = 24 * 60 * 60 * 1000
const RECENT_EPISODE_DAYS = 3
const EPISODE_LOOKAHEAD_DAYS = 14
const RECENT_RELEASE_DAYS = 14
const RELEASE_LOOKAHEAD_DAYS = 365
const TRENDING_TTL_MS = 10 * 60 * 1000
const CHARACTER_POOL_SIZE = 500
const CHARACTER_MIN_SCORE = 7.5
const RELATED_KINDS = ['sequel', 'side_story', 'parent_story', 'alternative_setting']

/** Rows whose `updated_at` is within this of `added_at` are reported as new adds. */
const ADD_WINDOW_MS = 2000

function toTime(value) {
  if (!value) return null
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? null : time
}

/**
 * Catalog fields the homepage cards and airing labels need.
 * @param {object} content - Mapped content row.
 * @returns {object}
 */
export function slimContent(content) {
  return {
    _id: String(content._id),
    title: content.title,
    englishTitle: content.englishTitle,
    nativeTitle: content.nativeTitle,
    posterPath: content.posterPath || '',
    backdropPath: content.backdropPath || '',
    contentType: content.contentType,
    malStatus: content.malStatus,
    releaseDate: content.releaseDate,
    broadcastDay: content.broadcastDay,
    nextEpisodeAirDate: content.nextEpisodeAirDate,
    nextEpisodeNumber: content.nextEpisodeNumber,
    episodeCount: content.episodeCount,
  }
}

/**
 * Whether a title belongs in the release sidebar, and as which kind of update.
 * `episode` is an airing TV show with a recent or near next episode (or a weekly
 * slot the client can resolve); `premiere` is an unaired or just-released title.
 *
 * @param {object} content - Slim or mapped content.
 * @param {Date} [now]
 * @returns {{ kind: 'episode' | 'premiere', at: string | null } | null}
 */
export function classifyUpdate(content, now = new Date()) {
  if (!content) return null
  const nowMs = now.getTime()
  const release = toTime(content.releaseDate)
  const releaseIso = release != null ? new Date(release).toISOString() : null

  if (content.malStatus === 'not_yet_aired') {
    if (release != null && release > nowMs + RELEASE_LOOKAHEAD_DAYS * DAY_MS) return null
    return { kind: 'premiere', at: releaseIso }
  }

  if (content.contentType === 'tv' && content.malStatus !== 'finished_airing') {
    const next = toTime(content.nextEpisodeAirDate)
    const nextInWindow =
      next != null &&
      next >= nowMs - RECENT_EPISODE_DAYS * DAY_MS &&
      next <= nowMs + EPISODE_LOOKAHEAD_DAYS * DAY_MS
    if (nextInWindow) return { kind: 'episode', at: new Date(next).toISOString() }
    const weekly = content.broadcastDay && content.broadcastDay !== 'other'
    if (content.malStatus === 'currently_airing' && weekly) return { kind: 'episode', at: null }
  }

  if (
    content.malStatus !== 'currently_airing' &&
    release != null &&
    release >= nowMs - RECENT_RELEASE_DAYS * DAY_MS &&
    release <= nowMs + RELEASE_LOOKAHEAD_DAYS * DAY_MS
  ) {
    return { kind: 'premiere', at: releaseIso }
  }

  return null
}

/**
 * Soonest first; undated updates (weekly slots, TBA premieres) go last.
 * @param {Array<{ at: string | null }>} items
 * @returns {Array<{ at: string | null }>}
 */
export function sortUpdates(items) {
  return [...items].sort((left, right) => {
    const a = toTime(left.at)
    const b = toTime(right.at)
    if (a == null && b == null) return 0
    if (a == null) return 1
    if (b == null) return -1
    return a - b
  })
}

/**
 * Shape one watchlist row into a feed entry.
 * @param {object} row - Joined watchlist/user/content row.
 * @param {string} viewerId
 * @returns {object}
 */
export function mapActivityRow(row, viewerId) {
  const added = toTime(row.added_at)
  const updated = toTime(row.updated_at) ?? added
  const isNew = added != null && Math.abs((updated ?? added) - added) <= ADD_WINDOW_MS
  return {
    id: `${row.user_id}:${row.content_id}`,
    user: {
      _id: String(row.user_id),
      username: row.username,
      profilePicture: row.profile_picture || null,
      isSelf: String(row.user_id) === String(viewerId),
    },
    action: isNew ? 'added' : 'updated',
    status: row.status,
    currentEpisode: Number(row.current_episode || 0),
    previousEpisode: Number(row.previous_episode || 0),
    rating: row.score != null ? Number(row.score) : null,
    at: new Date(updated ?? Date.now()).toISOString(),
    content: {
      _id: String(row.content_id),
      title: row.name,
      nativeTitle: row.native_name,
      posterPath: row.image_path || '',
      contentType: contentTypeFromKind(row.kind),
      episodeCount: row.episode_count != null ? Number(row.episode_count) : null,
    },
  }
}

async function watchlistActivity(userIds, viewerId, limit) {
  if (!userIds.length) return []
  const { rows } = await query(
    `SELECT w.user_id, w.content_id, w.status, w.current_episode, w.previous_episode,
            w.added_at, w.updated_at,
            u.username, u.profile_picture,
            c.name, c.native_name, c.image_path, c.kind,
            s.episode_count, r.score
     FROM watchlist w
     JOIN users u ON u.id = w.user_id
     JOIN content c ON c.id = w.content_id
     LEFT JOIN series s ON s.content_id = c.id
     LEFT JOIN ratings r ON r.user_id = w.user_id AND r.content_id = w.content_id
     WHERE w.user_id = ANY($1::uuid[])
       -- Rows an import wrote stay out until the user changes them.
       AND (w.imported_at IS NULL OR w.updated_at > w.imported_at)
     ORDER BY w.updated_at DESC
     LIMIT $2`,
    [userIds, limit],
  )
  return rows.map((row) => mapActivityRow(row, viewerId))
}

/**
 * Latest watchlist changes for the viewer and their accepted friends.
 * @param {string} userId
 * @param {{ limit?: number }} [options]
 * @returns {Promise<{ personal: object[], friends: object[], friendCount: number }>}
 */
export async function getActivityFeed(userId, { limit = 12 } = {}) {
  const friends = await friendIds(userId)
  const [personal, friendActivity] = await Promise.all([
    watchlistActivity([String(userId)], userId, limit),
    watchlistActivity(friends, userId, limit),
  ])
  return { personal, friends: friendActivity, friendCount: friends.length }
}

const UPDATE_WINDOW_SQL = `(
  w.airing_status IN ('airing', 'upcoming')
  OR w.release_date >= now() - interval '${RECENT_RELEASE_DAYS} days'
  OR w.next_episode_at >= now() - interval '${RECENT_EPISODE_DAYS} days'
)`

function toUpdateItems(rows, now, reasonFor) {
  const seen = new Set()
  const items = []
  for (const row of rows) {
    const content = slimContent(mapContentRow(row))
    if (seen.has(content._id)) continue
    const update = classifyUpdate(content, now)
    if (!update) continue
    seen.add(content._id)
    items.push({
      ...update,
      reason: reasonFor(row),
      via: row.via_id ? { _id: String(row.via_id), title: row.via_title } : null,
      content,
    })
  }
  return sortUpdates(items)
}

/**
 * New episodes and upcoming titles for the viewer's watchlist, including
 * unaired sequels and franchise entries they have not added yet.
 * @param {string} userId
 * @param {{ now?: Date, limit?: number }} [options]
 * @returns {Promise<object[]>}
 */
export async function getWatchlistUpdates(userId, { now = new Date(), limit = 10 } = {}) {
  const { rows } = await query(
    `WITH tracked AS (
       SELECT content_id FROM watchlist WHERE user_id = $1 AND status <> 'dropped'
     ),
     related AS (
       SELECT fm2.member_id AS id, t.content_id AS via_id
       FROM tracked t
       JOIN franchise_members fm ON fm.member_id = t.content_id
       JOIN franchise_members fm2
         ON fm2.franchise_id = fm.franchise_id AND fm2.member_id <> t.content_id
       UNION
       SELECT cr.to_id, cr.from_id
       FROM tracked t
       JOIN content_relations cr ON cr.from_id = t.content_id AND cr.kind = ANY($2::text[])
     ),
     candidates AS (
       SELECT content_id AS id, NULL::uuid AS via_id, 0 AS rank FROM tracked
       UNION ALL
       SELECT r.id, r.via_id, 1 FROM related r
       WHERE r.id NOT IN (SELECT content_id FROM watchlist WHERE user_id = $1)
     )
     SELECT w.*, cand.via_id, via.name AS via_title
     FROM candidates cand
     JOIN works w ON w.id = cand.id
     LEFT JOIN content via ON via.id = cand.via_id
     WHERE ${UPDATE_WINDOW_SQL}
     ORDER BY cand.rank`,
    [userId, RELATED_KINDS],
  )
  const items = toUpdateItems(rows, now, (row) => (row.via_id ? 'related' : 'watchlist'))
  // Related titles only matter while unaired or just released, not for weekly episodes.
  return items
    .filter((item) => item.reason === 'watchlist' || item.kind === 'premiere')
    .slice(0, limit)
}

let trendingCache = { at: 0, items: [] }

/**
 * Popular airing shows and upcoming titles, cached briefly.
 * @param {{ now?: Date, limit?: number }} [options]
 * @returns {Promise<object[]>}
 */
export async function getTrendingUpdates({ now = new Date(), limit = 10 } = {}) {
  if (Date.now() - trendingCache.at > TRENDING_TTL_MS) {
    const { rows } = await query(
      `SELECT w.* FROM works w
       WHERE ${UPDATE_WINDOW_SQL}
       ORDER BY w.popularity DESC NULLS LAST, w.unified_score DESC NULLS LAST
       LIMIT 80`,
    )
    trendingCache = { at: Date.now(), items: toUpdateItems(rows, now, () => 'trending') }
  }
  const half = Math.ceil(limit / 2)
  const episodes = trendingCache.items.filter((item) => item.kind === 'episode').slice(0, half)
  const premieres = trendingCache.items
    .filter((item) => item.kind === 'premiere')
    .slice(0, limit - episodes.length)
  return sortUpdates([...episodes, ...premieres])
}

/**
 * Watchlist updates for signed-in users, trending releases otherwise.
 * @param {string | null} userId
 * @returns {Promise<{ source: 'watchlist' | 'trending', items: object[] }>}
 */
export async function getReleaseUpdates(userId) {
  if (userId) {
    const items = await getWatchlistUpdates(userId)
    if (items.length) return { source: 'watchlist', items }
  }
  return { source: 'trending', items: await getTrendingUpdates() }
}

/**
 * UTC calendar day used to rotate the character of the day.
 * @param {Date} [now]
 * @returns {string} `YYYY-MM-DD`
 */
export function dayKey(now = new Date()) {
  return now.toISOString().slice(0, 10)
}

const characterCache = new Map()

async function pickCharacterId(day) {
  const { rows } = await query(
    `WITH work_stats AS (
       SELECT content_id AS id, unified_score, coalesce(mal_votes, 0) + coalesce(tmdb_votes, 0) AS votes
       FROM series
       UNION ALL
       SELECT content_id, unified_score, coalesce(mal_votes, 0) + coalesce(tmdb_votes, 0) FROM movies
       UNION ALL
       SELECT content_id, unified_score, coalesce(mal_votes, 0) + coalesce(tmdb_votes, 0) FROM specials
     ),
     pool AS (
       SELECT c.id, max(ws.votes) AS votes
       FROM content c
       JOIN appearances a ON a.character_id = c.id AND a.role = 'main'
       JOIN work_stats ws ON ws.id = a.work_id
       WHERE c.kind = 'character'
         AND coalesce(c.image_path, '') <> ''
         AND ws.unified_score >= $2
       GROUP BY c.id
       ORDER BY votes DESC, c.id
       LIMIT $3
     )
     SELECT id FROM pool ORDER BY md5(id::text || $1) LIMIT 1`,
    [day, CHARACTER_MIN_SCORE, CHARACTER_POOL_SIZE],
  )
  return rows[0]?.id ? String(rows[0].id) : null
}

/**
 * One main character from a well-rated title, stable for the whole UTC day.
 * Missing bios are filled from Jikan/AniList on first request.
 * @param {Date} [now]
 * @returns {Promise<object | null>}
 */
export async function getCharacterOfTheDay(now = new Date()) {
  const day = dayKey(now)
  if (characterCache.has(day)) return characterCache.get(day)

  const id = await pickCharacterId(day)
  const entity = id ? await Entity.findById(id) : null
  if (!entity) return null
  try {
    await ensureCharacterAbout(entity)
  } catch (error) {
    console.error('Character of the day bio lookup failed:', error.message)
  }
  const character = await serializeEntityDetails(entity)
  const payload = { day, character }
  characterCache.clear()
  characterCache.set(day, payload)
  return payload
}

export default {
  getActivityFeed,
  getReleaseUpdates,
  getCharacterOfTheDay,
}
