import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { contentAPI, watchlistAPI, formatGenres, getContentTypeDisplay } from '@/services/api'
import type { WatchlistItem } from '@/types'
import type { UnifiedContent } from '@/types/content'

export const useContentStore = defineStore('content', () => {
  // Unified content arrays
  const allContent = ref<UnifiedContent[]>([])
  const movies = ref<UnifiedContent[]>([])
  const tvShows = ref<UnifiedContent[]>([])
  const searchResults = ref<UnifiedContent[]>([])
  const currentContent = ref<UnifiedContent | null>(null)
  const watchlist = ref<WatchlistItem[]>([])
  const recommendations = ref<UnifiedContent[]>([])

  // State
  const isLoading = ref(false)
  const moviesLoading = ref(false)
  const tvShowsLoading = ref(false)
  const searchLoading = ref(false)
  const watchlistLoaded = ref(false)
  const error = ref<string | null>(null)
  const pagination = ref({
    currentPage: 1,
    totalPages: 1,
    totalItems: 0,
    itemsPerPage: 20,
    hasNextPage: false,
    hasPrevPage: false,
  })

  // Separate pagination for movies and TV shows
  const moviesPagination = ref({
    currentPage: 1,
    totalPages: 1,
    totalItems: 0,
    itemsPerPage: 20,
    hasNextPage: false,
    hasPrevPage: false,
  })

  const tvShowsPagination = ref({
    currentPage: 1,
    totalPages: 1,
    totalItems: 0,
    itemsPerPage: 20,
    hasNextPage: false,
    hasPrevPage: false,
  })

  // Get all content with pagination and filtering
  const getContent = async (page = 1, contentType?: 'movie' | 'tv' | 'all', limit = 20) => {
    const startTime = Date.now()
    console.log(`🚀 [${new Date().toISOString()}] Frontend getContent called:`, {
      page,
      contentType,
      limit,
    })

    try {
      // Set appropriate loading state
      if (contentType === 'movie') {
        moviesLoading.value = true
        console.log(`🎬 [${new Date().toISOString()}] Setting moviesLoading = true`)
      } else if (contentType === 'tv') {
        tvShowsLoading.value = true
        console.log(`📺 [${new Date().toISOString()}] Setting tvShowsLoading = true`)
      }

      error.value = null

      const params: Record<string, string | number> = { page, limit }
      if (contentType && contentType !== 'all') {
        params.type = contentType
      }

      console.log(`📡 [${new Date().toISOString()}] Making API call with params:`, params)
      const apiStart = Date.now()
      const response = await contentAPI.getContent(params)
      const apiTime = Date.now() - apiStart
      console.log(`📡 [${new Date().toISOString()}] API call completed in ${apiTime}ms`)

      if (response.data.success) {
        const processStart = Date.now()
        allContent.value = response.data.data
        pagination.value = response.data.pagination

        // Update appropriate pagination state based on content type
        if (contentType === 'movie') {
          movies.value = response.data.data
          moviesPagination.value = response.data.pagination
          console.log(
            `🎬 [${new Date().toISOString()}] Updated movies array with ${movies.value.length} items`,
          )
        } else if (contentType === 'tv') {
          tvShows.value = response.data.data
          tvShowsPagination.value = response.data.pagination
          console.log(
            `📺 [${new Date().toISOString()}] Updated tvShows array with ${tvShows.value.length} items`,
          )
        } else {
          // For 'all' content type, separate movies and TV shows efficiently
          const movieItems: UnifiedContent[] = []
          const tvItems: UnifiedContent[] = []

          for (const item of allContent.value) {
            if (item.contentType === 'movie') {
              movieItems.push(item)
            } else if (item.contentType === 'tv') {
              tvItems.push(item)
            }
          }

          movies.value = movieItems
          tvShows.value = tvItems
          console.log(
            `🔄 [${new Date().toISOString()}] Separated content: ${movieItems.length} movies, ${tvItems.length} TV shows`,
          )
        }

        const processTime = Date.now() - processStart
        console.log(`⚡ [${new Date().toISOString()}] Data processing took ${processTime}ms`)
      }

      const totalTime = Date.now() - startTime
      console.log(
        `✅ [${new Date().toISOString()}] Frontend getContent completed in ${totalTime}ms`,
      )

      return response.data
    } catch (err: unknown) {
      const totalTime = Date.now() - startTime
      console.error(
        `❌ [${new Date().toISOString()}] Frontend getContent error after ${totalTime}ms:`,
        err,
      )
      error.value = err instanceof Error ? err.message : 'Failed to fetch content'
      throw err
    } finally {
      // Clear appropriate loading state
      if (contentType === 'movie') {
        moviesLoading.value = false
        console.log(`🎬 [${new Date().toISOString()}] Setting moviesLoading = false`)
      } else if (contentType === 'tv') {
        tvShowsLoading.value = false
        console.log(`📺 [${new Date().toISOString()}] Setting tvShowsLoading = false`)
      }
    }
  }

  // Get popular content
  const getPopularContent = async (contentType?: 'movie' | 'tv' | 'all', limit = 20) => {
    try {
      isLoading.value = true
      error.value = null

      const params: Record<string, string | number> = { limit }
      if (contentType && contentType !== 'all') {
        params.type = contentType
      }

      const response = await contentAPI.getPopularContent(params)

      if (response.data.success) {
        const data = response.data.data

        if (contentType === 'movie') {
          // For movies, set movies array directly
          movies.value = data
          // Update allContent to include these movies
          allContent.value = [
            ...allContent.value.filter((item: UnifiedContent) => item.contentType !== 'movie'),
            ...data,
          ]
        } else if (contentType === 'tv') {
          // For TV shows, set tvShows array directly
          tvShows.value = data
          // Update allContent to include these TV shows
          allContent.value = [
            ...allContent.value.filter((item: UnifiedContent) => item.contentType !== 'tv'),
            ...data,
          ]
        } else {
          // For 'all', set allContent and filter from it
          allContent.value = data
          movies.value = data.filter((item: UnifiedContent) => item.contentType === 'movie')
          tvShows.value = data.filter((item: UnifiedContent) => item.contentType === 'tv')
        }
      }

      return response.data
    } catch (err: unknown) {
      console.error('Error fetching popular content:', err)
      error.value = err instanceof Error ? err.message : 'Failed to fetch popular content'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  // Search content
  const searchContent = async (
    query: string,
    contentType?: 'movie' | 'tv' | 'all',
    page = 1,
    limit = 20,
  ) => {
    try {
      isLoading.value = true
      error.value = null

      const params: Record<string, string | number> = { query, page, limit }
      if (contentType && contentType !== 'all') {
        params.type = contentType
      }

      const response = await contentAPI.searchContent(params)

      if (response.data.success) {
        searchResults.value = response.data.data.content
        pagination.value = response.data.data.pagination
      }

      return response.data
    } catch (err: unknown) {
      console.error('Error searching content:', err)
      error.value = err instanceof Error ? err.message : 'Search failed'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  // Get content details by ID
  const getContentDetails = async (id: string) => {
    try {
      isLoading.value = true
      error.value = null

      const response = await contentAPI.getContentById(id)

      if (response.data.success) {
        currentContent.value = response.data.data as UnifiedContent
      }

      return response.data
    } catch (err: unknown) {
      console.error('Error fetching content details:', err)
      error.value = err instanceof Error ? err.message : 'Failed to fetch content details'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  // Get similar content
  const getSimilarContent = async (id: string, limit = 10) => {
    try {
      const response = await contentAPI.getSimilarContent(id, limit)

      if (response.data.success) {
        recommendations.value = response.data.data
      }

      return response.data
    } catch (err: unknown) {
      console.error('Error fetching similar content:', err)
      error.value = err instanceof Error ? err.message : 'Failed to fetch similar content'
      throw err
    }
  }

  // Watchlist functions
  const addToWatchlist = async (
    contentId: string,
    status: 'plan_to_watch' | 'watching' | 'completed' | 'dropped' = 'plan_to_watch',
    rating?: number,
    currentEpisode?: number,
    notes?: string,
  ) => {
    try {
      console.log('Adding to watchlist:', { contentId, status, rating, currentEpisode, notes }) // Debug log

      const response = await watchlistAPI.addToWatchlist({
        contentId,
        status,
        rating,
        currentEpisode,
        notes,
      })

      console.log('Watchlist API response:', response.data) // Debug log

      if (response.data.success) {
        // Force refresh watchlist
        await loadWatchlist(true)
      }

      return true
    } catch (err: unknown) {
      console.error('Error in addToWatchlist:', err) // Debug log
      error.value = err instanceof Error ? err.message : 'Failed to add to watchlist'
      throw err
    }
  }

  const updateWatchlistItem = async (contentId: string, updates: Partial<WatchlistItem>) => {
    try {
      const response = await watchlistAPI.updateWatchlistItem(contentId, updates)

      if (response.data.success) {
        // Force refresh watchlist
        await loadWatchlist(true)
      }

      return true
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : 'Failed to update watchlist item'
      throw err
    }
  }

  const removeFromWatchlist = async (contentId: string) => {
    try {
      const response = await watchlistAPI.removeFromWatchlist(contentId)

      if (response.data.success) {
        // Force refresh watchlist
        await loadWatchlist(true)
      }

      return true
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : 'Failed to remove from watchlist'
      throw err
    }
  }

  const loadWatchlist = async (forceReload = false) => {
    // Skip if already loaded, unless force reload is requested
    if (watchlistLoaded.value && !forceReload) {
      return
    }

    try {
      const response = await watchlistAPI.getWatchlist()

      if (response.data.success) {
        watchlist.value = response.data.data
        watchlistLoaded.value = true
        console.log(
          `📋 [${new Date().toISOString()}] Watchlist loaded: ${watchlist.value.length} items`,
        )
      }
    } catch (err: unknown) {
      console.error('Error loading watchlist:', err)
      error.value = err instanceof Error ? err.message : 'Failed to load watchlist'
    }
  }

  // Computed properties
  const isInWatchlist = computed(() => (contentId: string) => {
    return watchlist.value.some((item) => {
      if (typeof item.content === 'string') {
        return item.content === contentId
      }
      return item.content?._id === contentId
    })
  })

  const getWatchlistItem = computed(() => (contentId: string) => {
    return watchlist.value.find((item) => {
      if (typeof item.content === 'string') {
        return item.content === contentId
      }
      return item.content?._id === contentId
    })
  })

  // Utility functions
  const getContentDisplayInfo = (content: UnifiedContent) => {
    return {
      id: content._id,
      title: content.title || 'Unknown Title',
      overview: content.overview || '',
      posterPath: content.posterPath,
      backdropPath: content.backdropPath,
      contentType: content.contentType,
      contentTypeDisplay: getContentTypeDisplay(content.contentType),
      releaseDate: content.releaseDate,
      genres: formatGenres(content.genres),
      rating: {
        score: content.unifiedScore || 0,
        count: content.malScoredBy || content.voteCount || 0,
        source: content.malScore ? 'mal' : 'tmdb',
      },
      runtime: content.runtime,
      episodeCount: content.episodeCount || content.malEpisodes,
      seasonCount: content.seasonCount,
      studios: content.studios || content.productionCompanies || [],
      alternativeTitles: content.alternativeTitles || [],
      tmdbId: content.tmdbId,
      malId: content.malId,
      hasTmdbData: content.dataSources?.tmdb?.hasData || false,
      hasMalData: content.dataSources?.mal?.hasData || false,
    }
  }

  // Clear functions
  const clearSearchResults = () => {
    console.log('Clearing search results') // Debug log
    searchResults.value = []
  }

  const clearCurrentContent = () => {
    console.log('Clearing current content') // Debug log
    currentContent.value = null
  }

  const clearAll = () => {
    console.log('Clearing all content') // Debug log
    allContent.value = []
    movies.value = []
    tvShows.value = []
    searchResults.value = []
    currentContent.value = null
    recommendations.value = []
    watchlist.value = []
    watchlistLoaded.value = false
    error.value = null
  }

  return {
    // State
    allContent,
    movies,
    tvShows,
    searchResults,
    currentContent,
    watchlist,
    recommendations,
    isLoading,
    moviesLoading,
    tvShowsLoading,
    searchLoading,
    error,
    pagination,
    moviesPagination,
    tvShowsPagination,

    // Actions
    getContent,
    getPopularContent,
    searchContent,
    getContentDetails,
    getSimilarContent,
    addToWatchlist,
    updateWatchlistItem,
    removeFromWatchlist,
    loadWatchlist,

    // Computed
    isInWatchlist,
    getWatchlistItem,

    // Utilities
    getContentDisplayInfo,

    // Clear functions
    clearSearchResults,
    clearCurrentContent,
    clearAll,
  }
})
