import axios from 'axios'

// https://developer.themoviedb.org/docs/getting-started

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

      // Strategy 1: Search API with strict post-filtering
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
        // Always include Animation genre (16) to ensure only animated content
        const genreQuery = [16, ...genreIds].join(',')

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

      // Limit results to improve performance (process max 100 results per type)
      const limitedMovies = allMovies.slice(0, 100)
      const limitedTVShows = allTVShows.slice(0, 100)

      // Remove duplicates based on TMDB ID
      const uniqueMovies = limitedMovies.filter(
        (movie, index, self) => index === self.findIndex((m) => m.id === movie.id),
      )

      const uniqueTVShows = limitedTVShows.filter(
        (show, index, self) => index === self.findIndex((s) => s.id === show.id),
      )

      // No filtering needed since database only contains animated content
      const animatedMovies = uniqueMovies
      const animatedShows = uniqueTVShows

      // Add content type indicators and combine results
      const moviesWithType = animatedMovies.map((movie) => ({
        ...movie,
        contentType: 'movie',
        typeIcon: '🎬',
      }))

      const showsWithType = animatedShows.map((show) => ({
        ...show,
        contentType: 'tv',
        typeIcon: '📺',
      }))

      // Combine all results
      const allResults = [...moviesWithType, ...showsWithType]

      return {
        results: allResults,
        totalResults: allResults.length,
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
