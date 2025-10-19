import Content from '../models/Content.js'
import User from '../models/User.js'
import tmdbService from '../services/tmdbService.js'
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

// Saves Animated Movie content to database
export const getAnimatedMovies = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query

    // Try to get from TMDB first
    const tmdbData = await tmdbService.getAnimatedMovies(page)

    // Process and save to database
    const processedMovies = await Promise.all(
      tmdbData.results.map(async (movie) => {
        try {
          let content = await Content.findOne({ tmdbId: movie.id })

          if (!content) {
            content = new Content({
              tmdbId: movie.id,
              title: movie.title,
              originalTitle: movie.original_title,
              overview: movie.overview,
              posterPath: movie.poster_path,
              backdropPath: movie.backdrop_path,
              releaseDate: movie.release_date ? new Date(movie.release_date) : null,
              contentType: 'movie',
              genres: convertGenreIds(movie.genre_ids),
              adult: movie.adult,
              originalLanguage: movie.original_language,
              popularity: movie.popularity,
              voteAverage: movie.vote_average,
              voteCount: movie.vote_count,
              runtime: movie.runtime,
              isAnimated: true,
            })
            await content.save()
          } else {
            // Update existing content with genres if missing
            if (!content.genres || content.genres.length === 0) {
              content.genres = convertGenreIds(movie.genre_ids)
              await content.save()
            }
          }

          return {
            ...content.toObject(),
            genres: convertGenreIds(content.genres),
          }
        } catch (error) {
          console.error(`Error processing movie ${movie.id}:`, error)
          return null
        }
      }),
    )

    const validMovies = processedMovies.filter((movie) => movie !== null)

    res.json({
      success: true,
      data: {
        movies: validMovies,
        pagination: {
          page: parseInt(page),
          totalPages: tmdbData.total_pages,
          totalResults: tmdbData.total_results,
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
export const getAnimatedTVShows = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query

    const tmdbData = await tmdbService.getAnimatedTVShows(page)

    const processedShows = await Promise.all(
      tmdbData.results.map(async (show) => {
        try {
          let content = await Content.findOne({ tmdbId: show.id })

          if (!content) {
            content = new Content({
              tmdbId: show.id,
              title: show.name,
              originalTitle: show.original_name,
              overview: show.overview,
              posterPath: show.poster_path,
              backdropPath: show.backdrop_path,
              releaseDate: show.first_air_date ? new Date(show.first_air_date) : null,
              contentType: 'tv',
              genres: convertGenreIds(show.genre_ids),
              adult: show.adult,
              originalLanguage: show.original_language,
              popularity: show.popularity,
              voteAverage: show.vote_average,
              voteCount: show.vote_count,
              numberOfSeasons: show.number_of_seasons,
              numberOfEpisodes: show.number_of_episodes,
              isAnimated: true,
            })
            await content.save()
          } else {
            // Update existing content with genres if missing
            if (!content.genres || content.genres.length === 0) {
              content.genres = convertGenreIds(show.genre_ids)
              await content.save()
            }
          }

          return {
            ...content.toObject(),
            genres: convertGenreIds(content.genres),
          }
        } catch (error) {
          console.error(`Error processing TV show ${show.id}:`, error)
          return null
        }
      }),
    )

    const validShows = processedShows.filter((show) => show !== null)

    res.json({
      success: true,
      data: {
        shows: validShows,
        pagination: {
          page: parseInt(page),
          totalPages: tmdbData.total_pages,
          totalResults: tmdbData.total_results,
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

export const searchContent = async (req, res) => {
  try {
    const { query, page = 1 } = req.query

    if (!query) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required',
      })
    }

    const searchResults = await tmdbService.searchAnimatedContent(query, page)

    // Process movies - convert genre_ids to genre names and create proper structure
    const processedMovies = searchResults.movies.results.map((movie) => ({
      _id: `tmdb_${movie.id}`,
      tmdbId: movie.id,
      title: movie.title,
      originalTitle: movie.original_title,
      overview: movie.overview,
      posterPath: movie.poster_path,
      backdropPath: movie.backdrop_path,
      releaseDate: movie.release_date ? new Date(movie.release_date) : null,
      contentType: 'movie',
      genres: convertGenreIds(movie.genre_ids),
      voteAverage: movie.vote_average,
      voteCount: movie.vote_count,
    }))

    // Process TV shows - convert genre_ids to genre names and create proper structure
    const processedTVShows = searchResults.tv.results.map((show) => ({
      _id: `tmdb_${show.id}`,
      tmdbId: show.id,
      title: show.name,
      originalTitle: show.original_name,
      overview: show.overview,
      posterPath: show.poster_path,
      backdropPath: show.backdrop_path,
      releaseDate: show.first_air_date ? new Date(show.first_air_date) : null,
      contentType: 'tv',
      genres: convertGenreIds(show.genre_ids),
      voteAverage: show.vote_average,
      voteCount: show.vote_count,
    }))

    res.json({
      success: true,
      data: {
        movies: processedMovies,
        tv: processedTVShows,
        pagination: {
          page: parseInt(page),
          totalPages: Math.max(searchResults.movies.total_pages, searchResults.tv.total_pages),
          totalResults: searchResults.movies.total_results + searchResults.tv.total_results,
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
