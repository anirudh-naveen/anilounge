/**
 * Watchlist row mutations shared by the watchlist endpoints and AniList sync:
 * episode moves, list dates, and keeping ratings and title aggregates in step.
 */
import { query } from '../../config/postgres.js'
import { kindFromContentType } from '../db/kinds.js'
import { rollUpSeriesOf } from './seriesStructure.js'
import { saveUnifiedScores } from '../models/Content.js'
import { applyUserRatingDelta, isValidUserRating } from '../utils/ratings.js'

/**
 * Highest episode and season a watchlist row can record for a title. Movies without an
 * episode count are a single episode.
 *
 * @param {object} content - Content document.
 * @returns {{ maxEpisodes: number, maxSeasons: number }}
 */
export function progressLimits(content) {
  return {
    maxEpisodes:
      content.episodeCount || content.malEpisodes || (content.contentType === 'movie' ? 1 : 0),
    maxSeasons: content.seasonCount || 1,
  }
}

/**
 * Copy the optional start/finish dates and rewatch count from a request body
 * (`null` clears a date; omitted fields are left alone).
 *
 * @param {object} item - Watchlist row, mutated in place.
 * @param {{ startedOn?: string|null, completedOn?: string|null, rewatchCount?: number }} body
 * @returns {void}
 */
export function applyListDetails(item, body) {
  if (body.startedOn !== undefined) item.startedOn = body.startedOn || null
  if (body.completedOn !== undefined) item.completedOn = body.completedOn || null
  if (body.rewatchCount !== undefined) item.rewatchCount = Number(body.rewatchCount)
}

/**
 * Fill in start/finish dates the user left empty: started today once there is
 * progress (or the title is being watched), finished today once completed.
 * Dates the user or an import already set are kept.
 *
 * @param {object} item - Watchlist row, mutated in place.
 * @param {Date} [now=new Date()]
 * @returns {void}
 */
export function stampListDates(item, now = new Date()) {
  const today = now.toISOString().slice(0, 10)
  const started = item.currentEpisode > 0 || ['watching', 'completed'].includes(item.status)
  if (!item.startedOn && started) item.startedOn = today
  if (!item.completedOn && item.status === 'completed') item.completedOn = today
}

/**
 * Move a watchlist row to a new episode, remembering where the user left off
 * so the home feed can report the range watched. No-op when unchanged.
 *
 * @param {object} item - Watchlist entry, mutated in place.
 * @param {number|undefined} episode - New current episode from the request.
 * @returns {void}
 */
export function setWatchedEpisode(item, episode) {
  if (episode === undefined || episode === item.currentEpisode) return
  item.previousEpisode = item.currentEpisode || 0
  item.currentEpisode = episode
}

/**
 * Completed rows sit on the title's last episode. Goes through `setWatchedEpisode` so
 * the home feed range and watch history see the jump. No-op without a known total.
 *
 * @param {object} item - Watchlist row, mutated in place.
 * @param {number} maxEpisodes - From `progressLimits(content)`.
 * @returns {void}
 */
export function lockCompletedProgress(item, maxEpisodes) {
  if (item.status !== 'completed' || !(maxEpisodes > 0)) return
  setWatchedEpisode(item, maxEpisodes)
}

/**
 * Moving a completed row back to watching returns it to the episode the user was on
 * before it was completed, unless this edit set the episode itself.
 *
 * @param {object} item - Watchlist row after this edit's status and episode, mutated in place.
 * @param {string} statusBefore - Row status before the edit.
 * @param {number} episodeBefore - Row episode before the edit.
 * @returns {void}
 */
export function reopenCompletedProgress(item, statusBefore, episodeBefore) {
  if (statusBefore !== 'completed' || item.status !== 'watching') return
  if (item.currentEpisode !== episodeBefore) return
  const resumeAt = item.previousEpisode || 0
  if (resumeAt > 0 && resumeAt < item.currentEpisode) setWatchedEpisode(item, resumeAt)
}

/**
 * Bump a row's `updatedAt` (what orders the home activity feed) only when its status
 * or episode moved, so rating or note edits don't post an update. A backlog edit is
 * stamped as imported too, keeping it out of the feed.
 *
 * @param {object} item - Watchlist row after this edit, mutated in place.
 * @param {string} statusBefore - Row status before the edit.
 * @param {number} episodeBefore - Row episode before the edit.
 * @param {boolean} [backlog=false]
 * @returns {void}
 */
export function touchProgress(item, statusBefore, episodeBefore, backlog = false) {
  if (item.status === statusBefore && item.currentEpisode === episodeBefore) return
  item.updatedAt = new Date()
  if (backlog) item.importedAt = item.updatedAt
}

/**
 * Resolve the user's current rating for a title: watchlist rating first, then legacy `user.ratings`.
 *
 * @param {object} user - User document with `watchlist` and optional `ratings`.
 * @param {string} contentId - Content ObjectId string.
 * @returns {number|null} Valid rating or null if none.
 */
export function getEffectiveUserRating(user, contentId) {
  const watchlistItem = user.watchlist?.find((item) => item.content?.toString() === contentId)
  if (watchlistItem) {
    return isValidUserRating(watchlistItem.rating) ? watchlistItem.rating : null
  }

  const legacyRating = user.ratings?.find((item) => item.content?.toString() === contentId)
  return isValidUserRating(legacyRating?.rating) ? legacyRating.rating : null
}

/**
 * Mirror a watchlist rating onto the legacy `user.ratings` array (insert, update, or remove).
 *
 * @param {object} user - User document whose `ratings` array is mutated in place.
 * @param {string} contentId - Content ObjectId string.
 * @param {number|null} rating - New rating; invalid/null removes the legacy row.
 * @returns {void}
 */
export function syncLegacyUserRating(user, contentId, rating) {
  const existingIndex = user.ratings.findIndex((item) => item.content?.toString() === contentId)

  if (!isValidUserRating(rating)) {
    if (existingIndex !== -1) {
      user.ratings.splice(existingIndex, 1)
    }
    return
  }

  if (existingIndex !== -1) {
    user.ratings[existingIndex].rating = rating
    user.ratings[existingIndex].watchedAt = new Date()
    return
  }

  user.ratings.push({
    content: contentId,
    rating,
    watchedAt: new Date(),
  })
}

/**
 * Apply a rating delta to the title's aggregates and store its new unified score (inside
 * the caller's open transaction, if any). The rating totals themselves are kept by
 * triggers on `ratings`, so only the score is written, not the whole title.
 *
 * @param {object} content - Content document, mutated.
 * @param {number|null} oldRating - Previous effective rating.
 * @param {number|null} newRating - New effective rating.
 * @returns {Promise<void>}
 */
export async function applyContentRatingChange(content, oldRating, newRating) {
  if (oldRating === newRating) return
  applyUserRatingDelta(content, oldRating, newRating)
  const kind = kindFromContentType(content.contentType)
  await saveUnifiedScores([{ id: String(content._id), kind, score: content.unifiedScore ?? null }])
  if (kind === 'season') await rollUpSeriesOf(String(content._id))
}

/**
 * Each series on a watchlist is summed up from its seasons' rows, the way the site sums
 * a series up (src/utils/watchlist.ts `summarizeSeasonStatuses`):
 * Seasons not released yet (upcoming) are left out while any released season is listed.
 * 1. Completed once every released season is.
 * 2. Watching only while a season is being watched.
 * 3. Dropped, then On hold, when any season is.
 * 4. Planned when nothing is done yet and the first season (or only unreleased ones) is
 *    planned.
 * 5. On hold otherwise: some seasons done with others planned or not listed, or only a
 *    later season planned.
 * Users add seasons; the row of a series of two or more seasons is kept here (a
 * one-season series is listed as its season alone): created once any of its seasons is
 * listed, updated with the summary (status, episodes watched across the seasons, the
 * furthest season, start and finish dates), and removed when no season is left. Its
 * rating is not stored (the site shows the seasons' average). Rows are written as
 * imported (`imported_at`) so friends' feeds don't repeat the season's own update.
 *
 * @param {{ userId?: string|null, seasonId?: string|null, dryRun?: boolean }} [scope] - One
 *   user, and/or the series of one season; every watchlist when omitted (the backfill).
 *   `dryRun` counts the rows without changing them.
 * @returns {Promise<number>} Series rows added, changed, or removed (or that would be).
 */
export async function syncSeriesFromSeasons({
  userId = null,
  seasonId = null,
  dryRun = false,
} = {}) {
  // Released: aired or airing. Unreleased seasons don't count while any released one is listed.
  const released = (alias) =>
    `NOT (${alias}.airing_status IS NOT DISTINCT FROM 'upcoming' OR ${alias}.release_date > now())`
  const targets = `WITH tracked AS (
       SELECT w.user_id, sn.series_id,
              count(*) FILTER (WHERE ${released('sw')}) AS listed,
              count(*) FILTER (WHERE ${released('sw')} AND w.status = 'completed') AS done,
              bool_or(${released('sw')} AND w.status = 'watching') AS watching,
              bool_or(${released('sw')} AND w.status = 'dropped') AS dropped,
              bool_or(${released('sw')} AND w.status = 'on_hold') AS on_hold,
              bool_or(w.status = 'plan_to_watch' AND sn.content_id = (
                SELECT x.content_id FROM seasons x WHERE x.series_id = sn.series_id
                ORDER BY x.season_number, x.part_number LIMIT 1
              )) AS first_planned,
              sum(CASE WHEN w.status = 'completed' AND sw.episode_count > 0
                       THEN GREATEST(sw.episode_count, w.current_episode)
                       ELSE w.current_episode END)::int AS episodes,
              max(sn.season_number) FILTER (WHERE w.status <> 'plan_to_watch') AS season,
              min(w.started_on) AS started_on,
              max(w.completed_on) AS completed_on,
              min(w.added_at) AS added_at
       FROM watchlist w
       JOIN seasons sn ON sn.content_id = w.content_id
       JOIN works sw ON sw.id = w.content_id
       WHERE ($1::uuid IS NULL OR w.user_id = $1)
         AND ($2::uuid IS NULL OR sn.series_id = (SELECT series_id FROM seasons WHERE content_id = $2))
       GROUP BY w.user_id, sn.series_id
     ),
     target AS (
       SELECT t.user_id, t.series_id, t.started_on, t.added_at,
              CASE WHEN t.listed = 0 THEN 'plan_to_watch'
                   WHEN t.done = t.listed AND t.listed >= (
                     SELECT count(*) FROM seasons x JOIN works xw ON xw.id = x.content_id
                     WHERE x.series_id = t.series_id AND ${released('xw')}
                   ) THEN 'completed'
                   WHEN t.watching THEN 'watching'
                   WHEN t.dropped THEN 'dropped'
                   WHEN t.on_hold THEN 'on_hold'
                   WHEN t.done = 0 AND t.first_planned THEN 'plan_to_watch'
                   ELSE 'on_hold' END AS status,
              LEAST(t.episodes, COALESCE(NULLIF(s.episode_count, 0), t.episodes)) AS episodes,
              LEAST(COALESCE(t.season, 1), GREATEST(COALESCE(s.season_count, 1), 1)) AS season,
              t.completed_on
       FROM tracked t JOIN series s ON s.content_id = t.series_id
       -- A one-season series is listed as its season alone.
       WHERE (SELECT count(*) FROM seasons x WHERE x.series_id = t.series_id) > 1
     )`
  // A series whose last listed season was just removed.
  const orphan = `w.content_id = (SELECT series_id FROM seasons WHERE content_id = $2)
       AND NOT EXISTS (
         SELECT 1 FROM watchlist ws JOIN seasons sn ON sn.content_id = ws.content_id
         WHERE ws.user_id = w.user_id AND sn.series_id = w.content_id
       )`
  if (dryRun) {
    const { rows } = await query(
      `${targets}
       SELECT count(*)::int AS n FROM target t
       LEFT JOIN watchlist w ON w.user_id = t.user_id AND w.content_id = t.series_id
       WHERE w.user_id IS NULL OR w.status <> t.status OR w.current_episode <> t.episodes`,
      [userId, seasonId],
    )
    return rows[0]?.n || 0
  }
  const { rowCount } = await query(
    `${targets}
     INSERT INTO watchlist (
       user_id, content_id, status, current_episode, current_season, started_on, completed_on,
       added_at, updated_at, imported_at
     )
     SELECT t.user_id, t.series_id, t.status, t.episodes, t.season,
            CASE WHEN t.status = 'plan_to_watch' THEN NULL ELSE t.started_on END,
            CASE WHEN t.status = 'completed' THEN t.completed_on END,
            t.added_at, now(), now()
     FROM target t
     ON CONFLICT (user_id, content_id) DO UPDATE SET
       status = EXCLUDED.status,
       previous_episode = CASE WHEN watchlist.current_episode <> EXCLUDED.current_episode
                               THEN watchlist.current_episode ELSE watchlist.previous_episode END,
       current_episode = EXCLUDED.current_episode,
       current_season = EXCLUDED.current_season,
       started_on = COALESCE(watchlist.started_on, EXCLUDED.started_on),
       completed_on = CASE WHEN EXCLUDED.status = 'completed'
                           THEN COALESCE(watchlist.completed_on, EXCLUDED.completed_on, CURRENT_DATE)
                           ELSE watchlist.completed_on END,
       updated_at = now(),
       imported_at = now()
     WHERE watchlist.status <> EXCLUDED.status
        OR watchlist.current_episode <> EXCLUDED.current_episode
        OR watchlist.current_season <> EXCLUDED.current_season`,
    [userId, seasonId],
  )
  if (!seasonId) return rowCount
  const { rowCount: removed } = await query(
    `DELETE FROM watchlist w WHERE ($1::uuid IS NULL OR w.user_id = $1) AND ${orphan}`,
    [userId, seasonId],
  )
  return rowCount + removed
}
