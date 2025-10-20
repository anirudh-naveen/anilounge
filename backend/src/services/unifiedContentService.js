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
      timeout: 30000,
    })

    this.malClient = axios.create({
      baseURL: this.malBaseURL,
      headers: {
        'X-MAL-CLIENT-ID': this.malClientId,
      },
      timeout: 30000,
    })

    this.hasTmdbKey = !!this.tmdbApiKey
    this.hasMalKey = !!this.malClientId
  }

  // Generate unique internal ID for content
  generateInternalId(contentData) {
    const titleSlug = (contentData.title || contentData.originalTitle || 'unknown')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .substring(0, 50) // Limit length
    const contentType = contentData.contentType || 'unknown'
    const tmdbPart = contentData.tmdbId ? `tmdb-${contentData.tmdbId}` : ''
    const malPart = contentData.malId ? `mal-${contentData.malId}` : ''
    const externalPart = [tmdbPart, malPart].filter(Boolean).join('-')

    // Use timestamp and random string for uniqueness
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 8)

    return `${contentType}-${titleSlug}${externalPart ? `-${externalPart}` : ''}-${timestamp}-${random}`
  }

  // Delay utility for rate limiting
  async delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
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
          include_adult: false,
        },
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
          include_adult: false,
        },
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
          api_key: this.tmdbApiKey,
        },
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
          fields:
            'id,title,main_picture,alternative_titles,synopsis,mean,rank,popularity,num_episodes,status,start_season,studios,genres,rating,source,num_list_users',
        },
      })

      // Filter for anime movies (typically have 1 episode or are movies)
      const allAnime = response.data.data || []
      const movies = allAnime
        .filter((anime) => {
          const episodes = anime.num_episodes || 0
          const title = anime.title?.toLowerCase() || ''

          // Movies typically have 1 episode, or are marked as movies
          return (
            episodes === 1 ||
            title.includes('movie') ||
            title.includes('film') ||
            title.includes('ova') ||
            title.includes('special') ||
            (episodes === 0 && anime.status === 'finished_airing')
          )
        })
        .slice(0, limit)

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
          fields:
            'id,title,main_picture,alternative_titles,synopsis,mean,rank,popularity,num_episodes,status,start_season,studios,genres,rating,source,num_list_users',
        },
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
          fields:
            'id,title,main_picture,alternative_titles,synopsis,mean,rank,popularity,num_episodes,status,start_season,studios,genres,rating,source,num_list_users',
        },
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
          fields:
            'id,title,main_picture,alternative_titles,synopsis,mean,rank,popularity,num_episodes,status,start_season,studios,genres,rating,source,num_list_users',
        },
      })

      return response.data.data || []
    } catch (error) {
      console.error('MAL search error:', error.response?.data || error.message)
      return []
    }
  }

  // Content Conversion Methods
  convertTmdbToContent(tmdbData, contentType) {
    // Filter out TMDB content with less than 50 votes or null vote data
    if (!tmdbData.vote_count || tmdbData.vote_count < 50 || !tmdbData.vote_average) {
      return null
    }

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
      productionCompanies: tmdbData.production_companies?.map((company) => company.name) || [],
      dataSources: {
        tmdb: {
          hasData: true,
          lastUpdated: new Date(),
        },
      },
    }

    // Add runtime/episode info based on content type
    if (contentType === 'movie') {
      content.runtime = tmdbData.runtime
    } else {
      content.episodeCount = tmdbData.number_of_episodes
      content.seasonCount = tmdbData.number_of_seasons
    }

    // Generate internal ID
    content.internalId = this.generateInternalId(content)

    return content
  }

  convertMalToContent(malData) {
    // Handle MAL API response structure - data might be in malData.node
    const anime = malData.node || malData

    // Filter out music videos
    if (anime.source === 'music') {
      return null
    }

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
      genres: anime.genres?.map((genre) => ({ id: genre.id, name: genre.name })) || [],
      studios: anime.studios?.map((studio) => studio.name) || [],
      alternativeTitles: anime.alternative_titles
        ? Object.values(anime.alternative_titles).flat()
        : [],
      dataSources: {
        mal: {
          hasData: true,
          lastUpdated: new Date(),
        },
      },
    }

    // Set release date from start season
    if (anime.start_season) {
      const year = anime.start_season.year
      const month =
        anime.start_season.season === 'winter'
          ? 1
          : anime.start_season.season === 'spring'
            ? 4
            : anime.start_season.season === 'summer'
              ? 7
              : 10
      content.releaseDate = new Date(year, month - 1, 1)
    }

    // Add runtime/episode info based on determined content type
    if (finalContentType === 'movie') {
      // Use more accurate runtime estimates for known anime movies
      content.runtime = this.getEstimatedRuntime(anime.title)
    } else {
      content.episodeCount = episodes
    }

    // Generate internal ID
    content.internalId = this.generateInternalId(content)

    return content
  }

  // Get estimated runtime for anime movies
  getEstimatedRuntime(title) {
    // Known anime movie runtimes (in minutes)
    const knownRuntimes = {
      'Gintama: The Final': 104,
      'Gintama: The Very Final': 104,
      'Demon Slayer: Kimetsu no Yaiba - The Movie: Mugen Train': 117,
      'Demon Slayer: Mugen Train': 117,
      'Your Name': 106,
      'Kimi no Na wa': 106,
      'Spirited Away': 125,
      'Sen to Chihiro no Kamikakushi': 125,
      'Princess Mononoke': 134,
      'Mononoke-hime': 134,
      "Howl's Moving Castle": 119,
      'Hauru no Ugoku Shiro': 119,
      'My Neighbor Totoro': 86,
      'Tonari no Totoro': 86,
      "Kiki's Delivery Service": 103,
      'Majo no Takkyuubin': 103,
      'Castle in the Sky': 125,
      'Tenkuu no Shiro Laputa': 125,
      'The Wind Rises': 126,
      'Kaze Tachinu': 126,
      Ponyo: 101,
      'Gake no Ue no Ponyo': 101,
      'The Tale of Princess Kaguya': 137,
      'Kaguya-hime no Monogatari': 137,
      'When Marnie Was There': 103,
      'Omoide no Marnie': 103,
      'The Red Turtle': 80,
      'La Tortue Rouge': 80,
      'A Silent Voice': 130,
      'Koe no Katachi': 130,
      'Weathering with You': 112,
      'Tenki no Ko': 112,
      Suzume: 122,
      'Suzume no Tojimari': 122,
      'Perfect Blue': 81,
      'Millennium Actress': 87,
      'Tokyo Godfathers': 92,
      Paprika: 90,
      'Wolf Children': 117,
      'Ookami Kodomo no Ame to Yuki': 117,
      'The Boy and the Heron': 124,
      'Kimitachi wa Dou Ikiru ka': 124,
      'The Girl Who Leapt Through Time': 98,
      'Toki wo Kakeru Shoujo': 98,
      'Summer Wars': 114,
      'Summer Wars': 114,
      'The Secret World of Arrietty': 94,
      'Karigurashi no Arrietty': 94,
      'From Up on Poppy Hill': 91,
      'Kokuriko-zaka Kara': 91,
      'The Wind Rises': 126,
      'Kaze Tachinu': 126,
      'The Tale of Princess Kaguya': 137,
      'Kaguya-hime no Monogatari': 137,
      'When Marnie Was There': 103,
      'Omoide no Marnie': 103,
      'The Red Turtle': 80,
      'La Tortue Rouge': 80,
      'A Silent Voice': 130,
      'Koe no Katachi': 130,
      'Weathering with You': 112,
      'Tenki no Ko': 112,
      Suzume: 122,
      'Suzume no Tojimari': 122,
      'Perfect Blue': 81,
      'Millennium Actress': 87,
      'Tokyo Godfathers': 92,
      Paprika: 90,
      'Wolf Children': 117,
      'Ookami Kodomo no Ame to Yuki': 117,
      'The Boy and the Heron': 124,
      'Kimitachi wa Dou Ikiru ka': 124,
      'The Girl Who Leapt Through Time': 98,
      'Toki wo Kakeru Shoujo': 98,
      'Summer Wars': 114,
      'Summer Wars': 114,
      'The Secret World of Arrietty': 94,
      'Karigurashi no Arrietty': 94,
      'From Up on Poppy Hill': 91,
      'Kokuriko-zaka Kara': 91,
    }

    // Check for exact title match first
    if (knownRuntimes[title]) {
      return knownRuntimes[title]
    }

    // Check for partial matches
    for (const [knownTitle, runtime] of Object.entries(knownRuntimes)) {
      if (
        title.toLowerCase().includes(knownTitle.toLowerCase()) ||
        knownTitle.toLowerCase().includes(title.toLowerCase())
      ) {
        return runtime
      }
    }

    // Default estimates based on common patterns
    const titleLower = title.toLowerCase()

    // Studio Ghibli movies are typically longer
    if (
      titleLower.includes('ghibli') ||
      titleLower.includes('miyazaki') ||
      titleLower.includes('mononoke') ||
      titleLower.includes('spirited away') ||
      titleLower.includes('howl') ||
      titleLower.includes('totoro') ||
      titleLower.includes('kiki') ||
      titleLower.includes('castle in the sky') ||
      titleLower.includes('ponyo') ||
      titleLower.includes('arrietty') ||
      titleLower.includes('poppy hill') ||
      titleLower.includes('marnie') ||
      titleLower.includes('kaguya') ||
      titleLower.includes('red turtle')
    ) {
      return 110 // Average Ghibli movie length
    }

    // Makoto Shinkai movies
    if (
      titleLower.includes('your name') ||
      titleLower.includes('weathering') ||
      titleLower.includes('suzume') ||
      titleLower.includes('shinkai')
    ) {
      return 110 // Average Shinkai movie length
    }

    // Satoshi Kon movies
    if (
      titleLower.includes('perfect blue') ||
      titleLower.includes('millennium actress') ||
      titleLower.includes('tokyo godfathers') ||
      titleLower.includes('paprika') ||
      titleLower.includes('kon')
    ) {
      return 90 // Average Kon movie length
    }

    // Mamoru Hosoda movies
    if (
      titleLower.includes('wolf children') ||
      titleLower.includes('summer wars') ||
      titleLower.includes('girl who leapt') ||
      titleLower.includes('boy and the heron') ||
      titleLower.includes('hosoda')
    ) {
      return 110 // Average Hosoda movie length
    }

    // Demon Slayer movies
    if (
      titleLower.includes('demon slayer') ||
      titleLower.includes('kimetsu no yaiba') ||
      titleLower.includes('mugen train')
    ) {
      return 117 // Known Demon Slayer movie length
    }

    // Gintama movies
    if (
      titleLower.includes('gintama') &&
      (titleLower.includes('final') || titleLower.includes('movie'))
    ) {
      return 104 // Known Gintama movie length
    }

    // Default estimate: 90 minutes for anime movies
    return 90
  }

  // Unified Search Method
  async searchContent(query, options = {}) {
    const { contentType = 'all', limit = 20, includeTmdb = true, includeMal = true } = options

    const results = []

    // Search TMDB
    if (includeTmdb && this.hasTmdbKey) {
      try {
        const tmdbResults = await this.searchTmdb(query, contentType, limit)
        results.push(
          ...tmdbResults.map((item) => ({
            ...item,
            source: 'tmdb',
          })),
        )
      } catch (error) {
        console.error('TMDB search error:', error.message)
      }
    }

    // Search MAL
    if (includeMal && this.hasMalKey) {
      try {
        const malResults = await this.searchMalAnime(query, limit)
        results.push(
          ...malResults
            .map((item) => this.convertMalToContent(item))
            .filter((item) => item !== null) // Filter out null results
            .map((item) => ({
              ...item,
              source: 'mal',
            })),
        )
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
            include_adult: false,
          },
        })

        const movies = movieResponse.data.results
          .filter((movie) => this.isAnimatedContent(movie))
          .map((movie) => this.convertTmdbToContent(movie, 'movie'))
          .filter((movie) => movie !== null) // Filter out null results
          .slice(0, searchLimit)

        results.push(...movies)
      }

      if (contentType === 'all' || contentType === 'tv') {
        await this.delay(200)
        const tvResponse = await this.tmdbClient.get('/search/tv', {
          params: {
            api_key: this.tmdbApiKey,
            query,
            include_adult: false,
          },
        })

        const tvShows = tvResponse.data.results
          .filter((tv) => this.isAnimatedContent(tv))
          .map((tv) => this.convertTmdbToContent(tv, 'tv'))
          .filter((tv) => tv !== null) // Filter out null results
          .slice(0, searchLimit)

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
    const { contentType = 'all', limit = 20, includeTmdb = true, includeMal = true } = options

    const results = []

    // Get TMDB popular content
    if (includeTmdb && this.hasTmdbKey) {
      try {
        if (contentType === 'all' || contentType === 'movie') {
          const movies = await this.getTmdbAnimatedMovies(1, Math.ceil(limit / 2))
          results.push(
            ...movies
              .map((movie) => this.convertTmdbToContent(movie, 'movie'))
              .filter((movie) => movie !== null) // Filter out null results
              .map((movie) => ({
                ...movie,
                source: 'tmdb',
              })),
          )
        }

        if (contentType === 'all' || contentType === 'tv') {
          const tvShows = await this.getTmdbAnimatedTVShows(1, Math.ceil(limit / 2))
          results.push(
            ...tvShows
              .map((tv) => this.convertTmdbToContent(tv, 'tv'))
              .filter((tv) => tv !== null) // Filter out null results
              .map((tv) => ({
                ...tv,
                source: 'tmdb',
              })),
          )
        }
      } catch (error) {
        console.error('Error getting TMDB popular content:', error.message)
      }
    }

    // Get MAL popular content
    if (includeMal && this.hasMalKey) {
      try {
        const malAnime = await this.getMalTopAnime(Math.ceil(limit / 2))
        results.push(
          ...malAnime
            .map((anime) => this.convertMalToContent(anime))
            .filter((anime) => anime !== null) // Filter out null results
            .map((anime) => ({
              ...anime,
              source: 'mal',
            })),
        )
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
