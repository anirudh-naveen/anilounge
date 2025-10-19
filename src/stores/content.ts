import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { contentAPI, userAPI } from '@/services/api'
import type { Movie, TVShow, WatchlistItem, RateContentData, Content } from '@/types'

export const useContentStore = defineStore('content', () => {
  const movies = ref<Movie[]>([])
  const tvShows = ref<TVShow[]>([])
  const searchResults = ref({ movies: [] as Movie[], tv: [] as TVShow[] })
  const currentContent = ref<Movie | TVShow | null>(null)
  const watchlist = ref<WatchlistItem[]>([])
  const userRatings = ref<RateContentData[]>([])
  const recommendations = ref<Content[]>([])

  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const pagination = ref({
    page: 1,
    totalPages: 1,
    totalResults: 0,
  })

  const getMovies = async (page = 1) => {
    try {
      isLoading.value = true
      error.value = null

      const response = await contentAPI.getMovies({ page })

      movies.value = response.data.data.movies
      pagination.value = response.data.data.pagination

      return response.data
    } catch (err: unknown) {
      console.error('Error fetching movies:', err)
      error.value = err instanceof Error ? err.message : 'Failed to fetch movies'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const getTVShows = async (page = 1) => {
    try {
      isLoading.value = true
      error.value = null

      const response = await contentAPI.getTVShows({ page })

      tvShows.value = response.data.data.shows
      pagination.value = response.data.data.pagination

      return response.data
    } catch (err: unknown) {
      console.error('Error fetching TV shows:', err)
      error.value = err instanceof Error ? err.message : 'Failed to fetch TV shows'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const searchContent = async (query: string, page = 1) => {
    try {
      isLoading.value = true
      error.value = null

      const response = await contentAPI.searchContent(query, page)

      searchResults.value = {
        movies: response.data.data.movies,
        tv: response.data.data.tv,
      }
      pagination.value = response.data.data.pagination

      return response.data
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : 'Search failed'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const getContentDetails = async (id: string) => {
    try {
      isLoading.value = true
      error.value = null

      const response = await contentAPI.getContentDetails(id)
      currentContent.value = response.data.data.content

      return response.data
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch content details'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const addToWatchlist = async (
    contentId: string,
    status: 'plan_to_watch' | 'watching' | 'completed' | 'dropped' = 'plan_to_watch',
    rating?: number,
    currentEpisode?: number,
    notes?: string,
  ) => {
    try {
      const response = await userAPI.addToWatchlist({
        contentId,
        status,
        rating,
        currentEpisode,
        notes,
      })

      // Update local watchlist with server response
      if (response.data?.data?.watchlist) {
        watchlist.value = response.data.data.watchlist
      } else {
        // Fallback: add to local watchlist
        const watchlistItem: WatchlistItem = {
          content: contentId,
          status,
          rating,
          currentEpisode: currentEpisode || 0,
          notes,
          addedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        watchlist.value.push(watchlistItem)
      }
      return true
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : 'Failed to add to watchlist'
      throw err
    }
  }

  const updateWatchlistItem = async (contentId: string, updates: Partial<WatchlistItem>) => {
    try {
      await userAPI.updateWatchlistItem(contentId, updates)

      // Update local watchlist
      const itemIndex = watchlist.value.findIndex((item) => {
        // Handle both old format (string) and new format (object)
        if (typeof item === 'string') {
          return item === contentId
        }
        return typeof item.content === 'string'
          ? item.content === contentId
          : item.content._id === contentId
      })
      if (itemIndex >= 0) {
        watchlist.value[itemIndex] = {
          ...watchlist.value[itemIndex],
          ...updates,
          updatedAt: new Date().toISOString(),
        } as WatchlistItem
      }
      return true
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : 'Failed to update watchlist item'
      throw err
    }
  }

  const removeFromWatchlist = async (contentId: string) => {
    try {
      await userAPI.removeFromWatchlist(contentId)
      watchlist.value = watchlist.value.filter((item) => {
        // Handle both old format (string) and new format (object)
        if (typeof item === 'string') {
          return item !== contentId
        }
        return typeof item.content === 'string'
          ? item.content !== contentId
          : item.content._id !== contentId
      })
      return true
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : 'Failed to remove from watchlist'
      throw err
    }
  }

  const rateContent = async (contentId: string, rating: number, review = '') => {
    try {
      await userAPI.rateContent({ contentId, rating, review })

      // Update local ratings
      const existingRatingIndex = userRatings.value.findIndex((r) => r.contentId === contentId)

      if (existingRatingIndex >= 0) {
        userRatings.value[existingRatingIndex] = {
          contentId,
          rating,
          review,
        }
      } else {
        userRatings.value.push({
          contentId,
          rating,
          review,
        })
      }

      return true
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : 'Failed to rate content'
      throw err
    }
  }

  const getRecommendations = async () => {
    try {
      isLoading.value = true
      error.value = null

      const response = await userAPI.getRecommendations()
      recommendations.value = response.data.data.recommendations

      return response.data
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : 'Failed to get recommendations'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const isInWatchlist = computed(() => (contentId: string) => {
    return watchlist.value.some((item) => {
      // Handle both old format (string) and new format (object)
      if (typeof item === 'string') {
        return item === contentId
      }
      return typeof item.content === 'string'
        ? item.content === contentId
        : item.content._id === contentId
    })
  })

  const getWatchlistItem = computed(() => (contentId: string) => {
    return watchlist.value.find((item) => {
      // Handle both old format (string) and new format (object)
      if (typeof item === 'string') {
        return item === contentId
      }
      return typeof item.content === 'string'
        ? item.content === contentId
        : item.content._id === contentId
    })
  })

  const getUserRating = computed(() => (contentId: string) => {
    return userRatings.value.find((r) => r.contentId === contentId)
  })

  const loadWatchlist = (watchlistData: WatchlistItem[]) => {
    watchlist.value = [...watchlistData]
  }

  const clearWatchlist = () => {
    watchlist.value = []
  }

  const initializeWatchlist = (watchlistData?: WatchlistItem[]) => {
    // This method should be called with watchlist data from the auth store
    // It's safer than direct assignment and avoids circular dependencies
    try {
      if (watchlistData && Array.isArray(watchlistData)) {
        // Only update if the data is different to prevent unnecessary reactivity triggers
        if (JSON.stringify(watchlist.value) !== JSON.stringify(watchlistData)) {
          loadWatchlist(watchlistData)
        }
      }
    } catch (error) {
      console.error('Error initializing watchlist:', error)
    }
  }

  const clearSearchResults = () => {
    searchResults.value = { movies: [], tv: [] }
  }

  const clearCurrentContent = () => {
    currentContent.value = null
  }

  return {
    movies,
    tvShows,
    searchResults,
    currentContent,
    watchlist,
    userRatings,
    recommendations,
    isLoading,
    error,
    pagination,
    getMovies,
    getTVShows,
    searchContent,
    getContentDetails,
    addToWatchlist,
    updateWatchlistItem,
    removeFromWatchlist,
    rateContent,
    getRecommendations,
    isInWatchlist,
    getWatchlistItem,
    getUserRating,
    loadWatchlist,
    clearWatchlist,
    initializeWatchlist,
    clearSearchResults,
    clearCurrentContent,
  }
})
