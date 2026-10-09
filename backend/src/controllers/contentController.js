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
import { getFranchise } from '../services/franchiseService.js'
import {
  ingestMalRankingByTypes,
  ingestTmdbNowPlayingMovies,
} from '../services/contentSyncService.js'
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
import { censorText } from '../utils/moderation.js'
import { query as dbQuery, startSession, withReplica } from '../../config/postgres.js'
import { clearWatchHistory, recordWatch } from '../services/watchEvents.js'
import { watchUnits } from '../utils/profileStats.js'
import { mirrorWatchlistChange } from '../services/connectionSync.js'

const movieLikeTypes = ['movie', 'special']

/** Longest a page view waits for an airing refresh before answering with what it has. */
const AIRING_REFRESH_WAIT_MS = 2500
/** After a failed refresh, views skip that title for this long. */
const AIRING_REFRESH_BACKOFF_MS = 15 * 60 * 1000
/** @type {Map<string, Promise<void>>} Refreshes in flight, shared by concurrent viewers. */
const airingRefreshes = new Map()
/** @type {Map<string, number>} Title id -> time its last refresh failed. */
const airingRefreshFailures = new Map()

/**
 * Fetch MAL/TMDB airing schedule onto a TV document when the stored slot is missing or stale.
 * Failures are logged; callers still return the existing catalog row.
 * @param {object} content - Content document.
 * @returns {Promise<void>}
 */
const refreshAiringIfNeeded = async (content) => {
  const id = String(content._id)
  const failedAt = airingRefreshFailures.get(id)
  if (failedAt && Date.now() - failedAt < AIRING_REFRESH_BACKOFF_MS) return
  // Everyone viewing a stale airing title at once shares one MAL/TMDB refresh.
  let refresh = airingRefreshes.get(id)
  if (!refresh) {
    refresh = (async () => {
      try {
        const changed = await unifiedContentService.refreshAiringSchedule(content)
        if (changed) await content.save()
        else if (unifiedContentService.needsAiringRefresh(content)) {
          airingRefreshFailures.set(id, Date.now())
        }
      } catch (error) {
        airingRefreshFailures.set(id, Date.now())
        console.error('Airing schedule refresh failed:', error.message)
      } finally {
        airingRefreshes.delete(id)
        if (airingRefreshFailures.size > 5000) airingRefreshFailures.clear()
      }
    })()
    airingRefreshes.set(id, refresh)
  }
  // A slow provider must not hold the page: answer after a short wait; the refresh
  // finishes in the background and the next view gets the new schedule.
  let timer
  await Promise.race([
    refresh,
    new Promise((resolve) => {
      timer = setTimeout(resolve, AIRING_REFRESH_WAIT_MS)
    }),
  ])
  clearTimeout(timer)
}

/**
 * Build a Mongo filter for the public content-type query param.
 * `movie` includes `special` so specials appear in the movie catalog.
 *
 * @param {string|undefined} contentType - `all`, `movie`, `tv`, `special`, or omitted.
 * @returns {object} Empty object for all types; otherwise a `contentType` match.
 */
const matchContentType = (contentType) => {
  if (!contentType || contentType === 'all') return {}
  if (contentType === 'movie') return { contentType: { $in: movieLikeTypes } }
  return { contentType }
}

/**
 * List catalog titles with pagination, in the stored catalog order (`hiddenSortScore`:
 * unified score plus a visibility boost for TMDB titles; see db/mongoFilter.js).
 * `tab` filters TV into popular/airing/upcoming and movies into popular/theatres/upcoming.
 * Popular Right Now on movie and TV catalogs is a single page.
 *
 * @param {import('express').Request} req - Reads `query.page`, `query.limit`, `query.type`, `query.tab`.
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
    const query = mergeCatalogQuery(matchContentType(contentType), tabQuery)

    if (tab === 'upcoming' && (contentType === 'tv' || contentType === 'movie')) {
      const existingUpcoming = await Content.countDocuments(query)
      if (existingUpcoming === 0) {
        try {
          const types = contentType === 'tv' ? ['tv'] : ['movie', 'special']
          await ingestMalRankingByTypes('upcoming', 50, types)
        } catch (error) {
          console.error('Upcoming catalog ingest failed:', error.message)
        }
      }
    }

    if (tab === 'theatres' && contentType === 'movie') {
      const existingTheatres = await Content.countDocuments(query)
      if (existingTheatres === 0) {
        try {
          await ingestTmdbNowPlayingMovies(40)
        } catch (error) {
          console.error('Now-in-theatres catalog ingest failed:', error.message)
        }
      }
    }

    // The page itself is a pure read: served by the read replica when one is configured.
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

    await refreshAiringIfNeeded(content)

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
 * Add or update a watchlist row in a transaction, syncing user ratings onto the content document.
 *
 * @param {import('express').Request} req - `req.user._id`; `body` has contentId, status, rating, episode/season, notes.
 * @param {import('express').Response} res - 200 on success; 400 validation/episode bounds; 404 user/content; 500.
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

    const { contentId, status, rating, currentEpisode, currentSeason, notes } = req.body
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
      stampListDates(existingItem)
      existingItem.updatedAt = new Date()
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
      lockCompletedProgress(user.watchlist[user.watchlist.length - 1], maxEpisodes)
      stampListDates(user.watchlist[user.watchlist.length - 1])
    }

    syncLegacyUserRating(user, contentId, getEffectiveUserRating(user, contentId))
    await applyContentRatingChange(
      content,
      previousRating,
      getEffectiveUserRating(user, contentId),
    )

    await user.save({ session })
    const savedItem = user.watchlist.find((item) => item.content.toString() === contentId)
    await recordWatch(userId, contentId, watchUnits({ ...savedItem, content }) - unitsBefore)
    await session.commitTransaction()
    mirrorWatchlistChange(user, content, savedItem)

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
          'title posterPath contentType releaseDate overview genres unifiedScore voteAverage voteCount malScore malScoredBy userRatingAverage userRatingCount episodeCount malEpisodes seasonCount malStatus broadcastDay broadcastTime nextEpisodeAirDate nextEpisodeNumber nextEpisodeSeason',
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
    const { status, rating, currentEpisode, currentSeason, notes } = req.body
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
    stampListDates(watchlistItem)

    if (!watchlistItem.totalEpisodes) watchlistItem.totalEpisodes = maxEpisodes
    if (!watchlistItem.totalSeasons) watchlistItem.totalSeasons = maxSeasons

    watchlistItem.updatedAt = new Date()

    syncLegacyUserRating(user, contentId, getEffectiveUserRating(user, contentId))
    await applyContentRatingChange(
      content,
      previousRating,
      getEffectiveUserRating(user, contentId),
    )

    await user.save({ session })
    await recordWatch(userId, contentId, watchUnits({ ...watchlistItem, content }) - unitsBefore)
    await session.commitTransaction()
    mirrorWatchlistChange(user, content, watchlistItem)

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
      watchlistItem.updatedAt = new Date()
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

export default {
  getContent,
  getFranchiseById,
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
