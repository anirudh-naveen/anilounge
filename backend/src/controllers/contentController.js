import Content from '../models/Content.js'
import User from '../models/User.js'
import unifiedContentService from '../services/unifiedContentService.js'
import geminiService from '../services/geminiService.js'
import { validationResult } from 'express-validator'

// Get all content with pagination
export const getContent = async (req, res) => {
  const startTime = Date.now()
  console.log(`🚀 [${new Date().toISOString()}] getContent called:`, {
    page: req.query.page,
    limit: req.query.limit,
    type: req.query.type,
    userAgent: req.get('User-Agent')?.substring(0, 50),
  })

  try {
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 20
    const contentType = req.query.type || 'all'
    const skip = (page - 1) * limit

    let query = {}
    if (contentType !== 'all') {
      query.contentType = contentType
    }

    console.log(`📊 [${new Date().toISOString()}] Database query:`, { query, skip, limit })

    // Get total count for pagination
    const countStart = Date.now()
    const total = await Content.countDocuments(query)
    const countTime = Date.now() - countStart
    console.log(`📈 [${new Date().toISOString()}] Count query took ${countTime}ms, total: ${total}`)

    const totalPages = Math.ceil(total / limit)

    // Use database-level pagination with proper sorting
    const queryStart = Date.now()
    const content = await Content.find(query)
      .sort({ unifiedScore: -1, popularity: -1 })
      .skip(skip)
      .limit(limit)
      .exec()
    const queryTime = Date.now() - queryStart
    console.log(
      `🔍 [${new Date().toISOString()}] Content query took ${queryTime}ms, returned ${content.length} items`,
    )

    const totalTime = Date.now() - startTime
    console.log(`✅ [${new Date().toISOString()}] getContent completed in ${totalTime}ms`)

    res.json({
      success: true,
      data: content,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: total,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    })
  } catch (error) {
    const totalTime = Date.now() - startTime
    console.error(`❌ [${new Date().toISOString()}] getContent error after ${totalTime}ms:`, error)
    res.status(500).json({
      success: false,
      message: 'Error fetching content',
    })
  }
}

// Get content by ID
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

// Get content by external ID (TMDB or MAL)
export const getContentByExternalId = async (req, res) => {
  try {
    const { id } = req.params
    const { source } = req.query

    let content
    if (source === 'tmdb') {
      content = await Content.findOne({ tmdbId: parseInt(id) })
    } else if (source === 'mal') {
      content = await Content.findOne({ malId: parseInt(id) })
    } else {
      // Try both sources
      content = await Content.findOne({
        $or: [{ tmdbId: parseInt(id) }, { malId: parseInt(id) }],
      })
    }

    if (!content) {
      return res.status(404).json({
        success: false,
        message: 'Content not found',
      })
    }

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

// Search content
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

    // Search in database first
    const dbResults = await Content.find({
      $or: [
        { title: { $regex: query, $options: 'i' } },
        { overview: { $regex: query, $options: 'i' } },
        { alternativeTitles: { $regex: query, $options: 'i' } },
      ],
      ...(type && type !== 'all' ? { contentType: type } : {}),
    })
      .sort({ popularity: -1, unifiedScore: -1 })
      .skip(skip)
      .limit(parseInt(limit))

    const total = await Content.countDocuments({
      $or: [
        { title: { $regex: query, $options: 'i' } },
        { overview: { $regex: query, $options: 'i' } },
        { alternativeTitles: { $regex: query, $options: 'i' } },
      ],
      ...(type && type !== 'all' ? { contentType: type } : {}),
    })

    // If not enough results, search external APIs
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

    // Combine and deduplicate results
    const allResults = [...dbResults, ...externalResults]
    const uniqueResults = []
    const seen = new Set()

    for (const result of allResults) {
      const key = `${result.title}-${result.contentType}`
      if (!seen.has(key)) {
        seen.add(key)
        uniqueResults.push(result)
      }
    }

    const totalPages = Math.ceil(total / limit)

    res.json({
      success: true,
      data: {
        content: uniqueResults.slice(0, limit),
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

// Get popular content
export const getPopularContent = async (req, res) => {
  try {
    const { type, limit = 20 } = req.query

    // Get from database first
    let query = {}
    if (type && type !== 'all') {
      query.contentType = type
    }

    const dbContent = await Content.find(query)
      .sort({ popularity: -1, unifiedScore: -1 })
      .limit(parseInt(limit))

    // If not enough content, get from external APIs
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

    // Combine results
    const allContent = [...dbContent, ...externalContent]
    const uniqueContent = []
    const seen = new Set()

    for (const content of allContent) {
      const key = `${content.title}-${content.contentType}`
      if (!seen.has(key)) {
        seen.add(key)
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

// Get similar content
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

// AI-powered search
export const aiSearch = async (req, res) => {
  try {
    const { query } = req.body

    if (!query) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required',
      })
    }

    // Use Gemini for AI search
    const aiResults = await geminiService.searchContent(query)

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

// Add to watchlist
export const addToWatchlist = async (req, res) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array(),
      })
    }

    const { contentId, status, rating, currentEpisode, notes } = req.body
    const userId = req.user.id

    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      })
    }

    const content = await Content.findById(contentId)
    if (!content) {
      return res.status(404).json({
        success: false,
        message: 'Content not found',
      })
    }

    // Get max episodes from content
    const maxEpisodes =
      content.episodeCount || content.malEpisodes || (content.contentType === 'movie' ? 1 : 0)

    // Validate currentEpisode doesn't exceed max episodes
    if (currentEpisode !== undefined && currentEpisode > maxEpisodes) {
      return res.status(400).json({
        success: false,
        message: `Current episode cannot exceed ${maxEpisodes} episodes`,
      })
    }

    // Check if already in watchlist
    const existingItem = user.watchlist.find((item) => item.content.toString() === contentId)

    if (existingItem) {
      // Update existing item
      existingItem.status = status || existingItem.status
      existingItem.rating = rating !== undefined ? rating : existingItem.rating
      existingItem.currentEpisode =
        currentEpisode !== undefined ? currentEpisode : existingItem.currentEpisode
      existingItem.totalEpisodes = maxEpisodes
      existingItem.notes = notes || existingItem.notes
      existingItem.updatedAt = new Date()
    } else {
      // Add new item
      user.watchlist.push({
        content: contentId,
        status: status || 'plan_to_watch',
        rating: rating,
        currentEpisode: currentEpisode || 0,
        totalEpisodes: maxEpisodes,
        notes: notes || '',
        addedAt: new Date(),
        updatedAt: new Date(),
      })
    }

    await user.save()

    res.json({
      success: true,
      message: 'Added to watchlist successfully',
      data: {
        contentId,
        status: status || 'plan_to_watch',
      },
    })
  } catch (error) {
    console.error('Error adding to watchlist:', error)
    res.status(500).json({
      success: false,
      message: 'Error adding to watchlist',
    })
  }
}

// Get user watchlist
export const getWatchlist = async (req, res) => {
  try {
    const userId = req.user.id
    const user = await User.findById(userId).populate('watchlist.content')

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

// Remove from watchlist
export const removeFromWatchlist = async (req, res) => {
  try {
    const { contentId } = req.params
    const userId = req.user.id

    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      })
    }

    user.watchlist = user.watchlist.filter((item) => item.content.toString() !== contentId)
    await user.save()

    res.json({
      success: true,
      message: 'Removed from watchlist successfully',
    })
  } catch (error) {
    console.error('Error removing from watchlist:', error)
    res.status(500).json({
      success: false,
      message: 'Error removing from watchlist',
    })
  }
}

// Update watchlist item
export const updateWatchlistItem = async (req, res) => {
  try {
    const { contentId } = req.params
    const { status, rating, currentEpisode, notes } = req.body
    const userId = req.user.id

    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      })
    }

    const watchlistItem = user.watchlist.find((item) => item.content.toString() === contentId)
    if (!watchlistItem) {
      return res.status(404).json({
        success: false,
        message: 'Watchlist item not found',
      })
    }

    // Get the content to validate episode count
    const content = await Content.findById(contentId)
    if (!content) {
      return res.status(404).json({
        success: false,
        message: 'Content not found',
      })
    }

    // Get max episodes from content
    const maxEpisodes =
      content.episodeCount || content.malEpisodes || (content.contentType === 'movie' ? 1 : 0)

    // Validate currentEpisode doesn't exceed max episodes
    if (currentEpisode !== undefined && currentEpisode > maxEpisodes) {
      return res.status(400).json({
        success: false,
        message: `Current episode cannot exceed ${maxEpisodes} episodes`,
      })
    }

    if (status) watchlistItem.status = status
    if (rating !== undefined) watchlistItem.rating = rating
    if (currentEpisode !== undefined) watchlistItem.currentEpisode = currentEpisode
    if (notes !== undefined) watchlistItem.notes = notes

    watchlistItem.updatedAt = new Date()

    await user.save()

    res.json({
      success: true,
      message: 'Watchlist item updated successfully',
      data: watchlistItem,
    })
  } catch (error) {
    console.error('Error updating watchlist item:', error)
    res.status(500).json({
      success: false,
      message: 'Error updating watchlist item',
    })
  }
}

// Get database statistics
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

    res.json({
      success: true,
      data: {
        totalContent,
        tmdbOnlyContent,
        malOnlyContent,
        mergedContent,
        movies,
        tvShows,
        lastUpdated: new Date(),
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

// Default export for backward compatibility
export default {
  getContent,
  getContentById,
  getContentByExternalId,
  searchContent,
  getPopularContent,
  getSimilarContent,
  aiSearch,
  addToWatchlist,
  getWatchlist,
  removeFromWatchlist,
  updateWatchlistItem,
  getDatabaseStats,
}
