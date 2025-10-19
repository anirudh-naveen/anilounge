import axios from 'axios'

const TMDB_BASE_URL = 'https://api.themoviedb.org/3'
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p'

class TMDBService {
  constructor() {
    this.apiKey = process.env.TMDB_API_KEY
    this.client = axios.create({
      baseURL: TMDB_BASE_URL,
      params: {
        api_key: this.apiKey,
        language: 'en-US',
      },
    })
  }

  // Helper method to determine if content is animated
  isAnimatedContent(content) {
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
    ]

    const contentText = [content.title, content.original_title, content.overview, content.tagline]
      .join(' ')
      .toLowerCase()

    return animationKeywords.some((keyword) => contentText.includes(keyword))
  }

  // Get animated movies
  async getAnimatedMovies(page = 1) {
    try {
      const response = await this.client.get('/discover/movie', {
        params: {
          page,
          with_genres: '16', // Animation genre ID
          sort_by: 'popularity.desc',
          include_adult: false,
        },
      })

      return response.data
    } catch (error) {
      console.error('Error fetching animated movies:', error)
      throw error
    }
  }

  // Get animated TV shows
  async getAnimatedTVShows(page = 1) {
    try {
      const response = await this.client.get('/discover/tv', {
        params: {
          page,
          with_genres: '16', // Animation genre ID
          sort_by: 'popularity.desc',
          include_adult: false,
        },
      })

      return response.data
    } catch (error) {
      console.error('Error fetching animated TV shows:', error)
      throw error
    }
  }

  // Enhanced search with multiple strategies
  async searchAnimatedContent(query, page = 1) {
    try {
      const queryLower = query.toLowerCase()

      // Strategy 1: Direct text search (most comprehensive)
      const [moviesSearchResponse, tvSearchResponse] = await Promise.all([
        this.client.get('/search/movie', {
          params: {
            query,
            page,
            include_adult: false,
          },
        }),
        this.client.get('/search/tv', {
          params: {
            query,
            page,
            include_adult: false,
          },
        }),
      ])

      // Strategy 2: Genre-based search if query contains genre keywords
      const genreKeywords = {
        action: 28,
        adventure: 12,
        comedy: 35,
        drama: 18,
        family: 10751,
        fantasy: 14,
        horror: 27,
        romance: 10749,
        thriller: 53,
        'sci-fi': 878,
        'science fiction': 878,
        anime: 16, // Animation genre
      }

      let genreResults = { movies: { results: [] }, tv: { results: [] } }

      // Check if query contains genre keywords
      const matchedGenres = Object.keys(genreKeywords).filter((keyword) =>
        queryLower.includes(keyword),
      )

      if (matchedGenres.length > 0) {
        const genreIds = matchedGenres.map((keyword) => genreKeywords[keyword])
        const genreQuery = genreIds.join(',')

        const [moviesGenreResponse, tvGenreResponse] = await Promise.all([
          this.client.get('/discover/movie', {
            params: {
              page,
              with_genres: genreQuery,
              sort_by: 'popularity.desc',
              include_adult: false,
            },
          }),
          this.client.get('/discover/tv', {
            params: {
              page,
              with_genres: genreQuery,
              sort_by: 'popularity.desc',
              include_adult: false,
            },
          }),
        ])

        genreResults = {
          movies: moviesGenreResponse.data,
          tv: tvGenreResponse.data,
        }
      }

      // Combine results from both strategies
      const allMovies = [...moviesSearchResponse.data.results, ...genreResults.movies.results]

      const allTVShows = [...tvSearchResponse.data.results, ...genreResults.tv.results]

      // Remove duplicates based on TMDB ID
      const uniqueMovies = allMovies.filter(
        (movie, index, self) => index === self.findIndex((m) => m.id === movie.id),
      )

      const uniqueTVShows = allTVShows.filter(
        (show, index, self) => index === self.findIndex((s) => s.id === show.id),
      )

      // Filter for animated content with anime-specific logic
      const isAnimeQuery = queryLower.includes('anime') || queryLower.includes('japanese')

      const animatedMovies = uniqueMovies.filter((movie) => {
        const hasAnimationGenre = movie.genre_ids && movie.genre_ids.includes(16)
        const hasAnimationKeywords = this.isAnimatedContent(movie)
        const isAnimeRelated = this.isAnimeRelated(movie, queryLower)

        // If searching for anime specifically, be more strict about Japanese content
        if (isAnimeQuery) {
          const isJapanese = this.isJapaneseContent(movie)
          const hasStrongIndicators = this.hasStrongAnimeIndicators(movie)

          // For anime searches, require Japanese content OR strong anime indicators
          if (hasAnimationGenre || hasAnimationKeywords) {
            return isJapanese || hasStrongIndicators
          }
        }

        return hasAnimationGenre || hasAnimationKeywords || isAnimeRelated
      })

      const animatedShows = uniqueTVShows.filter((show) => {
        const hasAnimationGenre = show.genre_ids && show.genre_ids.includes(16)
        const hasAnimationKeywords = this.isAnimatedContent(show)
        const isAnimeRelated = this.isAnimeRelated(show, queryLower)

        // If searching for anime specifically, be more strict about Japanese content
        if (isAnimeQuery) {
          const isJapanese = this.isJapaneseContent(show)
          const hasStrongIndicators = this.hasStrongAnimeIndicators(show)

          // For anime searches, require Japanese content OR strong anime indicators
          if (hasAnimationGenre || hasAnimationKeywords) {
            return isJapanese || hasStrongIndicators
          }
        }

        return hasAnimationGenre || hasAnimationKeywords || isAnimeRelated
      })

      return {
        movies: {
          ...moviesSearchResponse.data,
          results: animatedMovies,
        },
        tv: {
          ...tvSearchResponse.data,
          results: animatedShows,
        },
      }
    } catch (error) {
      console.error('Error searching animated content:', error)
      throw error
    }
  }

  // Check if content is anime-related
  isAnimeRelated(content, query) {
    const animeKeywords = [
      'anime',
      'manga',
      'japanese',
      'tokyo',
      'shounen',
      'shoujo',
      'seinen',
      'josei',
      'studio ghibli',
      'ghibli',
      'miyazaki',
      'hayao',
      'aot',
      'attack on titan',
      'naruto',
      'one piece',
      'dragon ball',
      'pokemon',
      'digimon',
      'sailor moon',
      'evangelion',
      'ghost in the shell',
      'akira',
      'spirited away',
      'totoro',
      'demon slayer',
      'kimetsu',
      'my hero academia',
      'boku no hero',
      'jujutsu kaisen',
      'spy x family',
      'chainsaw man',
      'tokyo ghoul',
      'death note',
      'fullmetal alchemist',
    ]

    const contentText = [
      content.title,
      content.original_title || content.original_name,
      content.overview,
      content.tagline,
    ]
      .join(' ')
      .toLowerCase()

    return animeKeywords.some((keyword) => contentText.includes(keyword) || query.includes(keyword))
  }

  // Check if content is Japanese/anime
  isJapaneseContent(content) {
    // Check original language
    if (content.original_language === 'ja') {
      return true
    }

    // Check production countries
    if (content.production_countries) {
      const japaneseCountries = content.production_countries.some(
        (country) => country.iso_3166_1 === 'JP' || country.name === 'Japan',
      )
      if (japaneseCountries) return true
    }

    // Check original title for Japanese characters
    const originalTitle = content.original_title || content.original_name || ''
    const hasJapaneseChars = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(originalTitle)
    if (hasJapaneseChars) return true

    // Check title for known Japanese anime keywords (more comprehensive)
    const title = content.title || content.name || ''
    const titleLower = title.toLowerCase()

    // Strong indicators of Japanese anime
    const strongJapaneseIndicators = [
      'naruto',
      'one piece',
      'dragon ball',
      'pokemon',
      'digimon',
      'sailor moon',
      'evangelion',
      'akira',
      'spirited away',
      'totoro',
      'demon slayer',
      'kimetsu',
      'my hero academia',
      'boku no hero',
      'jujutsu kaisen',
      'spy x family',
      'chainsaw man',
      'tokyo ghoul',
      'death note',
      'fullmetal alchemist',
      'attack on titan',
      'studio ghibli',
      'ghibli',
      'miyazaki',
      'hayao',
      'shounen',
      'shoujo',
      'seinen',
      'josei',
      'isekai',
      'mob psycho',
      'one punch man',
      'hunter x hunter',
      'bleach',
      'fairy tail',
      'sword art online',
      're:zero',
      'konosuba',
      'overlord',
      'that time i got reincarnated as a slime',
    ]

    // Check for strong indicators first
    if (strongJapaneseIndicators.some((keyword) => titleLower.includes(keyword))) {
      return true
    }

    // Check for generic anime terms but exclude obvious English content
    const genericAnimeTerms = ['anime', 'manga', 'tokyo', 'japan', 'japanese']
    const englishExclusions = [
      'american',
      'usa',
      'united states',
      'disney',
      'pixar',
      'dreamworks',
      'warner bros',
      'universal',
      'paramount',
      'sony pictures',
      'family guy',
      'simpsons',
      'south park',
      'rick and morty',
      'bojack horseman',
      'archer',
      'futurama',
      'king of the hill',
      'awards',
      'sanctuaries',
      'documentary',
      'netflix',
      'hulu',
      'amazon',
      'hbo',
      'cartoon network',
      'adult swim',
      'nickelodeon',
      'disney channel',
      'supremacy',
      'rapeman',
      'mario brothers',
      'amada',
    ]

    const hasGenericAnime = genericAnimeTerms.some((keyword) => titleLower.includes(keyword))
    const hasEnglishExclusion = englishExclusions.some((keyword) => titleLower.includes(keyword))

    // For generic "anime" searches, be very strict - only allow if it's clearly Japanese
    if (titleLower.includes('anime')) {
      // Must have Japanese characters or be a known Japanese title
      return (
        hasJapaneseChars || strongJapaneseIndicators.some((keyword) => titleLower.includes(keyword))
      )
    }

    return hasGenericAnime && !hasEnglishExclusion
  }

  // Check if content has strong anime indicators (more lenient)
  hasStrongAnimeIndicators(content) {
    const title = content.title || content.name || ''
    const titleLower = title.toLowerCase()

    // Check for any anime-related terms in title
    const animeTerms = [
      'anime',
      'manga',
      'tokyo',
      'japan',
      'japanese',
      'shounen',
      'shoujo',
      'seinen',
      'josei',
      'studio ghibli',
      'ghibli',
      'miyazaki',
      'naruto',
      'one piece',
      'dragon ball',
      'pokemon',
      'sailor moon',
      'evangelion',
      'akira',
      'spirited away',
      'totoro',
      'demon slayer',
      'kimetsu',
      'my hero academia',
      'jujutsu kaisen',
      'spy x family',
      'chainsaw man',
      'tokyo ghoul',
      'death note',
      'fullmetal alchemist',
      'attack on titan',
      'isekai',
      'mob psycho',
      'one punch man',
      'hunter x hunter',
      'bleach',
      'fairy tail',
      'sword art online',
      're:zero',
      'konosuba',
      'overlord',
      'that time i got reincarnated as a slime',
    ]

    return animeTerms.some((term) => titleLower.includes(term))
  }

  // Check if query contains genre keywords
  hasGenreKeywords(query) {
    const genreKeywords = [
      'action',
      'adventure',
      'comedy',
      'drama',
      'family',
      'fantasy',
      'horror',
      'romance',
      'sci-fi',
      'science fiction',
      'thriller',
    ]

    return genreKeywords.some((keyword) => query.includes(keyword))
  }

  // Get content details
  async getContentDetails(contentType, tmdbId) {
    try {
      const endpoint = contentType === 'movie' ? `/movie/${tmdbId}` : `/tv/${tmdbId}`
      const response = await this.client.get(endpoint)
      return response.data
    } catch (error) {
      console.error(`Error fetching ${contentType} details:`, error)
      throw error
    }
  }

  // Get image URL
  getImageUrl(path, size = 'w500') {
    if (!path) return null
    return `${TMDB_IMAGE_BASE_URL}/${size}${path}`
  }

  // Get poster URL
  getPosterUrl(path) {
    return this.getImageUrl(path, 'w500')
  }

  // Get backdrop URL
  getBackdropUrl(path) {
    return this.getImageUrl(path, 'w1280')
  }
}

export default new TMDBService()
