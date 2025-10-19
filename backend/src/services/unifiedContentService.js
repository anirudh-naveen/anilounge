import axios from 'axios'
import dotenv from 'dotenv'

dotenv.config()

class UnifiedContentService {
  constructor() {
    this.tmdbApiKey = process.env.TMDB_API_KEY
    this.malClientId = process.env.MAL_CLIENT_ID
    this.malClientSecret = process.env.MAL_CLIENT_SECRET

    this.tmdbBaseURL = 'https://api.themoviedb.org/3'
    this.malBaseURL = 'https://api.myanimelist.net/v2'

    this.tmdbClient = axios.create({
      baseURL: this.tmdbBaseURL,
      timeout: 30000
    })

    this.malClient = axios.create({
      baseURL: this.malBaseURL,
      headers: {
        'X-MAL-CLIENT-ID': this.malClientId
      },
      timeout: 30000
    })

    this.hasTmdbKey = !!this.tmdbApiKey
    this.hasMalKey = !!this.malClientId
  }

  // Delay utility for rate limiting
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  // TMDB Methods
  async getTmdbAnimatedMovies(page = 1, limit = 20) {
    if (!this.hasTmdbKey) {
      console.log('TMDB API key not configured')
      return []
    }

    try {
      await this.delay(200)
      const response = await this.tmdbClient.get('/discover/movie', {
        params: {
          api_key: this.tmdbApiKey,
          with_genres: '16', // Animation genre
          sort_by: 'popularity.desc',
          page,
          include_adult: false
        }
      })

      return response.data.results.slice(0, limit)
    } catch (error) {
      console.error('TMDB animated movies error:', error.response?.data || error.message)
      return []
    }
  }

  async getTmdbAnimatedTVShows(page = 1, limit = 20) {
    if (!this.hasTmdbKey) {
      console.log('TMDB API key not configured')
      return []
    }

    try {
      await this.delay(200)
      const response = await this.tmdbClient.get('/discover/tv', {
        params: {
          api_key: this.tmdbApiKey,
          with_genres: '16', // Animation genre
          sort_by: 'popularity.desc',
          page,
          include_adult: false
        }
      })

      return response.data.results.slice(0, limit)
    } catch (error) {
      console.error('TMDB animated TV shows error:', error.response?.data || error.message)
      return []
    }
  }

  async getTmdbContentDetails(tmdbId, contentType) {
    if (!this.hasTmdbKey) return null

    try {
      await this.delay(200)
      const endpoint = contentType === 'movie' ? '/movie' : '/tv'
      const response = await this.tmdbClient.get(`${endpoint}/${tmdbId}`, {
        params: {
          api_key: this.tmdbApiKey
        }
      })

      return response.data
    } catch (error) {
      console.error(`TMDB ${contentType} details error:`, error.response?.data || error.message)
      return null
    }
  }

  // MAL Methods
  async getMalTopAnimeMovies(limit = 50, offset = 0) {
    if (!this.hasMalKey) {
      console.log('MAL API key not configured')
      return []
    }

    try {
      await this.delay(300)
      const response = await this.malClient.get('/anime/ranking', {
        params: {
          ranking_type: 'all',
          limit: Math.min(limit * 3, 300), // Get more to filter for movies
          offset,
          fields: 'id,title,main_picture,alternative_titles,synopsis,mean,rank,popularity,num_episodes,status,start_season,studios,genres,rating,source'
        }
      })

      // Filter for anime movies (typically have 1 episode or are movies)
      const allAnime = response.data.data || []
      const movies = allAnime.filter(anime => {
        const episodes = anime.num_episodes || 0
        const title = anime.title?.toLowerCase() || ''

        // Movies typically have 1 episode, or are marked as movies
        return episodes === 1 ||
               title.includes('movie') ||
               title.includes('film') ||
               title.includes('ova') ||
               title.includes('special') ||
               (episodes === 0 && anime.status === 'finished_airing')
      }).slice(0, limit)

      return movies
    } catch (error) {
      console.error('MAL top anime movies error:', error.response?.data || error.message)
      return []
    }
  }

  async getMalTopAnime(limit = 50, offset = 0) {
    if (!this.hasMalKey) {
      console.log('MAL API key not configured')
      return []
    }

    try {
      await this.delay(300)
      const response = await this.malClient.get('/anime/ranking', {
        params: {
          ranking_type: 'all',
          limit: Math.min(limit, 100),
          offset,
          fields: 'id,title,main_picture,alternative_titles,synopsis,mean,rank,popularity,num_episodes,status,start_season,studios,genres,rating,source'
        }
      })

      return response.data.data || []
    } catch (error) {
      console.error('MAL top anime error:', error.response?.data || error.message)
      return []
    }
  }

  async getMalAnimeDetails(malId) {
    if (!this.hasMalKey) return null

    try {
      await this.delay(300)
      const response = await this.malClient.get(`/anime/${malId}`, {
        params: {
          fields: 'id,title,main_picture,alternative_titles,synopsis,mean,rank,popularity,num_episodes,status,start_season,studios,genres,rating,source'
        }
      })

      return response.data
    } catch (error) {
      console.error('MAL anime details error:', error.response?.data || error.message)
      return null
    }
  }

  async searchMalAnime(query, limit = 20) {
    if (!this.hasMalKey) return []

    try {
      await this.delay(300)
      const response = await this.malClient.get('/anime', {
        params: {
          q: query,
          limit: Math.min(limit, 100),
          fields: 'id,title,main_picture,alternative_titles,synopsis,mean,rank,popularity,num_episodes,status,start_season,studios,genres,rating,source'
        }
      })

      return response.data.data || []
    } catch (error) {
      console.error('MAL search error:', error.response?.data || error.message)
      return []
    }
  }

  // Content Conversion Methods
  convertTmdbToContent(tmdbData, contentType) {
    const content = {
      title: tmdbData.title || tmdbData.name,
      originalTitle: tmdbData.original_title || tmdbData.original_name,
      overview: tmdbData.overview,
      contentType,
      posterPath: tmdbData.poster_path,
      backdropPath: tmdbData.backdrop_path,
      releaseDate: tmdbData.release_date || tmdbData.first_air_date,
      voteAverage: tmdbData.vote_average,
      voteCount: tmdbData.vote_count,
      popularity: tmdbData.popularity,
      tmdbId: tmdbData.id,
      genres: tmdbData.genres || [],
      productionCompanies: tmdbData.production_companies?.map(company => company.name) || [],
      dataSources: {
        tmdb: {
          hasData: true,
          lastUpdated: new Date()
        }
      }
    }

    // Add runtime/episode info based on content type
    if (contentType === 'movie') {
      content.runtime = tmdbData.runtime
    } else {
      content.episodeCount = tmdbData.number_of_episodes
      content.seasonCount = tmdbData.number_of_seasons
    }

    return content
  }

  convertMalToContent(malData) {
    // Handle MAL API response structure - data might be in malData.node
    const anime = malData.node || malData

    // Determine content type based on episode count and status
    // Single episode + finished airing = movie
    // Multiple episodes or currently airing = TV show
    const episodes = anime.num_episodes || 0
    const status = anime.status
    const isMovie = episodes === 1 && status === 'finished_airing'
    const finalContentType = isMovie ? 'movie' : 'tv'

    const content = {
      title: anime.title || 'Unknown Title',
      originalTitle: anime.alternative_titles?.en || anime.title || 'Unknown Title',
      overview: anime.synopsis || '',
      contentType: finalContentType, // Use determined content type
      posterPath: anime.main_picture?.medium || anime.main_picture?.large,
      malId: anime.id,
      malScore: anime.mean,
      malScoredBy: anime.num_list_users,
      malRank: anime.rank,
      malStatus: anime.status,
      malEpisodes: anime.num_episodes,
      malSource: anime.source,
      malRating: anime.rating,
      genres: anime.genres?.map(genre => ({ id: genre.id, name: genre.name })) || [],
      studios: anime.studios?.map(studio => studio.name) || [],
      alternativeTitles: anime.alternative_titles ? Object.values(anime.alternative_titles).flat() : [],
      dataSources: {
        mal: {
          hasData: true,
          lastUpdated: new Date()
        }
      }
    }

    // Set release date from start season
    if (anime.start_season) {
      const year = anime.start_season.year
      const month = anime.start_season.season === 'winter' ? 1 :
                   anime.start_season.season === 'spring' ? 4 :
                   anime.start_season.season === 'summer' ? 7 : 10
      content.releaseDate = new Date(year, month - 1, 1)
    }

    // Add runtime/episode info based on determined content type
    if (finalContentType === 'movie') {
      content.runtime = episodes * 24 // Estimate 24 minutes per episode for movies
    } else {
      content.episodeCount = episodes
    }

    return content
  }

  // Unified Search Method
  async searchContent(query, options = {}) {
    const {
      contentType = 'all',
      limit = 20,
      includeTmdb = true,
      includeMal = true
    } = options

    const results = []

    // Search TMDB
    if (includeTmdb && this.hasTmdbKey) {
      try {
        const tmdbResults = await this.searchTmdb(query, contentType, limit)
        results.push(...tmdbResults.map(item => ({
          ...item,
          source: 'tmdb'
        })))
      } catch (error) {
        console.error('TMDB search error:', error.message)
      }
    }

    // Search MAL
    if (includeMal && this.hasMalKey) {
      try {
        const malResults = await this.searchMalAnime(query, limit)
        results.push(...malResults.map(item => ({
          ...this.convertMalToContent(item),
          source: 'mal'
        })))
      } catch (error) {
        console.error('MAL search error:', error.message)
      }
    }

    // Remove duplicates and sort by relevance
    return this.deduplicateAndRank(results, query)
  }

  async searchTmdb(query, contentType, limit) {
    if (!this.hasTmdbKey) return []

    const results = []
    const searchLimit = Math.ceil(limit / 2)

    try {
      if (contentType === 'all' || contentType === 'movie') {
        await this.delay(200)
        const movieResponse = await this.tmdbClient.get('/search/movie', {
          params: {
            api_key: this.tmdbApiKey,
            query,
            include_adult: false
          }
        })

        const movies = movieResponse.data.results
          .filter(movie => this.isAnimatedContent(movie))
          .slice(0, searchLimit)
          .map(movie => this.convertTmdbToContent(movie, 'movie'))

        results.push(...movies)
      }

      if (contentType === 'all' || contentType === 'tv') {
        await this.delay(200)
        const tvResponse = await this.tmdbClient.get('/search/tv', {
          params: {
            api_key: this.tmdbApiKey,
            query,
            include_adult: false
          }
        })

        const tvShows = tvResponse.data.results
          .filter(tv => this.isAnimatedContent(tv))
          .slice(0, searchLimit)
          .map(tv => this.convertTmdbToContent(tv, 'tv'))

        results.push(...tvShows)
      }

      return results
    } catch (error) {
      console.error('TMDB search error:', error.response?.data || error.message)
      return []
    }
  }

  // Helper method to check if content is animated
  isAnimatedContent(content) {
    if (!content.genre_ids) return false

    // TMDB Animation genre ID is 16
    return content.genre_ids.includes(16)
  }

  // Deduplicate and rank search results
  deduplicateAndRank(results, query) {
    const seen = new Set()
    const deduplicated = []

    for (const result of results) {
      const key = `${result.title}-${result.contentType}`
      if (!seen.has(key)) {
        seen.add(key)
        deduplicated.push(result)
      }
    }

    // Sort by relevance (exact title match first, then popularity)
    return deduplicated.sort((a, b) => {
      const aTitleMatch = a.title.toLowerCase().includes(query.toLowerCase())
      const bTitleMatch = b.title.toLowerCase().includes(query.toLowerCase())

      if (aTitleMatch && !bTitleMatch) return -1
      if (!aTitleMatch && bTitleMatch) return 1

      // Sort by popularity/score
      const aScore = a.malScore || a.voteAverage || 0
      const bScore = b.malScore || b.voteAverage || 0
      return bScore - aScore
    })
  }

  // Get popular content from both sources
  async getPopularContent(options = {}) {
    const {
      contentType = 'all',
      limit = 20,
      includeTmdb = true,
      includeMal = true
    } = options

    const results = []

    // Get TMDB popular content
    if (includeTmdb && this.hasTmdbKey) {
      try {
        if (contentType === 'all' || contentType === 'movie') {
          const movies = await this.getTmdbAnimatedMovies(1, Math.ceil(limit / 2))
          results.push(...movies.map(movie => ({
            ...this.convertTmdbToContent(movie, 'movie'),
            source: 'tmdb'
          })))
        }

        if (contentType === 'all' || contentType === 'tv') {
          const tvShows = await this.getTmdbAnimatedTVShows(1, Math.ceil(limit / 2))
          results.push(...tvShows.map(tv => ({
            ...this.convertTmdbToContent(tv, 'tv'),
            source: 'tmdb'
          })))
        }
      } catch (error) {
        console.error('Error getting TMDB popular content:', error.message)
      }
    }

    // Get MAL popular content
    if (includeMal && this.hasMalKey) {
      try {
        const malAnime = await this.getMalTopAnime(Math.ceil(limit / 2))
        results.push(...malAnime.map(anime => ({
          ...this.convertMalToContent(anime),
          source: 'mal'
        })))
      } catch (error) {
        console.error('Error getting MAL popular content:', error.message)
      }
    }

    // Sort by popularity and return
    return results
      .sort((a, b) => {
        const aPop = a.popularity || a.malScoredBy || 0
        const bPop = b.popularity || b.malScoredBy || 0
        return bPop - aPop
      })
      .slice(0, limit)
  }
}

export default new UnifiedContentService()
