import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { contentAPI, userAPI } from '@/services/api'

export const useContentStore = defineStore('content', () => {
  const movies = ref([])
  const tvShows = ref([])
  const searchResults = ref({ movies: [], tv: [] })
  const currentContent = ref(null)
  const watchlist = ref([])
  const userRatings = ref([])
  const recommendations = ref([])

  const isLoading = ref(false)
  const error = ref(null)
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
    } catch (err) {
      error.value = err.response?.data?.message || 'Failed to fetch movies'
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
    } catch (err) {
      error.value = err.response?.data?.message || 'Failed to fetch TV shows'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const searchContent = async (query, page = 1) => {
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
    } catch (err) {
      error.value = err.response?.data?.message || 'Search failed'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const getContentDetails = async (id) => {
    try {
      isLoading.value = true
      error.value = null

      const response = await contentAPI.getContentDetails(id)
      currentContent.value = response.data.data.content

      return response.data
    } catch (err) {
      error.value = err.response?.data?.message || 'Failed to fetch content details'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const addToWatchlist = async (contentId) => {
    try {
      await userAPI.addToWatchlist(contentId)
      watchlist.value.push(contentId)
      return true
    } catch (err) {
      error.value = err.response?.data?.message || 'Failed to add to watchlist'
      throw err
    }
  }

  const removeFromWatchlist = async (contentId) => {
    try {
      await userAPI.removeFromWatchlist(contentId)
      watchlist.value = watchlist.value.filter((id) => id !== contentId)
      return true
    } catch (err) {
      error.value = err.response?.data?.message || 'Failed to remove from watchlist'
      throw err
    }
  }

  const rateContent = async (contentId, rating, review = '') => {
    try {
      await userAPI.rateContent({ contentId, rating, review })

      // Update local ratings
      const existingRatingIndex = userRatings.value.findIndex((r) => r.content === contentId)

      if (existingRatingIndex >= 0) {
        userRatings.value[existingRatingIndex] = {
          content: contentId,
          rating,
          review,
          watchedAt: new Date(),
        }
      } else {
        userRatings.value.push({
          content: contentId,
          rating,
          review,
          watchedAt: new Date(),
        })
      }

      return true
    } catch (err) {
      error.value = err.response?.data?.message || 'Failed to rate content'
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
    } catch (err) {
      error.value = err.response?.data?.message || 'Failed to get recommendations'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const isInWatchlist = computed(() => (contentId) => {
    return watchlist.value.includes(contentId)
  })

  const getUserRating = computed(() => (contentId) => {
    return userRatings.value.find((r) => r.content === contentId)
  })

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
    removeFromWatchlist,
    rateContent,
    getRecommendations,
    isInWatchlist,
    getUserRating,
    clearSearchResults,
    clearCurrentContent,
  }
})
