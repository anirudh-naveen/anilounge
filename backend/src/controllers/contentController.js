/**
 * Catalog, search, AI, watchlist, and rating HTTP handlers.
 *
 * Layer: controller. Talks to Content/User models, unified/Gemini/relationship
 * services, and rating helpers. Watchlist and vote writes run in a Postgres transaction.
 */

import Content from '../models/Content.js'
import User from '../models/User.js'
import unifiedContentService from '../services/unifiedContentService.js'
import geminiService from '../services/geminiService.js'
import { consumeAiCall } from '../services/aiUsageService.js'
import relationshipService from '../services/relationshipService.js'
import { getSeasonGuide } from '../services/seasonService.js'
import { attachTitleDetails } from '../services/titleDetails.js'
import {
  addFranchiseWork,
  getFranchise,
  setFranchiseWatchOrder,
} from '../services/franchiseService.js'
import { requestRefresh } from '../services/refreshRequests.js'
import {
  applyContentRatingChange,
  applyListDetails,
  getEffectiveUserRating,
  lockCompletedProgress,
  progressLimits,
  reopenCompletedProgress,
  setWatchedEpisode,
  stampListDates,
  syncLegacyUserRating,
  touchProgress,
  syncSeriesFromSeasons,
} from '../services/watchlistWrites.js'
import {
  catalogTabIsSinglePage,
  matchMovieCatalogTab,
  matchTvCatalogTab,
  mergeCatalogQuery,
  normalizeMovieCatalogTab,
  normalizeTvCatalogTab,
  sortForCatalogTab,
} from '../utils/catalogTabs.js'
import { validationResult } from 'express-validator'
import { sendError } from '../utils/httpError.js'
import { censorText } from '../utils/moderation.js'
import { query as dbQuery, startSession, withReplica } from '../../config/postgres.js'
import { clearWatchHistory, recordBacklog, recordWatch } from '../services/watchEvents.js'
import { watchUnits } from '../utils/profileStats.js'
import { mirrorWatchlistChange } from '../services/connectionSync.js'

const movieLikeTypes = ['movie', 'special']

/**
 * Queue a MAL/TMDB airing schedule refresh when the stored slot is missing or stale.
 * A series with seasons gets its schedule from them (the six-hourly import).
 * @param {object} content - Content document.
 * @returns {Promise<void>}
 */
const queueAiringRefresh = async (content) => {
  if (!unifiedContentService.needsAiringRefresh(content)) return
  const { rows } = await dbQuery('SELECT 1 FROM seasons WHERE series_id = $1 LIMIT 1', [
    String(content._id),
  ])
  if (!rows.length) await requestRefresh('airing', content._id)
}

/**
 * Build a Mongo filter for the public content-type query param.
 * `movie` includes `special` so specials appear in the movie catalog.
 *
 * @param {string|undefined} contentType - `all`, `movie`, `tv`, `special`, or omitted.
 * @param {boolean} [withSeasons] - Keep seasons in the `all` list.
 * @returns {object} Every type but seasons for `all` (unless `withSeasons`); otherwise a `contentType` match.
 */
const matchContentType = (contentType, withSeasons = false) => {
  // Seasons are listed through their series, except in the full catalog search loads.
  if (!contentType || contentType === 'all') {
    return withSeasons ? {} : { contentType: { $nin: ['season'] } }
  }
  if (contentType === 'movie') return { contentType: { $in: movieLikeTypes } }
  return { contentType }
}

/**
 * Mark each series row that has season rows (`hasSeasons`): those are tracked season by
 * season, so cards offer no watchlist button for the series itself. A series with just
 * one season also gets its id (`soleSeasonId`): its card stands for that season.
 * @param {object[]} rows - Serialized catalog rows, mutated in place.
 * @returns {Promise<void>}
 */
const flagSeriesWithSeasons = async (rows) => {
  const ids = rows.filter((row) => row.contentType === 'tv').map((row) => String(row._id))
  if (!ids.length) return
  const { rows: found } = await withReplica(() =>
    dbQuery(
      `SELECT series_id::text AS id, count(*)::int AS n, min(content_id::text) AS season_id
       FROM seasons WHERE series_id = ANY($1::uuid[]) GROUP BY series_id`,
      [ids],
    ),
  )
  const bySeries = new Map(found.map((row) => [row.id, row]))
  for (const row of rows) {
    if (row.contentType !== 'tv') continue
    const seasons = bySeries.get(String(row._id))
    row.hasSeasons = Boolean(seasons)
    row.soleSeasonId = seasons?.n === 1 ? seasons.season_id : null
  }
}

/**
 * List catalog titles with pagination, in the stored catalog order (`hiddenSortScore`:
 * unified score plus a visibility boost for TMDB titles; see db/mongoFilter.js).
 * `tab` filters TV into popular/airing/season/upcoming and movies into popular/theatres/upcoming.
 * Popular Right Now on movie and TV catalogs is a single page.
 *
 * @param {import('express').Request} req - Reads `query.page`, `query.limit`, `query.type`, `query.tab`,
 *   and `query.seasons=1` (the `all` list with seasons as their own rows, for search).
 * @param {import('express').Response} res - 200 `{ success, data, pagination }` or 500.
 * @returns {Promise<void>}
 */
export const getContent = async (req, res) => {
  const startTime = Date.now()
  try {
    const limit = parseInt(req.query.limit) || 20
    const contentType = req.query.type || 'all'
    const tab =
      contentType === 'tv'
        ? normalizeTvCatalogTab(req.query.tab)
        : contentType === 'movie'
          ? normalizeMovieCatalogTab(req.query.tab)
          : 'popular'
    const singlePage =
      catalogTabIsSinglePage(tab) && (contentType === 'tv' || contentType === 'movie')
    const page = singlePage ? 1 : parseInt(req.query.page) || 1
    const skip = (page - 1) * limit

    const tabQuery =
      contentType === 'tv'
        ? matchTvCatalogTab(tab)
        : contentType === 'movie'
          ? matchMovieCatalogTab(tab)
          : {}
    // Schedule tabs choose their own TV rows (seasons or series, see SCHEDULED_TV).
    const typeQuery =
      contentType === 'tv' && tab !== 'popular'
        ? {}
        : matchContentType(contentType, req.query.seasons === '1')
    const query = mergeCatalogQuery(typeQuery, tabQuery)

    const total = await withReplica(() => Content.countDocuments(query))
    const totalPages = singlePage ? (total > 0 ? 1 : 0) : Math.ceil(total / limit)

    const content = await withReplica(() =>
      Content.aggregate([
        { $match: query },
        { $sort: sortForCatalogTab(tab) },
        { $skip: skip },
        { $limit: limit },
      ]),
    )
    await flagSeriesWithSeasons(content)

    res.json({
      success: true,
      data: content,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: singlePage ? Math.min(total, limit) : total,
        itemsPerPage: limit,
        hasNextPage: !singlePage && page < totalPages,
        hasPrevPage: !singlePage && page > 1,
      },
    })
  } catch (error) {
    const totalTime = Date.now() - startTime
    console.error(`[${new Date().toISOString()}] getContent error after ${totalTime}ms:`, error)
    res.status(500).json({
      success: false,
      message: 'Error fetching content',
      ...(process.env.NODE_ENV === 'development' && { error: error.message }),
    })
  }
}

/**
 * Fetch one catalog document by id.
 *
 * @param {import('express').Request} req - Reads `params.id`.
 * @param {import('express').Response} res - 200 `{ data }`, 404 if missing, or 500.
 * @returns {Promise<void>}
 */
export const getContentById = async (req, res) => {
  try {
    const { id } = req.params
    const content = await Content.findById(id)

    if (!content) {
      return res.status(404).json({
        success: false,
        message: 'Content not found',
      })
    }

    await queueAiringRefresh(content)
    await attachTitleDetails(content)

    res.json({
      success: true,
      data: content,
    })
  } catch (error) {
    console.error('Error fetching content by ID:', error)
    res.status(500).json({
      success: false,
      message: 'Error fetching content',
    })
  }
}

/**
 * Episode cards for a TV catalog title (title, description, still, cast) plus
 * its season guide. When the title is one season of a TMDB show (MAL lists
 * seasons separately), episodes and seasons come from that show and
 * `currentSeason` marks this title's season. Each season carries `contentId`,
 * the catalog row for that season, or null. Movies and specials return empty lists.
 *
 * @param {import('express').Request} req - Reads `params.id`.
 * @param {import('express').Response} res - 200 `{ data: { episodes, seasons, currentSeason, seriesId } }`, 404 if missing, or 500.
 * @returns {Promise<void>}
 */
export const getContentEpisodes = async (req, res) => {
  try {
    const { id } = req.params
    const content = await Content.findById(id)

    if (!content) {
      return res.status(404).json({
        success: false,
        message: 'Content not found',
      })
    }

    res.json({
      success: true,
      data: await getSeasonGuide(content),
    })
  } catch (error) {
    console.error('Error fetching content episodes:', error)
    res.status(500).json({
      success: false,
      message: 'Error fetching episodes',
    })
  }
}

/**
 * Watchlist/preference hints for catalog chat. Missing user means anonymous.
 * Favorited studio entities count as favorite studios.
 * @param {object|null|undefined} user
 * @returns {Promise<object|null>}
 */
async function chatUserContext(user) {
  if (!user) return null
  const [watchRows, studioRows] = await Promise.all([
    dbQuery(
      `SELECT w.status, c.id, c.name
       FROM watchlist w JOIN content c ON c.id = w.content_id
       WHERE w.user_id = $1`,
      [user._id],
    ),
    dbQuery(
      `SELECT DISTINCT c.name
       FROM favorites f JOIN content c ON c.id = f.content_id
       WHERE f.user_id = $1 AND c.kind = 'studio' AND c.name IS NOT NULL`,
      [user._id],
    ),
  ])
  const watchlist = watchRows.rows.map((row) => ({
    id: String(row.id),
    title: row.name,
    status: row.status,
  }))
  return {
    favoriteGenres: user.preferences?.favoriteGenres || [],
    // Favorite studios are studio pages the user has hearted.
    favoriteStudios: studioRows.rows.map((row) => row.name),
    watchlist: watchlist.map(({ title, status }) => ({ title, status })),
    excludeIds: watchlist
      .filter((item) => item.status === 'completed' || item.status === 'dropped')
      .map((item) => item.id),
  }
}

/**
 * Relay a user message to catalog-grounded Gemini chat.
 *
 * @param {import('express').Request} req - Reads `body.message` and optional `body.history`.
 * @param {import('express').Response} res - 200 `{ data: { response, results, searchSuggestion, timestamp } }`, 400, or 500.
 * @returns {Promise<void>}
 */
export const aiChat = async (req, res) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: errors.array()[0].msg,
        errors: errors.array(),
      })
    }

    const { message, history } = req.body
    await consumeAiCall(req)
    const chatResponse = await geminiService.chatWithUser(message, {
      history,
      userContext: await chatUserContext(req.user),
    })

    res.json({
      success: true,
      data: {
        response: censorText(chatResponse.response),
        results: chatResponse.results || [],
        searchSuggestion: chatResponse.searchSuggestion,
        timestamp: new Date(),
      },
    })
  } catch (error) {
    if (error.status === 429) {
      return res.status(429).json({ success: false, message: error.message })
    }
    console.error('AI chat error:', error)
    res.status(500).json({
      success: false,
      message: 'AI chat failed',
    })
  }
}

/**
 * Why a requested episode or season is past the title's end, or null when it fits.
 * @param {number|undefined} currentEpisode
 * @param {number|undefined} currentSeason
 * @param {object} content
 * @returns {string|null}
 */
function progressError(currentEpisode, currentSeason, content) {
  const { maxEpisodes, maxSeasons } = progressLimits(content)
  if (currentEpisode !== undefined && currentEpisode > maxEpisodes) {
    return `Current episode cannot exceed ${maxEpisodes} episodes`
  }
  if (currentSeason !== undefined && currentSeason > maxSeasons) {
    return `Current season cannot exceed ${maxSeasons} seasons`
  }
  return null
}

/**
 * After a season's watchlist row changes, bring the user's row for its series (if any)
 * in step. Failures are logged; the season write already succeeded.
 * @param {object} user
 * @param {object} content - The season or other title just written.
 * @returns {Promise<void>}
 */
const syncSeriesOf = async (user, content) => {
  if (content.contentType !== 'season') return
  try {
    await syncSeriesFromSeasons({ userId: String(user._id), seasonId: String(content._id) })
  } catch (error) {
    console.error('Series watchlist sync failed:', error.message)
  }
}

/**
 * Add or update a watchlist row in a transaction, syncing user ratings onto the content document.
 * A series with seasons cannot be added (its seasons are tracked instead).
 *
 * @param {import('express').Request} req - `req.user._id`; `body` has contentId, status, rating, episode/season, notes.
 * @param {import('express').Response} res - 200 on success; 400 validation/episode bounds/series with
 *   seasons; 404 user/content; 500.
 * @returns {Promise<void>}
 */
export const addToWatchlist = async (req, res) => {
  const session = await startSession()

  try {
    await session.startTransaction()
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      await session.abortTransaction()
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array(),
      })
    }

    const { contentId, status, rating, currentEpisode, currentSeason, notes, backlog } = req.body
    const userId = req.user._id

    const user = await User.findById(userId).session(session)
    if (!user) {
      await session.abortTransaction()
      return res.status(404).json({
        success: false,
        message: 'User not found',
      })
    }

    const content = await Content.findById(contentId).session(session)
    if (!content) {
      await session.abortTransaction()
      return res.status(404).json({
        success: false,
        message: 'Content not found',
      })
    }

    const { maxEpisodes, maxSeasons } = progressLimits(content)
    const outOfRange = progressError(currentEpisode, currentSeason, content)
    if (outOfRange) {
      await session.abortTransaction()
      return res.status(400).json({ success: false, message: outOfRange })
    }

    const existingItem = user.watchlist.find((item) => item.content.toString() === contentId)

    // A series with seasons is tracked season by season; rows already on a list stay editable.
    if (!existingItem && content.contentType === 'tv') {
      const { rows } = await dbQuery('SELECT 1 FROM seasons WHERE series_id = $1 LIMIT 1', [
        contentId,
      ])
      if (rows.length) {
        await session.abortTransaction()
        return res.status(400).json({
          success: false,
          message: 'Add one of its seasons to your watchlist instead.',
          code: 'track_seasons',
        })
      }
    }

    const previousRating = getEffectiveUserRating(user, contentId)
    const unitsBefore = existingItem ? watchUnits({ ...existingItem, content }) : 0

    if (existingItem) {
      const { status: statusBefore, currentEpisode: episodeBefore } = existingItem
      existingItem.status = status || existingItem.status
      existingItem.rating = rating !== undefined ? rating : existingItem.rating
      setWatchedEpisode(existingItem, currentEpisode)
      lockCompletedProgress(existingItem, maxEpisodes)
      reopenCompletedProgress(existingItem, statusBefore, episodeBefore)
      existingItem.currentSeason =
        currentSeason !== undefined ? currentSeason : existingItem.currentSeason
      existingItem.totalEpisodes = maxEpisodes
      existingItem.totalSeasons = maxSeasons
      existingItem.notes = notes || existingItem.notes
      applyListDetails(existingItem, req.body)
      if (!backlog) stampListDates(existingItem)
      touchProgress(existingItem, statusBefore, episodeBefore, backlog)
    } else {
      user.watchlist.push({
        content: contentId,
        status: status || 'plan_to_watch',
        rating: rating,
        currentEpisode: currentEpisode || 0,
        previousEpisode: 0,
        currentSeason: currentSeason || 1,
        totalEpisodes: maxEpisodes,
        totalSeasons: maxSeasons,
        notes: notes || '',
        startedOn: req.body.startedOn || null,
        completedOn: req.body.completedOn || null,
        rewatchCount: req.body.rewatchCount ?? 0,
        addedAt: new Date(),
        updatedAt: new Date(),
      })
      const added = user.watchlist[user.watchlist.length - 1]
      lockCompletedProgress(added, maxEpisodes)
      if (backlog) added.importedAt = added.updatedAt
      else stampListDates(added)
    }

    syncLegacyUserRating(user, contentId, getEffectiveUserRating(user, contentId))
    await applyContentRatingChange(content, previousRating, getEffectiveUserRating(user, contentId))

    await user.save({ session })
    const savedItem = user.watchlist.find((item) => item.content.toString() === contentId)
    await logWatchChange(userId, contentId, watchUnits({ ...savedItem, content }) - unitsBefore, {
      backlog,
      item: savedItem,
    })
    await session.commitTransaction()
    mirrorWatchlistChange(user, content, savedItem)
    await syncSeriesOf(user, content)

    res.json({
      success: true,
      message: 'Added to watchlist successfully',
      data: {
        contentId,
        status: status || 'plan_to_watch',
      },
    })
  } catch (error) {
    await session.abortTransaction()
    console.error('Error adding to watchlist:', error)
    res.status(500).json({
      success: false,
      message: 'Error adding to watchlist',
    })
  } finally {
    session.endSession()
  }
}

/**
 * Return the authenticated user's watchlist with populated catalog fields.
 *
 * @param {import('express').Request} req - Reads `req.user._id` from auth middleware.
 * @param {import('express').Response} res - 200 `{ data: watchlist }`, 404 if user missing, or 500.
 * @returns {Promise<void>}
 */
export const getWatchlist = async (req, res) => {
  try {
    const userId = req.user._id
    const user = await User.findById(userId)
      .populate({
        path: 'watchlist.content',
        model: 'Content',
        select:
          'title posterPath contentType releaseDate overview genres unifiedScore voteAverage voteCount malScore malScoredBy userRatingAverage userRatingCount episodeCount malEpisodes seasonCount malStatus broadcastDay broadcastTime nextEpisodeAirDate nextEpisodeNumber nextEpisodeSeason seriesId',
      })
      .lean()

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      })
    }

    res.json({
      success: true,
      data: user.watchlist,
    })
  } catch (error) {
    console.error('Error fetching watchlist:', error)
    res.status(500).json({
      success: false,
      message: 'Error fetching watchlist',
    })
  }
}

/**
 * Remove a title from the watchlist and roll back its contribution to content aggregates.
 *
 * @param {import('express').Request} req - `req.user._id`; `params.contentId` is the catalog id.
 * @param {import('express').Response} res - 200 on success, 404 if user missing, or 500.
 * @returns {Promise<void>}
 */
export const removeFromWatchlist = async (req, res) => {
  const session = await startSession()

  try {
    await session.startTransaction()
    const { contentId } = req.params
    const userId = req.user._id

    const user = await User.findById(userId).session(session)
    if (!user) {
      await session.abortTransaction()
      return res.status(404).json({
        success: false,
        message: 'User not found',
      })
    }

    const content = await Content.findById(contentId).session(session)
    const previousRating = getEffectiveUserRating(user, contentId)

    user.watchlist = user.watchlist.filter((item) => item.content.toString() !== contentId)
    syncLegacyUserRating(user, contentId, getEffectiveUserRating(user, contentId))

    if (content) {
      await applyContentRatingChange(
        content,
        previousRating,
        getEffectiveUserRating(user, contentId),
      )
    }

    await user.save({ session })
    await clearWatchHistory(userId, contentId)
    await session.commitTransaction()
    mirrorWatchlistChange(user, content, null)
    await syncSeriesOf(user, content)

    res.json({
      success: true,
      message: 'Removed from watchlist successfully',
    })
  } catch (error) {
    await session.abortTransaction()
    console.error('Error removing from watchlist:', error)
    res.status(500).json({
      success: false,
      message: 'Error removing from watchlist',
    })
  } finally {
    session.endSession()
  }
}

/**
 * Log the units a watchlist change added: on today, or in backlog mode (titles watched
 * long ago) on the row's start/finish dates or no day at all.
 * @param {string} userId
 * @param {string} contentId
 * @param {number} units
 * @param {{ backlog?: boolean, item: { startedOn?: string|Date|null, completedOn?: string|Date|null } }} options
 * @returns {Promise<void>}
 */
function logWatchChange(userId, contentId, units, { backlog, item }) {
  return backlog
    ? recordBacklog(userId, contentId, units, item)
    : recordWatch(userId, contentId, units)
}

/**
 * Patch an existing watchlist row (status, rating, progress) inside a transaction.
 *
 * @param {import('express').Request} req - `params.contentId`; `body` status/rating/episode/season/notes.
 * @param {import('express').Response} res - 200 `{ data: item }`, 400 bounds, 404 missing, or 500.
 * @returns {Promise<void>}
 */
export const updateWatchlistItem = async (req, res) => {
  const session = await startSession()

  try {
    await session.startTransaction()
    const { contentId } = req.params
    const { status, rating, currentEpisode, currentSeason, notes, backlog } = req.body
    const userId = req.user._id

    const user = await User.findById(userId).session(session)
    if (!user) {
      await session.abortTransaction()
      return res.status(404).json({
        success: false,
        message: 'User not found',
      })
    }

    const watchlistItem = user.watchlist.find((item) => item.content.toString() === contentId)
    if (!watchlistItem) {
      await session.abortTransaction()
      return res.status(404).json({
        success: false,
        message: 'Watchlist item not found',
      })
    }

    const content = await Content.findById(contentId).session(session)
    if (!content) {
      await session.abortTransaction()
      return res.status(404).json({
        success: false,
        message: 'Content not found',
      })
    }

    const { maxEpisodes, maxSeasons } = progressLimits(content)
    const outOfRange = progressError(currentEpisode, currentSeason, content)
    if (outOfRange) {
      await session.abortTransaction()
      return res.status(400).json({ success: false, message: outOfRange })
    }

    const previousRating = getEffectiveUserRating(user, contentId)
    const unitsBefore = watchUnits({ ...watchlistItem, content })
    const { status: statusBefore, currentEpisode: episodeBefore } = watchlistItem

    if (status) watchlistItem.status = status
    if (rating !== undefined) watchlistItem.rating = rating
    setWatchedEpisode(watchlistItem, currentEpisode)
    lockCompletedProgress(watchlistItem, maxEpisodes)
    reopenCompletedProgress(watchlistItem, statusBefore, episodeBefore)
    if (currentSeason !== undefined) watchlistItem.currentSeason = currentSeason
    if (notes !== undefined) watchlistItem.notes = notes
    applyListDetails(watchlistItem, req.body)
    if (!backlog) stampListDates(watchlistItem)

    if (!watchlistItem.totalEpisodes) watchlistItem.totalEpisodes = maxEpisodes
    if (!watchlistItem.totalSeasons) watchlistItem.totalSeasons = maxSeasons

    touchProgress(watchlistItem, statusBefore, episodeBefore, backlog)

    syncLegacyUserRating(user, contentId, getEffectiveUserRating(user, contentId))
    await applyContentRatingChange(content, previousRating, getEffectiveUserRating(user, contentId))

    await user.save({ session })
    await logWatchChange(
      userId,
      contentId,
      watchUnits({ ...watchlistItem, content }) - unitsBefore,
      { backlog, item: watchlistItem },
    )
    await session.commitTransaction()
    mirrorWatchlistChange(user, content, watchlistItem)
    await syncSeriesOf(user, content)

    res.json({
      success: true,
      message: 'Watchlist item updated successfully',
      data: watchlistItem,
    })
  } catch (error) {
    await session.abortTransaction()
    console.error('Error updating watchlist item:', error)
    res.status(500).json({
      success: false,
      message: 'Error updating watchlist item',
    })
  } finally {
    session.endSession()
  }
}

/**
 * Submit or update a 1–10 rating, writing both watchlist and legacy rating rows.
 *
 * @param {import('express').Request} req - `params.contentId`, `body.rating`, `req.user._id`.
 * @param {import('express').Response} res - 200 with updated aggregates, 400/404, or 500.
 * @returns {Promise<void>}
 */
export const voteContent = async (req, res) => {
  const session = await startSession()

  try {
    await session.startTransaction()
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      await session.abortTransaction()
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array(),
      })
    }

    const { contentId } = req.params
    const { rating } = req.body
    const userId = req.user._id

    if (!rating || rating < 1 || rating > 10) {
      await session.abortTransaction()
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 1 and 10',
      })
    }

    const user = await User.findById(userId).session(session)
    const content = await Content.findById(contentId).session(session)

    if (!user || !content) {
      await session.abortTransaction()
      return res.status(404).json({
        success: false,
        message: 'User or content not found',
      })
    }

    const previousRating = getEffectiveUserRating(user, contentId)
    const hadRating = previousRating != null

    const watchlistItem = user.watchlist.find((item) => item.content.toString() === contentId)
    if (watchlistItem) {
      watchlistItem.rating = rating
    }

    syncLegacyUserRating(user, contentId, rating)
    await applyContentRatingChange(content, previousRating, rating)

    await user.save({ session })
    await session.commitTransaction()
    if (watchlistItem) mirrorWatchlistChange(user, content, watchlistItem)

    const updatedContent = await Content.findById(contentId)

    res.json({
      success: true,
      message: hadRating ? 'Rating updated successfully' : 'Rating submitted successfully',
      data: {
        contentId,
        rating,
        userRatingAverage: updatedContent.userRatingAverage,
        userRatingCount: updatedContent.userRatingCount,
        unifiedScore: updatedContent.unifiedScore,
      },
    })
  } catch (error) {
    await session.abortTransaction()
    console.error('Error voting on content:', error)
    res.status(500).json({
      success: false,
      message: 'Error submitting vote',
      ...(process.env.NODE_ENV === 'development' && { error: error.message }),
    })
  } finally {
    session.endSession()
  }
}

/**
 * Return the authenticated user's legacy `ratings` row for one title (not the watchlist rating).
 *
 * @param {import('express').Request} req - `params.contentId`, `req.user._id`.
 * @param {import('express').Response} res - 200 `{ hasRated, rating, watchedAt }`, 404, or 500.
 * @returns {Promise<void>}
 */
export const getMyRating = async (req, res) => {
  try {
    const { contentId } = req.params
    const userId = req.user._id

    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      })
    }

    const myRating = user.ratings.find((r) => r.content.toString() === contentId)

    res.json({
      success: true,
      data: {
        hasRated: !!myRating,
        rating: myRating ? myRating.rating : null,
        watchedAt: myRating ? myRating.watchedAt : null,
      },
    })
  } catch (error) {
    console.error('Error getting user rating:', error)
    res.status(500).json({
      success: false,
      message: 'Error getting rating',
    })
  }
}

/**
 * Return sequel/prequel/related links for a catalog id via the relationship service.
 *
 * @param {import('express').Request} req - Reads `params.contentId`.
 * @param {import('express').Response} res - 200 `{ data }`, 400 if id missing, or 500 with `error`.
 * @returns {Promise<void>}
 */
export const getRelatedContent = async (req, res) => {
  try {
    const { contentId } = req.params

    if (!contentId) {
      return res.status(400).json({
        success: false,
        message: 'Content ID is required',
      })
    }

    const relationships = await relationshipService.findRelatedContent(contentId)

    res.json({
      success: true,
      data: relationships,
    })
  } catch (error) {
    console.error('Error getting related content:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to get related content',
      error: error.message,
    })
  }
}

/**
 * `GET /franchises/:id` — a franchise with all its titles in watch order.
 *
 * @param {import('express').Request} req - Reads `params.id`.
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
export const getFranchiseById = async (req, res) => {
  try {
    const franchise = await getFranchise(req.params.id)
    if (!franchise) {
      return res.status(404).json({ success: false, message: 'Franchise not found' })
    }
    res.json({ success: true, data: franchise })
  } catch (error) {
    console.error('Error fetching franchise:', error)
    res.status(500).json({ success: false, message: 'Failed to load franchise' })
  }
}

/**
 * Set (or with an empty list, reset) a franchise's watch order for everyone.
 *
 * @param {import('express').Request} req - `params.id`, `body.workIds` in the new order.
 * @param {import('express').Response} res - 200 `{ data }` (the franchise), 400, 404, or 500.
 * @returns {Promise<void>}
 */
export const updateFranchiseWatchOrder = async (req, res) => {
  try {
    await setFranchiseWatchOrder(req.user, req.params.id, req.body?.workIds)
    const data = await getFranchise(req.params.id)
    res.json({ success: true, message: 'Watch order saved.', data })
  } catch (error) {
    sendError(res, error, 'Error saving watch order')
  }
}

/**
 * Add a title to a franchise.
 *
 * @param {import('express').Request} req - `params.id`, `body.workId`.
 * @param {import('express').Response} res - 200 `{ data }` (the franchise), 400, 404, or 500.
 * @returns {Promise<void>}
 */
export const addWorkToFranchise = async (req, res) => {
  try {
    await addFranchiseWork(req.user, req.params.id, req.body?.workId)
    const data = await getFranchise(req.params.id)
    res.json({ success: true, message: 'Title added.', data })
  } catch (error) {
    sendError(res, error, 'Error adding title')
  }
}

export default {
  getContent,
  getFranchiseById,
  updateFranchiseWatchOrder,
  addWorkToFranchise,
  getContentById,
  getContentEpisodes,
  aiChat,
  addToWatchlist,
  getWatchlist,
  removeFromWatchlist,
  updateWatchlistItem,
  getRelatedContent,
  voteContent,
  getMyRating,
}
