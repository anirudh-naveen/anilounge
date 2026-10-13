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
 * Keep series rows on watchlists in step with their seasons' rows, the way the site sums
 * a series up (src/utils/watchlist.ts `summarizeSeasonStatuses`):
 * 1. Completed once every one of its seasons is.
 * 2. Watching while any season is being watched.
 * 3. Dropped, then On hold, when any season is.
 * 4. Watching when some seasons are done and others are not.
 * 5. Planned when the first season is planned; a plan for a later season alone is Watching.
 * Series aren't added to watchlists any more (seasons are), so this only moves rows saved
 * before that.
 *
 * @param {{ userId?: string|null, seasonId?: string|null, dryRun?: boolean }} [scope] - One
 *   user, and/or the series of one season; every watchlist when omitted (the backfill).
 *   `dryRun` counts the rows without changing them.
 * @returns {Promise<number>} Series rows changed (or that would change).
 */
export async function syncSeriesFromSeasons({
  userId = null,
  seasonId = null,
  dryRun = false,
} = {}) {
  const targets = `WITH tracked AS (
       SELECT w.user_id, sn.series_id,
              count(*) AS listed,
              count(*) FILTER (WHERE w.status = 'completed') AS done,
              bool_or(w.status = 'watching') AS watching,
              bool_or(w.status = 'dropped') AS dropped,
              bool_or(w.status = 'on_hold') AS on_hold,
              bool_or(w.status = 'plan_to_watch' AND sn.content_id = (
                SELECT x.content_id FROM seasons x WHERE x.series_id = sn.series_id
                ORDER BY x.season_number, x.part_number LIMIT 1
              )) AS first_planned
       FROM watchlist w
       JOIN seasons sn ON sn.content_id = w.content_id
       WHERE ($1::uuid IS NULL OR w.user_id = $1)
         AND ($2::uuid IS NULL OR sn.series_id = (SELECT series_id FROM seasons WHERE content_id = $2))
       GROUP BY w.user_id, sn.series_id
     ),
     target AS (
       SELECT t.user_id, t.series_id,
              CASE WHEN t.done = t.listed
                     AND t.listed >= (SELECT count(*) FROM seasons x WHERE x.series_id = t.series_id)
                     THEN 'completed'
                   WHEN t.watching THEN 'watching'
                   WHEN t.dropped THEN 'dropped'
                   WHEN t.on_hold THEN 'on_hold'
                   WHEN t.done > 0 THEN 'watching'
                   WHEN t.first_planned THEN 'plan_to_watch'
                   ELSE 'watching' END AS status
       FROM tracked t
     )`
  const matches = `t.status IS NOT NULL AND w.user_id = t.user_id AND w.content_id = t.series_id
       AND w.status <> t.status`
  if (dryRun) {
    const { rows } = await query(
      `${targets} SELECT count(*)::int AS n FROM watchlist w, target t WHERE ${matches}`,
      [userId, seasonId],
    )
    return rows[0]?.n || 0
  }
  const { rowCount } = await query(
    `${targets}
     UPDATE watchlist w SET
       status = t.status,
       completed_on = CASE WHEN t.status = 'completed' THEN COALESCE(w.completed_on, CURRENT_DATE)
                           ELSE w.completed_on END,
       started_on = CASE WHEN t.status = 'plan_to_watch' THEN w.started_on
                         ELSE COALESCE(w.started_on, CURRENT_DATE) END,
       updated_at = now()
     FROM target t
     WHERE ${matches}`,
    [userId, seasonId],
  )
  return rowCount
}
