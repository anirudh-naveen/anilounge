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

      // Since we're already filtering by Animation genre, we don't need additional filtering
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

      // Since we're already filtering by Animation genre, we don't need additional filtering
      return response.data
    } catch (error) {
      console.error('Error fetching animated TV shows:', error)
      throw error
    }
  }

  // Search for animated content
  async searchAnimatedContent(query, page = 1) {
    try {
      const [moviesResponse, tvResponse] = await Promise.all([
        this.client.get('/search/movie', {
          params: { query, page },
        }),
        this.client.get('/search/tv', {
          params: { query, page },
        }),
      ])

      // For search, we'll be more lenient and include content that might be animated
      // We'll filter for Animation genre or content that contains animation keywords
      const animatedMovies = moviesResponse.data.results.filter((movie) => {
        const hasAnimationGenre = movie.genre_ids && movie.genre_ids.includes(16)
        const hasAnimationKeywords = this.isAnimatedContent(movie)
        return hasAnimationGenre || hasAnimationKeywords
      })

      const animatedShows = tvResponse.data.results.filter((show) => {
        const hasAnimationGenre = show.genre_ids && show.genre_ids.includes(16)
        const hasAnimationKeywords = this.isAnimatedContent(show)
        return hasAnimationGenre || hasAnimationKeywords
      })

      return {
        movies: {
          ...moviesResponse.data,
          results: animatedMovies,
        },
        tv: {
          ...tvResponse.data,
          results: animatedShows,
        },
      }
    } catch (error) {
      console.error('Error searching animated content:', error)
      throw error
    }
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
