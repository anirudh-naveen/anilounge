/**
 * Watchlist row mutations shared by the watchlist endpoints and AniList sync:
 * episode moves, list dates, and keeping ratings and title aggregates in step.
 */
import { applyUserRatingDelta, isValidUserRating } from '../utils/ratings.js'

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
 * Apply a rating delta to the content aggregate scores and persist inside the open session.
 * No-op when the rating is unchanged: `content.save` rewrites the whole title
 * (genres, studios, franchise, relations), which is slow and lock-heavy.
 *
 * @param {object} content - Content document to mutate and save.
 * @param {number|null} oldRating - Previous effective rating.
 * @param {number|null} newRating - New effective rating.
 * @param {import('mongoose').ClientSession} session - Transaction session.
 * @returns {Promise<void>}
 */
export async function applyContentRatingChange(content, oldRating, newRating, session) {
  if (oldRating === newRating) return
  applyUserRatingDelta(content, oldRating, newRating)
  await content.save({ session })
}
