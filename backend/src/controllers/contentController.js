/**
 * Catalog, search, AI, watchlist, and rating HTTP handlers.
 *
 * Layer: controller. Talks to Content/User models, unified/Gemini/relationship
 * services, and rating helpers. Watchlist and vote writes run in a Mongo session.
 */

import Content from '../models/Content.js'
import { getContentSyncStatus } from '../services/contentSyncScheduler.js'
import User from '../models/User.js'
import unifiedContentService from '../services/unifiedContentService.js'
import geminiService from '../services/geminiService.js'
import relationshipService from '../services/relationshipService.js'
import {
  ingestMalRankingByTypes,
  ingestTmdbNowPlayingMovies,
} from '../services/contentSyncService.js'
import { applyUserRatingDelta, isValidUserRating } from '../utils/ratings.js'
import { contentTitleMatchOr } from '../utils/titles.js'
import {
  catalogTabDateFields,
  catalogTabIsSinglePage,
  matchMovieCatalogTab,
  matchTvCatalogTab,
  mergeCatalogQuery,
  normalizeMovieCatalogTab,
  normalizeTvCatalogTab,
  sortForCatalogTab,
} from '../utils/catalogTabs.js'
import { validationResult } from 'express-validator'
import mongoose from 'mongoose'

const movieLikeTypes = ['movie', 'special']

/**
 * Fetch MAL/TMDB airing schedule onto a TV document when the stored slot is missing or stale.
 * Failures are logged; callers still return the existing catalog row.
 * @param {import('mongoose').Document} content
 * @returns {Promise<void>}
 */
const refreshAiringIfNeeded = async (content) => {
  try {
    const changed = await unifiedContentService.refreshAiringSchedule(content)
    if (changed) await content.save()
  } catch (error) {
    console.error('Airing schedule refresh failed:', error.message)
  }
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

const hiddenSortAddFields = {
  boostedScore: { $ifNull: ['$unifiedScore', 0] },
  hiddenSortScore: {
    $add: [
      { $ifNull: ['$unifiedScore', 0] },
      { $cond: [{ $ne: ['$tmdbId', null] }, 1.0, 0] },
      {
        $cond: [
          { $ne: ['$tmdbId', null] },
          { $multiply: [{ $ifNull: ['$popularity', 0] }, 0.05] },
          0,
        ],
      },
    ],
  },
}

/**
 * List catalog titles with pagination. Sort uses a hidden TMDB visibility boost
 * that is stripped from the JSON so displayed scores stay unboosted.
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

    const total = await Content.countDocuments(query)
    const totalPages = singlePage ? (total > 0 ? 1 : 0) : Math.ceil(total / limit)

    // Hidden TMDB sort boost (+1.0 and 5% of popularity) is projected out so clients never see it.
    const content = await Content.aggregate([
      { $match: query },
      {
        $addFields: {
          ...hiddenSortAddFields,
          ...catalogTabDateFields(tab),
        },
      },
      { $sort: sortForCatalogTab(tab) },
      { $skip: skip },
      { $limit: limit },
      {
        $project: {
          boostedScore: 0,
          hiddenSortScore: 0,
          hasScheduleDate: 0,
        },
      },
    ])

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
 * Fetch one catalog document by Mongo ObjectId.
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
 * Episode cards for a TV catalog title (title, description, still, cast).
 * Movies and specials return an empty list. Episodes are not separate pages.
 *
 * @param {import('express').Request} req - Reads `params.id`.
 * @param {import('express').Response} res - 200 `{ data: { episodes } }`, 404 if missing, or 500.
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

    const episodes =
      content.contentType === 'tv' ? await unifiedContentService.getTvShowEpisodes(content) : []

    res.json({
      success: true,
      data: { episodes },
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
 * Fetch one catalog document by TMDB or MAL numeric id.
 *
 * @param {import('express').Request} req - Reads `params.id` and optional `query.source` (`tmdb`|`mal`).
 * @param {import('express').Response} res - 200 `{ data }`, 400 if id is not numeric, 404, or 500.
 * @returns {Promise<void>}
 */
export const getContentByExternalId = async (req, res) => {
  try {
    const { id } = req.params
    const { source } = req.query

    const parsedId = parseInt(id)
    if (isNaN(parsedId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid ID format. ID must be a number.',
      })
    }

    let content
    if (source === 'tmdb') {
      content = await Content.findOne({ tmdbId: parsedId })
    } else if (source === 'mal') {
      content = await Content.findOne({ malId: parsedId })
    } else {
      content = await Content.findOne({
        $or: [{ tmdbId: parsedId }, { malId: parsedId }],
      })
    }

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
    console.error('Error fetching content by external ID:', error)
    res.status(500).json({
      success: false,
      message: 'Error fetching content',
    })
  }
}

/**
 * Regex-search titles and overviews, then fill remaining slots from external APIs.
 * Dedupes by internal/TMDB/MAL ids and title+type.
 *
 * @param {import('express').Request} req - Reads `query.query`, `query.type`, `query.limit`, `query.page`.
 * @param {import('express').Response} res - 200 `{ data: { content, pagination } }`, 400 if query missing, or 500.
 * @returns {Promise<void>}
 */
export const searchContent = async (req, res) => {
  try {
    const { query, type, limit = 20, page = 1 } = req.query

    if (!query) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required',
      })
    }

    const skip = (page - 1) * limit

    const dbResults = await Content.find({
      $or: [
        ...contentTitleMatchOr({ $regex: query, $options: 'i' }),
        { overview: { $regex: query, $options: 'i' } },
      ],
      ...(type && type !== 'all' ? matchContentType(type) : {}),
    })
      .sort({ popularity: -1, unifiedScore: -1 })
      .skip(skip)
      .limit(parseInt(limit))

    let externalResults = []
    if (dbResults.length < limit) {
      try {
        externalResults = await unifiedContentService.searchContent(query, {
          contentType: type || 'all',
          limit: limit - dbResults.length,
        })
      } catch (error) {
        console.error('External search error:', error.message)
      }
    }

    const allResults = [...dbResults, ...externalResults]
    const uniqueResults = []
    const seen = new Map()

    for (const result of allResults) {
      const keys = [
        result.internalId,
        result.tmdbId ? `tmdb-${result.tmdbId}` : null,
        result.malId ? `mal-${result.malId}` : null,
        `${result.title?.toLowerCase()}-${result.contentType}`,
      ].filter(Boolean)

      const isDuplicate = keys.some((key) => seen.has(key))
      if (!isDuplicate) {
        keys.forEach((key) => seen.set(key, true))
        uniqueResults.push(result)
      }
    }

    const total = uniqueResults.length
    const totalPages = Math.ceil(total / limit)

    res.json({
      success: true,
      data: {
        content: uniqueResults.slice(skip, skip + parseInt(limit)),
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalItems: total,
          itemsPerPage: parseInt(limit),
          hasNextPage: parseInt(page) < totalPages,
          hasPrevPage: parseInt(page) > 1,
        },
      },
    })
  } catch (error) {
    console.error('Error searching content:', error)
    res.status(500).json({
      success: false,
      message: 'Error searching content',
    })
  }
}

/**
 * Return the highest-ranked titles, using the same hidden TMDB sort boost as `getContent`.
 * Fills remaining slots from external APIs when the local set is short.
 *
 * @param {import('express').Request} req - Reads `query.type` and `query.limit` (default 20).
 * @param {import('express').Response} res - 200 `{ data }` array or 500.
 * @returns {Promise<void>}
 */
export const getPopularContent = async (req, res) => {
  try {
    const { type, limit = 20 } = req.query

    const query = matchContentType(type)

    // Same hidden TMDB visibility boost as getContent; stripped from the response payload.
    const dbContent = await Content.aggregate([
      { $match: query },
      {
        $addFields: {
          boostedScore: { $ifNull: ['$unifiedScore', 0] },
          hiddenSortScore: {
            $add: [
              { $ifNull: ['$unifiedScore', 0] },
              { $cond: [{ $ne: ['$tmdbId', null] }, 1.0, 0] },
              {
                $cond: [
                  { $ne: ['$tmdbId', null] },
                  { $multiply: [{ $ifNull: ['$popularity', 0] }, 0.05] },
                  0,
                ],
              },
            ],
          },
        },
      },
      { $sort: { hiddenSortScore: -1, _id: -1 } },
      { $limit: parseInt(limit) },
      {
        $project: {
          boostedScore: 0,
          hiddenSortScore: 0,
        },
      },
    ])

    let externalContent = []
    if (dbContent.length < limit) {
      try {
        externalContent = await unifiedContentService.getPopularContent({
          contentType: type || 'all',
          limit: limit - dbContent.length,
        })
      } catch (error) {
        console.error('External popular content error:', error.message)
      }
    }

    const allContent = [...dbContent, ...externalContent]
    const uniqueContent = []
    const seen = new Map()

    for (const content of allContent) {
      const keys = [
        content.internalId,
        content.tmdbId ? `tmdb-${content.tmdbId}` : null,
        content.malId ? `mal-${content.malId}` : null,
        `${content.title?.toLowerCase()}-${content.contentType}`,
      ].filter(Boolean)

      const isDuplicate = keys.some((key) => seen.has(key))
      if (!isDuplicate) {
        keys.forEach((key) => seen.set(key, true))
        uniqueContent.push(content)
      }
    }

    res.json({
      success: true,
      data: uniqueContent.slice(0, limit),
    })
  } catch (error) {
    console.error('Error fetching popular content:', error)
    res.status(500).json({
      success: false,
      message: 'Error fetching popular content',
    })
  }
}

/**
 * Return titles similar to a catalog item via `Content.findSimilar`.
 *
 * @param {import('express').Request} req - Reads `params.id` and `query.limit` (default 10).
 * @param {import('express').Response} res - 200 `{ data }`, 404 if the source title is missing, or 500.
 * @returns {Promise<void>}
 */
export const getSimilarContent = async (req, res) => {
  try {
    const { id } = req.params
    const { limit = 10 } = req.query

    const content = await Content.findById(id)
    if (!content) {
      return res.status(404).json({
        success: false,
        message: 'Content not found',
      })
    }

    const similarContent = await Content.findSimilar(content, parseInt(limit))

    res.json({
      success: true,
      data: similarContent,
    })
  } catch (error) {
    console.error('Error fetching similar content:', error)
    res.status(500).json({
      success: false,
      message: 'Error fetching similar content',
    })
  }
}

/**
 * Watchlist/preference hints for catalog chat. Missing user means anonymous.
 * @param {object|null|undefined} user
 * @returns {object|null}
 */
function chatUserContext(user) {
  if (!user) return null
  const watchlist = (user.watchlist || [])
    .filter((item) => item.content)
    .map((item) => ({
      id: item.content._id,
      title: item.content.englishTitle || item.content.title,
      status: item.status,
    }))
  return {
    favoriteGenres: user.preferences?.favoriteGenres || [],
    favoriteStudios: user.preferences?.favoriteStudios || [],
    watchlist: watchlist.map(({ title, status }) => ({ title, status })),
    excludeIds: watchlist
      .filter((item) => item.status === 'completed' || item.status === 'dropped')
      .map((item) => item.id),
  }
}

/**
 * Run a catalog-grounded natural-language search against Mongo Content.
 *
 * @param {import('express').Request} req - Reads `body.query`.
 * @param {import('express').Response} res - 200 `{ data: { results, query, timestamp } }`, 400, or 500.
 * @returns {Promise<void>}
 */
export const aiSearch = async (req, res) => {
  try {
    const { query } = req.body

    if (!query) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required',
      })
    }

    const aiResults = await geminiService.searchContent(query, {
      excludeIds: chatUserContext(req.user)?.excludeIds,
    })

    res.json({
      success: true,
      data: {
        results: aiResults,
        query,
        timestamp: new Date(),
      },
    })
  } catch (error) {
    console.error('AI search error:', error)
    res.status(500).json({
      success: false,
      message: 'AI search failed',
    })
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
        message: 'Validation failed',
        errors: errors.array(),
      })
    }

    const { message, history } = req.body
    const chatResponse = await geminiService.chatWithUser(message, {
      history,
      userContext: chatUserContext(req.user),
    })

    res.json({
      success: true,
      data: {
        response: chatResponse.response,
        results: chatResponse.results || [],
        searchSuggestion: chatResponse.searchSuggestion,
        timestamp: new Date(),
      },
    })
  } catch (error) {
    console.error('AI chat error:', error)
    res.status(500).json({
      success: false,
      message: 'AI chat failed',
    })
  }
}

/**
 * Add or update a watchlist row in a Mongo transaction, syncing user ratings onto the content document.
 *
 * @param {import('express').Request} req - `req.user._id`; `body` has contentId, status, rating, episode/season, notes.
 * @param {import('express').Response} res - 200 on success; 400 validation/episode bounds; 404 user/content; 500.
 * @returns {Promise<void>}
 */
export const addToWatchlist = async (req, res) => {
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
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

    // Movies without episodeCount/malEpisodes are treated as a single episode.
    const maxEpisodes =
      content.episodeCount || content.malEpisodes || (content.contentType === 'movie' ? 1 : 0)

    const maxSeasons = content.seasonCount || 1

    if (currentEpisode !== undefined && currentEpisode > maxEpisodes) {
      await session.abortTransaction()
      return res.status(400).json({
        success: false,
        message: `Current episode cannot exceed ${maxEpisodes} episodes`,
      })
    }

    if (currentSeason !== undefined && currentSeason > maxSeasons) {
      await session.abortTransaction()
      return res.status(400).json({
        success: false,
        message: `Current season cannot exceed ${maxSeasons} seasons`,
      })
    }

    const existingItem = user.watchlist.find((item) => item.content.toString() === contentId)
    const previousRating = getEffectiveUserRating(user, contentId)

    if (existingItem) {
      existingItem.status = status || existingItem.status
      existingItem.rating = rating !== undefined ? rating : existingItem.rating
      existingItem.currentEpisode =
        currentEpisode !== undefined ? currentEpisode : existingItem.currentEpisode
      existingItem.currentSeason =
        currentSeason !== undefined ? currentSeason : existingItem.currentSeason
      existingItem.totalEpisodes = maxEpisodes
      existingItem.totalSeasons = maxSeasons
      existingItem.notes = notes || existingItem.notes
      existingItem.updatedAt = new Date()
    } else {
      user.watchlist.push({
        content: contentId,
        status: status || 'plan_to_watch',
        rating: rating,
        currentEpisode: currentEpisode || 0,
        currentSeason: currentSeason || 1,
        totalEpisodes: maxEpisodes,
        totalSeasons: maxSeasons,
        notes: notes || '',
        addedAt: new Date(),
        updatedAt: new Date(),
      })
    }

    syncLegacyUserRating(user, contentId, getEffectiveUserRating(user, contentId))
    await applyContentRatingChange(
      content,
      previousRating,
      getEffectiveUserRating(user, contentId),
      session,
    )

    await user.save({ session })
    await session.commitTransaction()

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
 * @param {import('express').Request} req - `req.user._id`; `params.contentId` is the catalog ObjectId.
 * @param {import('express').Response} res - 200 on success, 404 if user missing, or 500.
 * @returns {Promise<void>}
 */
export const removeFromWatchlist = async (req, res) => {
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
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
        session,
      )
    }

    await user.save({ session })
    await session.commitTransaction()

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
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
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

    // Movies without episodeCount/malEpisodes are treated as a single episode.
    const maxEpisodes =
      content.episodeCount || content.malEpisodes || (content.contentType === 'movie' ? 1 : 0)

    const maxSeasons = content.seasonCount || 1

    if (currentEpisode !== undefined && currentEpisode > maxEpisodes) {
      await session.abortTransaction()
      return res.status(400).json({
        success: false,
        message: `Current episode cannot exceed ${maxEpisodes} episodes`,
      })
    }

    if (currentSeason !== undefined && currentSeason > maxSeasons) {
      await session.abortTransaction()
      return res.status(400).json({
        success: false,
        message: `Current season cannot exceed ${maxSeasons} seasons`,
      })
    }

    const previousRating = getEffectiveUserRating(user, contentId)

    if (status) watchlistItem.status = status
    if (rating !== undefined) watchlistItem.rating = rating
    if (currentEpisode !== undefined) watchlistItem.currentEpisode = currentEpisode
    if (currentSeason !== undefined) watchlistItem.currentSeason = currentSeason
    if (notes !== undefined) watchlistItem.notes = notes

    if (!watchlistItem.totalEpisodes) watchlistItem.totalEpisodes = maxEpisodes
    if (!watchlistItem.totalSeasons) watchlistItem.totalSeasons = maxSeasons

    watchlistItem.updatedAt = new Date()

    syncLegacyUserRating(user, contentId, getEffectiveUserRating(user, contentId))
    await applyContentRatingChange(
      content,
      previousRating,
      getEffectiveUserRating(user, contentId),
      session,
    )

    await user.save({ session })
    await session.commitTransaction()

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
 * Resolve the user's current rating for a title: watchlist rating first, then legacy `user.ratings`.
 *
 * @param {object} user - User document with `watchlist` and optional `ratings`.
 * @param {string} contentId - Content ObjectId string.
 * @returns {number|null} Valid rating or null if none.
 */
function getEffectiveUserRating(user, contentId) {
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
function syncLegacyUserRating(user, contentId, rating) {
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
 *
 * @param {object} content - Content document to mutate and save.
 * @param {number|null} oldRating - Previous effective rating.
 * @param {number|null} newRating - New effective rating.
 * @param {import('mongoose').ClientSession} session - Transaction session.
 * @returns {Promise<void>}
 */
async function applyContentRatingChange(content, oldRating, newRating, session) {
  applyUserRatingDelta(content, oldRating, newRating)
  await content.save({ session })
}

/**
 * Submit or update a 1–10 rating, writing both watchlist and legacy rating rows.
 *
 * @param {import('express').Request} req - `params.contentId`, `body.rating`, `req.user._id`.
 * @param {import('express').Response} res - 200 with updated aggregates, 400/404, or 500.
 * @returns {Promise<void>}
 */
export const voteContent = async (req, res) => {
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
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
    await applyContentRatingChange(content, previousRating, rating, session)

    await user.save({ session })
    await session.commitTransaction()

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
 * Count catalog documents by source (TMDB/MAL/merged) and type, plus last sync timestamp.
 *
 * @param {import('express').Request} req - Unused; public stats endpoint.
 * @param {import('express').Response} res - 200 `{ data }` counts and `contentSync`, or 500.
 * @returns {Promise<void>}
 */
export const getDatabaseStats = async (req, res) => {
  try {
    const totalContent = await Content.countDocuments()
    const tmdbOnlyContent = await Content.countDocuments({
      tmdbId: { $exists: true },
      malId: { $exists: false },
    })
    const malOnlyContent = await Content.countDocuments({
      malId: { $exists: true },
      tmdbId: { $exists: false },
    })
    const mergedContent = await Content.countDocuments({
      tmdbId: { $exists: true },
      malId: { $exists: true },
    })
    const movies = await Content.countDocuments({ contentType: 'movie' })
    const tvShows = await Content.countDocuments({ contentType: 'tv' })
    const specials = await Content.countDocuments({ contentType: 'special' })

    const syncStatus = getContentSyncStatus()

    res.json({
      success: true,
      data: {
        totalContent,
        tmdbOnlyContent,
        malOnlyContent,
        mergedContent,
        movies,
        tvShows,
        specials,
        lastUpdated: syncStatus.lastSync?.finishedAt || null,
        contentSync: syncStatus,
      },
    })
  } catch (error) {
    console.error('Error getting database stats:', error)
    res.status(500).json({
      success: false,
      message: 'Error getting database statistics',
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
 * List all catalog rows sharing a franchise name, ordered by release date.
 *
 * @param {import('express').Request} req - Reads `params.franchiseName`.
 * @param {import('express').Response} res - 200 `{ data }` array, 400 if name missing, or 500.
 * @returns {Promise<void>}
 */
export const getFranchiseContent = async (req, res) => {
  try {
    const { franchiseName } = req.params

    if (!franchiseName) {
      return res.status(400).json({
        success: false,
        message: 'Franchise name is required',
      })
    }

    const franchiseContent = await Content.find({
      franchise: franchiseName,
    })
      .sort({ releaseDate: 1 })
      .exec()

    res.json({
      success: true,
      data: franchiseContent,
    })
  } catch (error) {
    console.error('Error getting franchise content:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to get franchise content',
      error: error.message,
    })
  }
}

export default {
  getContent,
  getContentById,
  getContentEpisodes,
  getContentByExternalId,
  searchContent,
  getPopularContent,
  getSimilarContent,
  aiSearch,
  aiChat,
  addToWatchlist,
  getWatchlist,
  removeFromWatchlist,
  updateWatchlistItem,
  getDatabaseStats,
  getRelatedContent,
  getFranchiseContent,
  voteContent,
  getMyRating,
}
