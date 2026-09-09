import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  contentAPI,
  watchlistAPI,
  formatGenres,
  getContentTypeDisplay,
  matchesContentTypeFilter,
} from '@/services/api'
import type { WatchlistItem } from '@/types'
import type { UnifiedContent } from '@/types/content'
import type { SortByOption, SortDirection } from '@/utils/sorting'

export type SearchFilters = {
  type: string
  ratingMin: number
  ratingMax: number
  year: string
  genre: string
  language: string
  sortBy: SortByOption
  sortDirection: SortDirection
}

export const defaultSearchFilters = (): SearchFilters => ({
  type: 'all',
  ratingMin: 1,
  ratingMax: 10,
  year: 'all',
  genre: 'all',
  language: 'all',
  sortBy: 'relevance',
  sortDirection: 'desc',
})

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

  const lastSearchQuery = ref('')
  const searchFilters = ref<SearchFilters>(defaultSearchFilters())
  const searchAppliedFilters = ref<SearchFilters>(defaultSearchFilters())
  const searchPage = ref(1)
  const catalogSize = ref(0)

  // Get all content with pagination and filtering
  const getContent = async (page = 1, contentType?: 'movie' | 'tv' | 'all', limit = 20) => {
    try {
      // Set appropriate loading state
      if (contentType === 'movie') {
        moviesLoading.value = true
      } else if (contentType === 'tv') {
        tvShowsLoading.value = true
      }

      error.value = null

      const params: Record<string, string | number> = { page, limit }
      if (contentType && contentType !== 'all') {
        params.type = contentType
      }

      const response = await contentAPI.getContent(params)

      if (response.data.success) {
        // Only update allContent for 'all' content type to avoid conflicts
        if (contentType === 'all' || !contentType) {
          allContent.value = response.data.data
          pagination.value = response.data.pagination
        }

        // Update appropriate pagination state based on content type
        if (contentType === 'movie') {
          movies.value = response.data.data
          moviesPagination.value = response.data.pagination
        } else if (contentType === 'tv') {
          tvShows.value = response.data.data
          tvShowsPagination.value = response.data.pagination
        } else if (contentType === 'all' || !contentType) {
          const movieItems: UnifiedContent[] = []
          const tvItems: UnifiedContent[] = []

          for (const item of response.data.data) {
            if (item.contentType === 'tv') {
              tvItems.push(item)
            } else {
              movieItems.push(item)
            }
          }

          movies.value = movieItems
          tvShows.value = tvItems
        }
      }

      return response.data
    } catch (err: unknown) {
      console.error('Error fetching content:', err)
      error.value = err instanceof Error ? err.message : 'Failed to fetch content'
      throw err
    } finally {
      if (contentType === 'movie') {
        moviesLoading.value = false
      } else if (contentType === 'tv') {
        tvShowsLoading.value = false
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
          movies.value = data
          allContent.value = [
            ...allContent.value.filter((item: UnifiedContent) => item.contentType === 'tv'),
            ...data,
          ]
        } else if (contentType === 'tv') {
          tvShows.value = data
          allContent.value = [
            ...allContent.value.filter((item: UnifiedContent) => item.contentType !== 'tv'),
            ...data,
          ]
        } else {
          allContent.value = data
          const movieList: UnifiedContent[] = []
          const tvList: UnifiedContent[] = []

          data.forEach((item: UnifiedContent) => {
            if (item.contentType === 'tv') {
              tvList.push(item)
            } else {
              movieList.push(item)
            }
          })

          movies.value = movieList
          tvShows.value = tvList
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

  const ensureFullCatalog = async () => {
    if (catalogSize.value > 0 && allContent.value.length >= catalogSize.value) return

    const response = await contentAPI.getContent({ page: 1, limit: 10000 })
    if (response.data.success) {
      allContent.value = response.data.data
      catalogSize.value = response.data.pagination?.totalItems ?? response.data.data.length
    }
  }

  // Search content
  const searchContent = async (
    query: string,
    contentType?: 'movie' | 'tv' | 'all',
    page = 1,
    limit?: number,
  ) => {
    try {
      isLoading.value = true
      error.value = null
      lastSearchQuery.value = query

      await ensureFullCatalog()

      // Search through local database instead of API call
      let filteredResults = allContent.value

      if (contentType && contentType !== 'all') {
        filteredResults = filteredResults.filter((item) =>
          matchesContentTypeFilter(item.contentType, contentType),
        )
      }

      // Enhanced search with better title and genre matching
      const searchTerm = query.toLowerCase().trim()
      if (searchTerm) {
        // Normalize search term for better matching (remove special chars, extra spaces)
        const normalizedSearchTerm = searchTerm
          .replace(/[^\w\s]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
        const searchWords = normalizedSearchTerm.split(' ')

        filteredResults = filteredResults.filter((item) => {
          const title = item.title?.toLowerCase() || ''
          const originalTitle = item.originalTitle?.toLowerCase() || ''
          const alternativeTitles = (item.alternativeTitles || [])
            .map((t) => t.toLowerCase())
            .join(' ')
          const genres = (item.genres || [])
            .map((g) => (typeof g === 'string' ? g : g.name || ''))
            .join(' ')
            .toLowerCase()
          const overview = item.overview?.toLowerCase() || ''
          const studios = (item.studios || []).join(' ').toLowerCase()

          // Normalize titles for comparison
          const normalizedTitle = title
            .replace(/[^\w\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
          const normalizedOriginalTitle = originalTitle
            .replace(/[^\w\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()

          // Check if search term appears anywhere
          const directMatch =
            title.includes(searchTerm) ||
            originalTitle.includes(searchTerm) ||
            alternativeTitles.includes(searchTerm) ||
            genres.includes(searchTerm) ||
            overview.includes(searchTerm) ||
            studios.includes(searchTerm)

          // Check if all search words appear in normalized title (for "spider man" matching "Spider-Man")
          const allWordsInTitle = searchWords.every(
            (word) => normalizedTitle.includes(word) || normalizedOriginalTitle.includes(word),
          )

          return directMatch || allWordsInTitle
        })
      }

      // Enhanced sorting by relevance with multiple tiers
      if (searchTerm) {
        filteredResults.sort((a, b) => {
          const aTitle = a.title?.toLowerCase() || ''
          const bTitle = b.title?.toLowerCase() || ''
          const aOriginalTitle = a.originalTitle?.toLowerCase() || ''
          const bOriginalTitle = b.originalTitle?.toLowerCase() || ''
          const aAlternativeTitles = (a.alternativeTitles || [])
            .map((t) => t.toLowerCase())
            .join(' ')
          const bAlternativeTitles = (b.alternativeTitles || [])
            .map((t) => t.toLowerCase())
            .join(' ')
          const aGenres = (a.genres || [])
            .map((g) => (typeof g === 'string' ? g : g.name || ''))
            .join(' ')
            .toLowerCase()
          const bGenres = (b.genres || [])
            .map((g) => (typeof g === 'string' ? g : g.name || ''))
            .join(' ')
            .toLowerCase()

          // Priority 1: Exact title match
          const aExactTitle = aTitle === searchTerm
          const bExactTitle = bTitle === searchTerm
          if (aExactTitle && !bExactTitle) return -1
          if (!aExactTitle && bExactTitle) return 1

          // Priority 2: Title starts with search term
          const aTitleStarts = aTitle.startsWith(searchTerm)
          const bTitleStarts = bTitle.startsWith(searchTerm)
          if (aTitleStarts && !bTitleStarts) return -1
          if (!aTitleStarts && bTitleStarts) return 1

          // Priority 3: Title contains search term
          const aTitleContains = aTitle.includes(searchTerm)
          const bTitleContains = bTitle.includes(searchTerm)
          if (aTitleContains && !bTitleContains) return -1
          if (!aTitleContains && bTitleContains) return 1

          // Priority 4: Original title or alternative titles contain search term
          const aOtherTitles =
            aOriginalTitle.includes(searchTerm) || aAlternativeTitles.includes(searchTerm)
          const bOtherTitles =
            bOriginalTitle.includes(searchTerm) || bAlternativeTitles.includes(searchTerm)
          if (aOtherTitles && !bOtherTitles) return -1
          if (!aOtherTitles && bOtherTitles) return 1

          // Priority 5: Genre exact match
          const aGenreMatch = aGenres.split(' ').some((genre) => genre.toLowerCase() === searchTerm)
          const bGenreMatch = bGenres.split(' ').some((genre) => genre.toLowerCase() === searchTerm)
          if (aGenreMatch && !bGenreMatch) return -1
          if (!aGenreMatch && bGenreMatch) return 1

          // Priority 6: Genre contains search term
          const aGenreContains = aGenres.includes(searchTerm)
          const bGenreContains = bGenres.includes(searchTerm)
          if (aGenreContains && !bGenreContains) return -1
          if (!aGenreContains && bGenreContains) return 1

          // Final: Sort by unified score
          return (b.unifiedScore || 0) - (a.unifiedScore || 0)
        })
      } else {
        // If no search term, just sort by unified score
        filteredResults.sort((a, b) => (b.unifiedScore || 0) - (a.unifiedScore || 0))
      }

      const totalItems = filteredResults.length
      const pageSize = limit && limit > 0 ? limit : totalItems
      const startIndex = limit && limit > 0 ? (page - 1) * limit : 0
      const pagedResults =
        limit && limit > 0 ? filteredResults.slice(startIndex, startIndex + limit) : filteredResults

      searchResults.value = pagedResults
      pagination.value = {
        currentPage: page,
        totalPages: pageSize > 0 ? Math.ceil(totalItems / pageSize) : 1,
        totalItems,
        itemsPerPage: pageSize || totalItems,
        hasNextPage: Boolean(limit && limit > 0 && page * limit < totalItems),
        hasPrevPage: page > 1,
      }

      return {
        success: true,
        data: {
          content: pagedResults,
          pagination: pagination.value,
        },
      }
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
    currentSeason?: number,
    notes?: string,
  ) => {
    try {
      const response = await watchlistAPI.addToWatchlist({
        contentId,
        status,
        rating,
        currentEpisode,
        currentSeason,
        notes,
      })

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
        // Update the specific item in the watchlist array instead of reloading everything
        const itemIndex = watchlist.value.findIndex((item) => {
          if (typeof item.content === 'string') {
            return item.content === contentId
          }
          return item.content?._id === contentId
        })

        if (itemIndex !== -1) {
          // Update the specific item with the new data
          const existingItem = watchlist.value[itemIndex]
          watchlist.value[itemIndex] = { ...existingItem, ...updates } as WatchlistItem
        }
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
        count:
          (content.malScoredBy || 0) + (content.voteCount || 0) + (content.userRatingCount || 0),
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

  // Scroll position management
  const savedScrollPositions = ref<Record<string, number>>({})

  const saveScrollPosition = (key: string) => {
    savedScrollPositions.value[key] = window.scrollY
  }

  const restoreScrollPosition = (key: string) => {
    const savedPosition = savedScrollPositions.value[key]
    if (savedPosition !== undefined) {
      window.scrollTo(0, savedPosition)
      return true
    }
    return false
  }

  const clearScrollPosition = (key: string) => {
    delete savedScrollPositions.value[key]
  }

  const clearAllScrollPositions = () => {
    savedScrollPositions.value = {}
  }

  const scrollToTop = () => {
    window.scrollTo(0, 0)
  }

  // Clear functions
  const clearSearchResults = () => {
    searchResults.value = []
    lastSearchQuery.value = ''
    searchFilters.value = defaultSearchFilters()
    searchAppliedFilters.value = defaultSearchFilters()
    searchPage.value = 1
  }

  const clearCurrentContent = () => {
    currentContent.value = null
  }

  const clearAll = () => {
    allContent.value = []
    movies.value = []
    tvShows.value = []
    searchResults.value = []
    currentContent.value = null
    recommendations.value = []
    watchlist.value = []
    watchlistLoaded.value = false
    lastSearchQuery.value = ''
    searchFilters.value = defaultSearchFilters()
    searchAppliedFilters.value = defaultSearchFilters()
    searchPage.value = 1
    catalogSize.value = 0
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
    lastSearchQuery,
    searchFilters,
    searchAppliedFilters,
    searchPage,

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

    // Scroll position management
    saveScrollPosition,
    restoreScrollPosition,
    clearScrollPosition,
    clearAllScrollPositions,
    scrollToTop,

    // Clear functions
    clearSearchResults,
    clearCurrentContent,
    clearAll,
  }
})
