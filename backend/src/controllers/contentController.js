import Content from '../models/Content.js'
import User from '../models/User.js'
import tmdbService from '../services/tmdbService.js'
import geminiService from '../services/geminiService.js'
import { validationResult } from 'express-validator'

// Genre ID to name mapping
const genreMap = {
  16: 'Animation',
  28: 'Action',
  12: 'Adventure',
  35: 'Comedy',
  80: 'Crime',
  99: 'Documentary',
  18: 'Drama',
  10751: 'Family',
  14: 'Fantasy',
  36: 'History',
  27: 'Horror',
  10402: 'Music',
  9648: 'Mystery',
  10749: 'Romance',
  878: 'Science Fiction',
  10770: 'TV Movie',
  53: 'Thriller',
  10752: 'War',
  37: 'Western',
  10759: 'Action & Adventure',
  10762: 'Kids',
  10763: 'News',
  10764: 'Reality',
  10765: 'Sci-Fi & Fantasy',
  10766: 'Soap',
  10767: 'Talk',
  10768: 'War & Politics',
}

// Convert genre IDs to genre names (handles both old and new formats)
const convertGenreIds = (genreIds) => {
  if (!genreIds || !Array.isArray(genreIds)) return []

  return genreIds
    .map((id) => {
      // If it's already a string, return it
      if (typeof id === 'string') return id
      // If it's an object with name property, return the name
      if (typeof id === 'object' && id.name) return id.name
      // If it's a number (genre ID), convert to name
      if (typeof id === 'number') return genreMap[id] || `Genre ${id}`
      return null
    })
    .filter(Boolean)
    .filter((genre) => genre !== 'Animation') // Remove Animation genre as it's implied
}

// Gets animated movies from database
export const getAnimatedMovies = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query
    const skip = (page - 1) * limit

    // Get movies from database
    const movies = await Content.find({ contentType: 'movie' })
      .sort({ popularity: -1 })
      .skip(skip)
      .limit(parseInt(limit))

    // Get total count
    const totalMovies = await Content.countDocuments({ contentType: 'movie' })

    res.json({
      success: true,
      data: {
        movies,
        pagination: {
          page: parseInt(page),
          totalPages: Math.ceil(totalMovies / limit),
          totalResults: totalMovies,
        },
      },
    })
  } catch (error) {
    console.error('Error fetching animated movies:', error)
    res.status(500).json({
      success: false,
      message: 'Error fetching animated movies',
    })
  }
}

// Saves Animated TV Show content to database
// Gets animated TV shows from database
export const getAnimatedTVShows = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query
    const skip = (page - 1) * limit

    // Get TV shows from database
    const shows = await Content.find({ contentType: 'tv' })
      .sort({ popularity: -1 })
      .skip(skip)
      .limit(parseInt(limit))

    // Get total count
    const totalShows = await Content.countDocuments({ contentType: 'tv' })

    res.json({
      success: true,
      data: {
        shows,
        pagination: {
          page: parseInt(page),
          totalPages: Math.ceil(totalShows / limit),
          totalResults: totalShows,
        },
      },
    })
  } catch (error) {
    console.error('Error fetching animated TV shows:', error)
    res.status(500).json({
      success: false,
      message: 'Error fetching animated TV shows',
    })
  }
}

// Enhanced search with fuzzy matching and genre support
const fuzzyMatch = (str1, str2) => {
  const s1 = str1.toLowerCase().replace(/[^a-z0-9]/g, '')
  const s2 = str2.toLowerCase().replace(/[^a-z0-9]/g, '')

  if (s1 === s2) return 1
  if (s1.includes(s2) || s2.includes(s1)) return 0.8

  // Simple Levenshtein distance approximation
  const longer = s1.length > s2.length ? s1 : s2
  const shorter = s1.length > s2.length ? s2 : s1
  const editDistance = levenshteinDistance(longer, shorter)
  return Math.max(0, 1 - editDistance / longer.length)
}

const levenshteinDistance = (str1, str2) => {
  const matrix = []
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i]
  }
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j
  }
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
        )
      }
    }
  }
  return matrix[str2.length][str1.length]
}

// Calculate search relevance score
const calculateRelevanceScore = (item, query) => {
  const queryLower = query.toLowerCase()
  let score = 0

  // Title exact match (highest priority)
  if (item.title && item.title.toLowerCase().includes(queryLower)) {
    score += 10
  }

  // Original title match
  if (item.originalTitle && item.originalTitle.toLowerCase().includes(queryLower)) {
    score += 8
  }

  // Overview match
  if (item.overview && item.overview.toLowerCase().includes(queryLower)) {
    score += 3
  }

  // Genre match
  if (item.genres && Array.isArray(item.genres)) {
    const genreMatch = item.genres.some((genre) => genre.toLowerCase().includes(queryLower))
    if (genreMatch) score += 5
  }

  // Fuzzy title match
  if (item.title) {
    const fuzzyScore = fuzzyMatch(item.title, query)
    score += fuzzyScore * 4
  }

  // Popularity boost
  if (item.voteAverage) {
    score += item.voteAverage / 10
  }

  return score
}

export const searchContent = async (req, res) => {
  try {
    const {
      query,
      page = 1,
      type = 'all', // 'all', 'movie', 'tv'
      genre = 'all', // 'all' or specific genre
      minRating = 0, // minimum rating
      maxRating = 10, // maximum rating
      year = 'all', // 'all' or specific year
      sortBy = 'relevance', // 'relevance', 'rating', 'year', 'title'
    } = req.query

    if (!query) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required',
      })
    }

    // Get initial search results
    const searchResults = await tmdbService.searchAnimatedContent(query, page)

    // Process combined results - convert genre_ids to genre names and create proper structure
    const processedResults = searchResults.results.map((item) => ({
      _id: `tmdb_${item.id}`,
      tmdbId: item.id,
      title: item.title || item.name,
      originalTitle: item.original_title || item.original_name,
      overview: item.overview,
      posterPath: item.poster_path,
      backdropPath: item.backdrop_path,
      releaseDate: item.release_date
        ? new Date(item.release_date)
        : item.first_air_date
          ? new Date(item.first_air_date)
          : null,
      contentType: item.contentType,
      typeIcon: item.typeIcon,
      genres: convertGenreIds(item.genre_ids),
      voteAverage: item.vote_average,
      voteCount: item.vote_count,
    }))

    // Separate movies and TV shows for backward compatibility (not used in response)
    // const processedMovies = processedResults.filter(item => item.contentType === 'movie')
    // const processedTVShows = processedResults.filter(item => item.contentType === 'tv')

    // AI Enhancement disabled to prevent timeout errors
    const aiEnhancement = {
      refinedQuery: query,
      suggestedGenres: [],
      recommendations: [],
      searchSuggestions: [],
    }

    // Apply filters to combined results
    let filteredResults = processedResults

    // Filter by type
    if (type === 'movie') {
      filteredResults = filteredResults.filter((item) => item.contentType === 'movie')
    } else if (type === 'tv') {
      filteredResults = filteredResults.filter((item) => item.contentType === 'tv')
    }

    // Filter by genre
    if (genre !== 'all') {
      filteredResults = filteredResults.filter((item) =>
        item.genres.some((g) => g.toLowerCase() === genre.toLowerCase()),
      )
    }

    // Filter by rating
    filteredResults = filteredResults.filter(
      (item) => item.voteAverage >= minRating && item.voteAverage <= maxRating,
    )

    // Filter by year
    if (year !== 'all') {
      const targetYear = parseInt(year)
      filteredResults = filteredResults.filter(
        (item) => item.releaseDate && item.releaseDate.getFullYear() === targetYear,
      )
    }

    // Sort results
    if (sortBy === 'rating') {
      filteredResults.sort((a, b) => b.voteAverage - a.voteAverage)
    } else if (sortBy === 'year') {
      filteredResults.sort((a, b) => {
        const yearA = a.releaseDate ? a.releaseDate.getFullYear() : 0
        const yearB = b.releaseDate ? b.releaseDate.getFullYear() : 0
        return yearB - yearA
      })
    } else if (sortBy === 'title') {
      filteredResults.sort((a, b) => a.title.localeCompare(b.title))
    }
    // 'relevance' is default - keep original order

    // Apply pagination to combined results
    const itemsPerPage = 20
    const startIndex = (page - 1) * itemsPerPage
    const endIndex = startIndex + itemsPerPage
    const paginatedResults = filteredResults.slice(startIndex, endIndex)

    // Separate for backward compatibility (not used in response)
    // const filteredMovies = paginatedResults.filter(item => item.contentType === 'movie')
    // const filteredTVShows = paginatedResults.filter(item => item.contentType === 'tv')

    // Calculate relevance scores and sort combined results
    const scoredResults = paginatedResults
      .map((item) => ({
        ...item,
        relevanceScore: calculateRelevanceScore(item, query),
      }))
      .sort((a, b) => {
        switch (sortBy) {
          case 'rating':
            return b.voteAverage - a.voteAverage
          case 'year':
            return (b.releaseDate?.getFullYear() || 0) - (a.releaseDate?.getFullYear() || 0)
          case 'title':
            return a.title.localeCompare(b.title)
          default: // 'relevance'
            return b.relevanceScore - a.relevanceScore
        }
      })

    // Remove relevance score from final response
    const finalResults = scoredResults.map((item) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { relevanceScore, ...itemWithoutScore } = item
      return itemWithoutScore
    })

    // Separate for backward compatibility
    const finalMovies = finalResults.filter((item) => item.contentType === 'movie')
    const finalTVShows = finalResults.filter((item) => item.contentType === 'tv')

    res.json({
      success: true,
      data: {
        results: finalResults, // Combined results
        movies: finalMovies, // Backward compatibility
        tv: finalTVShows, // Backward compatibility
        aiEnhancement: aiEnhancement,
        filters: {
          type,
          genre,
          minRating: parseFloat(minRating),
          maxRating: parseFloat(maxRating),
          year,
          sortBy,
        },
        pagination: {
          page: parseInt(page),
          totalPages: Math.ceil(filteredResults.length / itemsPerPage),
          totalResults: filteredResults.length,
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

// AI-powered content recommendations
export const getAIRecommendations = async (req, res) => {
  try {
    const { userId } = req.params

    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({
        success: false,
        message: 'AI recommendations not available',
      })
    }

    // Get user's watchlist and preferences
    const user = await User.findById(userId).populate('watchlist.content')
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      })
    }

    // Get some popular content for recommendations
    const popularMovies = await tmdbService.getAnimatedMovies(1)
    const popularShows = await tmdbService.getAnimatedTVShows(1)
    const availableContent = [...popularMovies.results, ...popularShows.results]

    // Create user preferences object
    const userPreferences = {
      watchlistCount: user.watchlist.length,
      favoriteGenres: user.watchlist.reduce((acc, item) => {
        if (item.content && item.content.genres) {
          item.content.genres.forEach((genre) => {
            acc[genre] = (acc[genre] || 0) + 1
          })
        }
        return acc
      }, {}),
      averageRating:
        user.watchlist.reduce((sum, item) => sum + (item.rating || 0), 0) / user.watchlist.length ||
        0,
    }

    // Get AI recommendations
    const recommendations = await geminiService.generateRecommendations(
      userPreferences,
      availableContent,
    )

    res.json({
      success: true,
      data: {
        recommendations: recommendations.recommendations || [],
        userPreferences,
      },
    })
  } catch (error) {
    console.error('AI recommendations error:', error)
    res.status(500).json({
      success: false,
      message: 'Error generating AI recommendations',
    })
  }
}

// AI-powered chatbot
export const chatWithAI = async (req, res) => {
  try {
    const { message } = req.body

    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Message is required',
      })
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({
        success: false,
        message: 'AI chatbot not available',
      })
    }

    // Get AI response using Gemini
    const aiResponse = await geminiService.chatWithUser(message)

    res.json({
      success: true,
      data: {
        response: aiResponse.response,
        searchSuggestion: aiResponse.searchSuggestion,
      },
    })
  } catch (error) {
    console.error('AI chat error:', error)
    res.status(500).json({
      success: false,
      message: 'Error processing chat message',
    })
  }
}

// AI-powered content analysis
export const analyzeContent = async (req, res) => {
  try {
    const { contentId } = req.params

    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({
        success: false,
        message: 'AI analysis not available',
      })
    }

    // Get content from database or TMDB
    let content = await Content.findOne({ tmdbId: contentId })

    if (!content) {
      // Try to get from TMDB
      const tmdbContent = await tmdbService.getContentDetails('movie', contentId)
      content = {
        title: tmdbContent.title || tmdbContent.name,
        overview: tmdbContent.overview,
        genres: convertGenreIds(tmdbContent.genre_ids),
      }
    }

    // Get AI analysis
    const analysis = await geminiService.analyzeContent(content)

    res.json({
      success: true,
      data: {
        content: {
          title: content.title,
          overview: content.overview,
          genres: content.genres,
        },
        analysis,
      },
    })
  } catch (error) {
    console.error('AI content analysis error:', error)
    res.status(500).json({
      success: false,
      message: 'Error analyzing content',
    })
  }
}

export const getContentDetails = async (req, res) => {
  try {
    const { id } = req.params

    let content = await Content.findOne({ tmdbId: parseInt(id) })

    if (!content) {
      // Fetch from TMDB and save to database
      const tmdbData = await tmdbService.getContentDetails('movie', id)
      content = new Content({
        tmdbId: tmdbData.id,
        title: tmdbData.title || tmdbData.name,
        originalTitle: tmdbData.original_title || tmdbData.original_name,
        overview: tmdbData.overview,
        posterPath: tmdbData.poster_path,
        backdropPath: tmdbData.backdrop_path,
        releaseDate: tmdbData.release_date ? new Date(tmdbData.release_date) : null,
        contentType: tmdbData.title ? 'movie' : 'tv',
        genres: tmdbData.genres || [],
        adult: tmdbData.adult,
        originalLanguage: tmdbData.original_language,
        popularity: tmdbData.popularity,
        voteAverage: tmdbData.vote_average,
        voteCount: tmdbData.vote_count,
        runtime: tmdbData.runtime,
        status: tmdbData.status,
        numberOfSeasons: tmdbData.number_of_seasons,
        numberOfEpisodes: tmdbData.number_of_episodes,
        networks: tmdbData.networks,
        productionCompanies: tmdbData.production_companies,
        productionCountries: tmdbData.production_countries,
        spokenLanguages: tmdbData.spoken_languages,
        tagline: tmdbData.tagline,
        homepage: tmdbData.homepage,
        imdbId: tmdbData.imdb_id,
        isAnimated: true,
      })

      await content.save()
    }

    res.json({
      success: true,
      data: { content },
    })
  } catch (error) {
    console.error('Error fetching content details:', error)
    res.status(500).json({
      success: false,
      message: 'Error fetching content details',
    })
  }
}

export const addToWatchlist = async (req, res) => {
  try {
    const { contentId, status = 'plan_to_watch', rating, currentEpisode, notes } = req.body

    // Validate contentId format
    if (!contentId || typeof contentId !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Invalid content ID',
      })
    }

    // Check if contentId is a valid ObjectId
    if (!contentId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid content ID format',
      })
    }

    const user = await User.findById(req.user._id)
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

    // Check if content is already in watchlist (handle both old and new formats)
    const existingItem = user.watchlist.find((item) => {
      if (typeof item === 'string') {
        return item === contentId
      }
      return item.content && item.content.toString() === contentId
    })

    if (existingItem) {
      return res.status(400).json({
        success: false,
        message: 'Content already in watchlist',
      })
    }

    // Add to watchlist with enhanced data
    const watchlistItem = {
      content: contentId,
      status,
      rating,
      currentEpisode: currentEpisode || 0,
      totalEpisodes: content.numberOfEpisodes || content.runtime ? 1 : null,
      notes,
      addedAt: new Date(),
      updatedAt: new Date(),
    }

    user.watchlist.push(watchlistItem)
    await user.save()

    res.json({
      success: true,
      message: 'Content added to watchlist',
      data: { watchlist: user.watchlist },
    })
  } catch (error) {
    console.error('Error adding to watchlist:', error)
    res.status(500).json({
      success: false,
      message: 'Error adding to watchlist',
    })
  }
}

export const removeFromWatchlist = async (req, res) => {
  try {
    const { contentId } = req.params

    const user = await User.findById(req.user._id)
    user.watchlist = user.watchlist.filter((item) => {
      // Handle both old format (string) and new format (object)
      if (typeof item === 'string') {
        return item !== contentId
      }
      return item.content.toString() !== contentId
    })
    await user.save()

    res.json({
      success: true,
      message: 'Content removed from watchlist',
      data: { watchlist: user.watchlist },
    })
  } catch (error) {
    console.error('Error removing from watchlist:', error)
    res.status(500).json({
      success: false,
      message: 'Error removing from watchlist',
    })
  }
}

export const updateWatchlistItem = async (req, res) => {
  try {
    const { contentId } = req.params
    const { status, rating, currentEpisode, notes } = req.body

    const user = await User.findById(req.user._id)
    const watchlistItem = user.watchlist.find((item) => {
      // Handle both old format (string) and new format (object)
      if (typeof item === 'string') {
        return item === contentId
      }
      return item.content.toString() === contentId
    })

    if (!watchlistItem) {
      return res.status(404).json({
        success: false,
        message: 'Item not found in watchlist',
      })
    }

    // Update fields if provided
    if (status) watchlistItem.status = status
    if (rating !== undefined) watchlistItem.rating = rating
    if (currentEpisode !== undefined) watchlistItem.currentEpisode = currentEpisode
    if (notes !== undefined) watchlistItem.notes = notes
    watchlistItem.updatedAt = new Date()

    await user.save()

    res.json({
      success: true,
      message: 'Watchlist item updated successfully',
      data: { watchlist: user.watchlist },
    })
  } catch (error) {
    console.error('Error updating watchlist item:', error)
    res.status(500).json({
      success: false,
      message: 'Error updating watchlist item',
    })
  }
}

export const rateContent = async (req, res) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array(),
      })
    }

    const { contentId, rating, review } = req.body

    const user = await User.findById(req.user._id)
    const content = await Content.findById(contentId)

    if (!content) {
      return res.status(404).json({
        success: false,
        message: 'Content not found',
      })
    }

    // Check if user already rated this content
    const existingRatingIndex = user.ratings.findIndex((r) => r.content.toString() === contentId)

    if (existingRatingIndex >= 0) {
      // Update existing rating
      user.ratings[existingRatingIndex].rating = rating
      user.ratings[existingRatingIndex].review = review
      user.ratings[existingRatingIndex].watchedAt = new Date()
    } else {
      // Add new rating
      user.ratings.push({
        content: contentId,
        rating,
        review,
        watchedAt: new Date(),
      })
    }

    await user.save()

    // Update content's average rating
    await updateContentAverageRating(contentId)

    res.json({
      success: true,
      message: 'Rating saved successfully',
      data: { ratings: user.ratings },
    })
  } catch (error) {
    console.error('Error rating content:', error)
    res.status(500).json({
      success: false,
      message: 'Error rating content',
    })
  }
}

// Helper function to update content's average rating
async function updateContentAverageRating(contentId) {
  try {
    const ratings = await User.aggregate([
      { $unwind: '$ratings' },
      { $match: { 'ratings.content': contentId } },
      { $group: { _id: null, avgRating: { $avg: '$ratings.rating' }, count: { $sum: 1 } } },
    ])

    if (ratings.length > 0) {
      await Content.findByIdAndUpdate(contentId, {
        averageUserRating: ratings[0].avgRating,
        totalUserRatings: ratings[0].count,
      })
    }
  } catch (error) {
    console.error('Error updating content average rating:', error)
  }
}
