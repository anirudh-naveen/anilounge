import axios from 'axios'
import mongoose from 'mongoose'
import Content from '../models/Content.js'
import dotenv from 'dotenv'

dotenv.config()

// TMDB API configuration
const TMDB_API_KEY = process.env.TMDB_API_KEY
const TMDB_BASE_URL = 'https://api.themoviedb.org/3'

const client = axios.create({
  baseURL: TMDB_BASE_URL,
  params: {
    api_key: TMDB_API_KEY,
  },
})

// Helper function to determine if content is animated
function isAnimatedContent(content) {
  // First check if it has the Animation genre (ID 16)
  if (content.genre_ids && content.genre_ids.includes(16)) {
    return true
  }

  // Check for Family genre combined with keywords (many animated movies are Family)
  const hasFamilyGenre = content.genre_ids && content.genre_ids.includes(10751)

  // Comprehensive animation keywords
  const animationKeywords = [
    'animation',
    'animated',
    'cartoon',
    'anime',
    'manga',
    'pixar',
    'disney',
    'studio ghibli',
    'dreamworks',
    'stop-motion',
    'stop motion',
    'claymation',
    'cgi',
    'computer generated',
    '3d animation',
    '2d animation',
    'cel animation',
    'hand-drawn',
    'hand drawn',
    'motion capture',
    'rotoscoping',
    'puppet',
    'marionette',
    'cutout animation',
    'flash animation',
    'toon',
    'toons',
  ]

  // Live-action keywords to exclude
  const liveActionKeywords = [
    'live action',
    'live-action',
    'documentary',
    'reality',
    'news',
    'talk show',
    'game show',
    'sports',
    'concert',
    'stand-up',
    'stand up',
    'comedy special',
    'biography',
    'biopic',
    'true story',
    'based on true events',
    'real life',
    'actual footage',
    'found footage',
    'retrospective',
    'behind the scenes',
    'making of',
    'interview',
    'special',
    'episode',
    'season',
    'series',
  ]

  // Check for Documentary genre (ID 99) - exclude these
  if (content.genre_ids && content.genre_ids.includes(99)) {
    return false
  }

  // Check for Reality genre (ID 10764) - exclude these
  if (content.genre_ids && content.genre_ids.includes(10764)) {
    return false
  }

  // Check for News genre (ID 10763) - exclude these
  if (content.genre_ids && content.genre_ids.includes(10763)) {
    return false
  }

  // Check for Talk genre (ID 10767) - exclude these
  if (content.genre_ids && content.genre_ids.includes(10767)) {
    return false
  }

  const contentText = [content.title, content.original_title, content.overview, content.tagline]
    .filter(Boolean) // Remove null/undefined values
    .join(' ')
    .toLowerCase()

  // Exclude if it contains live-action keywords
  if (liveActionKeywords.some((keyword) => contentText.includes(keyword))) {
    return false
  }

  // Include if it has animation keywords
  const hasAnimationKeywords = animationKeywords.some((keyword) => contentText.includes(keyword))

  // Include if it's Family genre with animation keywords
  if (hasFamilyGenre && hasAnimationKeywords) {
    return true
  }

  // Include if it has strong animation keywords regardless of genre
  if (hasAnimationKeywords) {
    return true
  }

  // For Family genre without clear animation keywords, be more selective
  if (hasFamilyGenre) {
    // Only include if it's clearly animated (Disney, Pixar, etc.)
    const strongAnimationKeywords = [
      'disney',
      'pixar',
      'dreamworks',
      'studio ghibli',
      'cartoon',
      'anime',
    ]
    return strongAnimationKeywords.some((keyword) => contentText.includes(keyword))
  }

  return false
}

// Genre mapping function
function convertGenreIds(genreIds) {
  const genreMap = {
    28: 'Action',
    12: 'Adventure',
    16: 'Animation',
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

  if (!genreIds || !Array.isArray(genreIds)) {
    return []
  }

  return genreIds
    .map((id) => genreMap[id])
    .filter(Boolean)
    .filter((genre) => genre !== 'Animation') // Remove Animation genre as it's implied
}

// Function to fetch and store animated movies
async function fetchAnimatedMovies(page = 1, totalPages = 10) {
  console.log(`Fetching animated movies - Page ${page}/${totalPages}`)

  try {
    const response = await client.get('/discover/movie', {
      params: {
        page,
        include_adult: false,
        with_genres: '16', // Animation genre
        sort_by: 'popularity.desc',
      },
    })

    const movies = response.data.results
    let animatedCount = 0

    for (const movie of movies) {
      if (isAnimatedContent(movie)) {
        const existingContent = await Content.findOne({ tmdbId: movie.id })

        if (!existingContent) {
          const content = new Content({
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
            animationType: 'Mixed',
            ageRating: 'PG',
            averageUserRating: 0,
            totalUserRatings: 0,
            networks: [],
            productionCompanies: movie.production_companies || [],
            productionCountries: movie.production_countries || [],
            spokenLanguages: movie.spoken_languages || [],
            lastUpdated: new Date(),
          })

          await content.save()
          animatedCount++
          console.log(`✅ Saved animated movie: ${movie.title}`)
        }
      }
    }

    console.log(`📊 Page ${page}: Found ${animatedCount} new animated movies`)
    return { hasMore: page < totalPages, count: animatedCount }
  } catch (error) {
    console.error(`❌ Error fetching movies page ${page}:`, error.message)
    return { hasMore: false, count: 0 }
  }
}

// Function to fetch and store animated TV shows
async function fetchAnimatedTVShows(page = 1, totalPages = 10) {
  console.log(`Fetching animated TV shows - Page ${page}/${totalPages}`)

  try {
    const response = await client.get('/discover/tv', {
      params: {
        page,
        include_adult: false,
        with_genres: '16', // Animation genre
        sort_by: 'popularity.desc',
      },
    })

    const shows = response.data.results
    let animatedCount = 0

    for (const show of shows) {
      if (isAnimatedContent(show)) {
        const existingContent = await Content.findOne({ tmdbId: show.id })

        if (!existingContent) {
          const content = new Content({
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
            animationType: 'Mixed',
            ageRating: 'PG',
            averageUserRating: 0,
            totalUserRatings: 0,
            networks: show.networks || [],
            productionCompanies: show.production_companies || [],
            productionCountries: show.production_countries || [],
            spokenLanguages: show.spoken_languages || [],
            lastUpdated: new Date(),
          })

          await content.save()
          animatedCount++
          console.log(`✅ Saved animated TV show: ${show.name}`)
        }
      }
    }

    console.log(`📊 Page ${page}: Found ${animatedCount} new animated TV shows`)
    return { hasMore: page < totalPages, count: animatedCount }
  } catch (error) {
    console.error(`❌ Error fetching TV shows page ${page}:`, error.message)
    return { hasMore: false, count: 0 }
  }
}

// Main function to populate the database
async function populateAnimatedContent() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/find-animation')
    console.log('🔗 Connected to MongoDB')

    // Clear existing content
    console.log('🗑️ Clearing existing content...')
    await Content.deleteMany({})
    console.log('✅ Cleared existing content')

    // Fetch animated movies (first 20 pages = ~400 movies)
    console.log('\n🎬 Starting to fetch animated movies...')
    let moviePage = 1
    let totalMovies = 0
    const maxMoviePages = 20

    while (moviePage <= maxMoviePages) {
      const result = await fetchAnimatedMovies(moviePage, maxMoviePages)
      totalMovies += result.count

      if (!result.hasMore) break
      moviePage++

      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    // Fetch animated TV shows (first 20 pages = ~400 shows)
    console.log('\n📺 Starting to fetch animated TV shows...')
    let showPage = 1
    let totalShows = 0
    const maxShowPages = 20

    while (showPage <= maxShowPages) {
      const result = await fetchAnimatedTVShows(showPage, maxShowPages)
      totalShows += result.count

      if (!result.hasMore) break
      showPage++

      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    console.log('\n🎉 Population complete!')
    console.log(`📊 Total animated movies: ${totalMovies}`)
    console.log(`📊 Total animated TV shows: ${totalShows}`)
    console.log(`📊 Total animated content: ${totalMovies + totalShows}`)

  } catch (error) {
    console.error('❌ Error populating animated content:', error)
  } finally {
    await mongoose.disconnect()
    console.log('🔌 Disconnected from MongoDB')
    process.exit(0)
  }
}

// Run the script
populateAnimatedContent()
