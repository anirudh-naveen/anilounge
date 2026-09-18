/**
 * content.ts — Pinia content store.
 *
 * Owns catalog lists, client-side search, watchlist, and detail cache used by
 * Home, Movies, TV, Search, and detail views.
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  contentAPI,
  entityAPI,
  watchlistAPI,
  formatGenres,
  getContentTypeDisplay,
  matchesContentTypeFilter,
} from '@/services/api'
import type { WatchlistItem } from '@/types'
import type { UnifiedContent } from '@/types/content'
import type { SortByOption, SortDirection } from '@/utils/sorting'
import { getDisplayTitle, getSearchableTitles } from '@/utils/titles'
import type { MovieCatalogTab, TvCatalogTab } from '@/utils/catalogTabs'

export type SearchFilters = {
  type: string
  ratingMin: number
  ratingMax: number
  year: string
  season: string
  status: string
  genre: string
  language: string
  country: string
  sortBy: SortByOption
  sortDirection: SortDirection
}

/**
 * Default Search view filters (all types, 1–10 rating, any year/season/status/country, relevance descending).
 * @returns A fresh filter object (not shared across callers).
 */
export const defaultSearchFilters = (): SearchFilters => ({
  type: 'all',
  ratingMin: 1,
  ratingMax: 10,
  year: 'all',
  season: 'all',
  status: 'all',
  genre: 'all',
  language: 'all',
  country: 'all',
  sortBy: 'relevance',
  sortDirection: 'desc',
})

/**
 * Whether any Search filter differs from `defaultSearchFilters()` (including sort).
 * Browse type is the Movies/Series toggle, so it is not treated as a filter.
 * @param filters - Current Search filter values.
 * @returns True when at least one filter is not at its default.
 */
export const hasActiveSearchFilters = (filters: SearchFilters): boolean => {
  const defaults = defaultSearchFilters()
  return (
    filters.ratingMin !== defaults.ratingMin ||
    filters.ratingMax !== defaults.ratingMax ||
    filters.year !== defaults.year ||
    filters.season !== defaults.season ||
    filters.status !== defaults.status ||
    filters.genre !== defaults.genre ||
    filters.language !== defaults.language ||
    filters.country !== defaults.country ||
    filters.sortBy !== defaults.sortBy ||
    filters.sortDirection !== defaults.sortDirection
  )
}

export const useContentStore = defineStore('content', () => {
  const allContent = ref<UnifiedContent[]>([])
  const movies = ref<UnifiedContent[]>([])
  const tvShows = ref<UnifiedContent[]>([])
  const searchResults = ref<UnifiedContent[]>([])
  const currentContent = ref<UnifiedContent | null>(null)
  const watchlist = ref<WatchlistItem[]>([])
  const recommendations = ref<UnifiedContent[]>([])

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

  const movieRails = ref({
    popular: [] as UnifiedContent[],
    theatres: [] as UnifiedContent[],
    upcoming: [] as UnifiedContent[],
  })
  const tvRails = ref({
    popular: [] as UnifiedContent[],
    airing: [] as UnifiedContent[],
    upcoming: [] as UnifiedContent[],
  })
  const movieRailsLoading = ref(false)
  const tvRailsLoading = ref(false)
  const movieRailsLoaded = ref(false)
  const tvRailsLoaded = ref(false)

  const lastSearchQuery = ref('')
  const searchFilters = ref<SearchFilters>(defaultSearchFilters())
  const searchAppliedFilters = ref<SearchFilters>(defaultSearchFilters())
  const searchPage = ref(1)
  const catalogSize = ref(0)

  /**
   * Fetches a catalog page into the matching list and pagination refs.
   * Movie/TV fetches leave `allContent` unchanged so mixed Home pages are not overwritten.
   * @param page - 1-based page index.
   * @param contentType - Which list to update (`movie`, `tv`, or `all`).
   * @param limit - Page size.
   * @param tab - Catalog tab (`popular`, `airing`, `theatres`, `upcoming`); ignored for mixed lists.
   * @returns The API payload (`success`, `data`, `pagination`).
   */
  const getContent = async (
    page = 1,
    contentType?: 'movie' | 'tv' | 'all',
    limit = 20,
    tab?: MovieCatalogTab | TvCatalogTab,
  ) => {
    try {
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
      if ((contentType === 'tv' || contentType === 'movie') && tab && tab !== 'popular') {
        params.tab = tab
      }

      const response = await contentAPI.getContent(params)

      if (response.data.success) {
        if (contentType === 'all' || !contentType) {
          allContent.value = response.data.data
          pagination.value = response.data.pagination
        }

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

  const RAIL_LIMIT = 16

  const fetchCatalogList = async (
    contentType: 'movie' | 'tv',
    tab?: MovieCatalogTab | TvCatalogTab,
  ) => {
    const params: Record<string, string | number> = {
      page: 1,
      limit: RAIL_LIMIT,
      type: contentType,
    }
    if (tab && tab !== 'popular') params.tab = tab
    const response = await contentAPI.getContent(params)
    return response.data.success ? (response.data.data as UnifiedContent[]) : []
  }

  /**
   * Loads the three Search browse rails for movies or series without overwriting
   * the paginated Movies/TV catalog lists.
   * @param contentType - Which rails to fill (`movie` or `tv`).
   * @param force - When true, refetch even if that type is already cached.
   */
  const loadCatalogRails = async (contentType: 'movie' | 'tv', force = false) => {
    if (contentType === 'movie') {
      if (movieRailsLoaded.value && !force) return
      movieRailsLoading.value = true
      try {
        const [popular, theatres, upcoming] = await Promise.all([
          fetchCatalogList('movie'),
          fetchCatalogList('movie', 'theatres'),
          fetchCatalogList('movie', 'upcoming'),
        ])
        movieRails.value = { popular, theatres, upcoming }
        movieRailsLoaded.value = true
      } finally {
        movieRailsLoading.value = false
      }
      return
    }

    if (tvRailsLoaded.value && !force) return
    tvRailsLoading.value = true
    try {
      const [popular, airing, upcoming] = await Promise.all([
        fetchCatalogList('tv'),
        fetchCatalogList('tv', 'airing'),
        fetchCatalogList('tv', 'upcoming'),
      ])
      tvRails.value = { popular, airing, upcoming }
      tvRailsLoaded.value = true
    } finally {
      tvRailsLoading.value = false
    }
  }

  /**
   * Loads popular items and merges them into `allContent` without dropping the other type.
   * @param contentType - Which popular list to fetch (`movie`, `tv`, or `all`).
   * @param limit - Max items.
   * @returns The popular-content API payload.
   */
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

  // Pull the full catalog once so search can run locally instead of hitting /search.
  const ensureFullCatalog = async () => {
    if (catalogSize.value > 0 && allContent.value.length >= catalogSize.value) return

    const response = await contentAPI.getContent({ page: 1, limit: 10000 })
    if (response.data.success) {
      allContent.value = response.data.data
      catalogSize.value = response.data.pagination?.totalItems ?? response.data.data.length
    }
  }

  /**
   * Filters and ranks `allContent` locally (after ensuring the catalog is loaded).
   * Punctuation is stripped so queries like "spider man" match "Spider-Man".
   * @param query - Free-text search string.
   * @param contentType - Optional type filter (`movie`, `tv`, or `all`).
   * @param page - 1-based page when `limit` is set.
   * @param limit - Optional page size; omit to return every match.
   * @returns `{ success, data: { content, pagination } }`.
   */
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

      let filteredResults = allContent.value

      if (contentType && contentType !== 'all') {
        filteredResults = filteredResults.filter((item) =>
          matchesContentTypeFilter(item.contentType, contentType),
        )
      }

      const searchTerm = query.toLowerCase().trim()
      if (searchTerm) {
        const normalizedSearchTerm = searchTerm
          .replace(/[^\w\s]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
        const searchWords = normalizedSearchTerm.split(' ')

        filteredResults = filteredResults.filter((item) => {
          const titles = getSearchableTitles(item).map((title) => title.toLowerCase())
          const normalizedTitles = titles.map((title) =>
            title
              .replace(/[^\w\s]/g, ' ')
              .replace(/\s+/g, ' ')
              .trim(),
          )
          const genres = (item.genres || [])
            .map((g) => (typeof g === 'string' ? g : g.name || ''))
            .join(' ')
            .toLowerCase()
          const overview = item.overview?.toLowerCase() || ''
          const studios = (item.studios || []).join(' ').toLowerCase()

          const directMatch =
            titles.some((title) => title.includes(searchTerm)) ||
            genres.includes(searchTerm) ||
            overview.includes(searchTerm) ||
            studios.includes(searchTerm)

          const allWordsInTitle = searchWords.every((word) =>
            normalizedTitles.some((title) => title.includes(word)),
          )

          return directMatch || allWordsInTitle
        })
      }

      if (searchTerm) {
        filteredResults.sort((a, b) => {
          const aTitles = getSearchableTitles(a).map((title) => title.toLowerCase())
          const bTitles = getSearchableTitles(b).map((title) => title.toLowerCase())
          const aGenres = (a.genres || [])
            .map((g) => (typeof g === 'string' ? g : g.name || ''))
            .join(' ')
            .toLowerCase()
          const bGenres = (b.genres || [])
            .map((g) => (typeof g === 'string' ? g : g.name || ''))
            .join(' ')
            .toLowerCase()

          // Exact title, then prefix, then substring, then genre, then unified score.
          const aExactTitle = aTitles.includes(searchTerm)
          const bExactTitle = bTitles.includes(searchTerm)
          if (aExactTitle && !bExactTitle) return -1
          if (!aExactTitle && bExactTitle) return 1

          const aTitleStarts = aTitles.some((title) => title.startsWith(searchTerm))
          const bTitleStarts = bTitles.some((title) => title.startsWith(searchTerm))
          if (aTitleStarts && !bTitleStarts) return -1
          if (!aTitleStarts && bTitleStarts) return 1

          const aTitleContains = aTitles.some((title) => title.includes(searchTerm))
          const bTitleContains = bTitles.some((title) => title.includes(searchTerm))
          if (aTitleContains && !bTitleContains) return -1
          if (!aTitleContains && bTitleContains) return 1

          const aGenreMatch = aGenres.split(' ').some((genre) => genre.toLowerCase() === searchTerm)
          const bGenreMatch = bGenres.split(' ').some((genre) => genre.toLowerCase() === searchTerm)
          if (aGenreMatch && !bGenreMatch) return -1
          if (!aGenreMatch && bGenreMatch) return 1

          const aGenreContains = aGenres.includes(searchTerm)
          const bGenreContains = bGenres.includes(searchTerm)
          if (aGenreContains && !bGenreContains) return -1
          if (!aGenreContains && bGenreContains) return 1

          return (b.unifiedScore || 0) - (a.unifiedScore || 0)
        })
      } else {
        filteredResults.sort((a, b) => (b.unifiedScore || 0) - (a.unifiedScore || 0))
      }

      if (searchTerm) {
        try {
          const entityResponse = await entityAPI.search({
            q: query,
            type: 'character',
            limit: 20,
          })
          const entityHits = (entityResponse.data?.data || []) as UnifiedContent[]
          const seen = new Set(filteredResults.map((item) => item._id))
          const extra = entityHits.filter((hit) => hit?._id && !seen.has(hit._id))
          extra.sort((left, right) => {
            const leftName = getSearchableTitles(left).map((title) => title.toLowerCase())
            const rightName = getSearchableTitles(right).map((title) => title.toLowerCase())
            const leftExact = leftName.includes(searchTerm)
            const rightExact = rightName.includes(searchTerm)
            if (leftExact && !rightExact) return -1
            if (!leftExact && rightExact) return 1
            return 0
          })
          filteredResults = [...extra, ...filteredResults]
        } catch (entityError) {
          console.error('Character search failed:', entityError)
        }
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

  /**
   * Loads one catalog item into `currentContent`.
   * @param id - Mongo content id.
   * @returns The content-by-id API payload.
   */
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

  /**
   * Loads similar-title recommendations for a content id.
   * @param id - Mongo content id.
   * @param limit - Max recommendations (default 10).
   * @returns The similar-content API payload.
   */
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

  /**
   * Adds an item to the watchlist, then force-reloads the list.
   * @param contentId - Mongo content id.
   * @param status - Watch status (default `plan_to_watch`).
   * @param rating - Optional user rating.
   * @param currentEpisode - Optional episode progress.
   * @param currentSeason - Optional season progress.
   * @param notes - Optional notes.
   * @returns `true` on success.
   */
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
        await loadWatchlist(true)
      }

      return true
    } catch (err: unknown) {
      console.error('Error in addToWatchlist:', err)
      error.value = err instanceof Error ? err.message : 'Failed to add to watchlist'
      throw err
    }
  }

  /**
   * Patches one watchlist row in place instead of reloading the whole list.
   * `item.content` may be a populated document or a bare id string.
   * @param contentId - Mongo content id.
   * @param updates - Fields to merge onto the existing item.
   * @returns `true` on success.
   */
  const updateWatchlistItem = async (contentId: string, updates: Partial<WatchlistItem>) => {
    try {
      const response = await watchlistAPI.updateWatchlistItem(contentId, updates)

      if (response.data.success) {
        const itemIndex = watchlist.value.findIndex((item) => {
          if (typeof item.content === 'string') {
            return item.content === contentId
          }
          return item.content?._id === contentId
        })

        if (itemIndex !== -1) {
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

  /**
   * Removes an item from the watchlist, then force-reloads the list.
   * @param contentId - Mongo content id.
   * @returns `true` on success.
   */
  const removeFromWatchlist = async (contentId: string) => {
    try {
      const response = await watchlistAPI.removeFromWatchlist(contentId)

      if (response.data.success) {
        await loadWatchlist(true)
      }

      return true
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : 'Failed to remove from watchlist'
      throw err
    }
  }

  /**
   * Loads the signed-in user's watchlist. Skips the request if already loaded unless forced.
   * @param forceReload - When true, fetch even if `watchlistLoaded` is set.
   */
  const loadWatchlist = async (forceReload = false) => {
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

  /**
   * Flattened display fields for a catalog item (title, rating, media, source flags).
   * @param content - Unified catalog document.
   * @returns View-ready fields used by cards and detail pages.
   */
  const getContentDisplayInfo = (content: UnifiedContent) => {
    return {
      id: content._id,
      title: getDisplayTitle(content),
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

  const savedScrollPositions = ref<Record<string, number>>({})

  /**
   * Records `window.scrollY` under a route/view key for later restore.
   * @param key - Scroll-position bucket (usually a route name).
   */
  const saveScrollPosition = (key: string) => {
    savedScrollPositions.value[key] = window.scrollY
  }

  /**
   * Restores a previously saved scroll offset.
   * @param key - Scroll-position bucket.
   * @returns True if a saved position existed and was applied.
   */
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

  const clearSearchResults = () => {
    searchResults.value = []
    lastSearchQuery.value = ''
    searchFilters.value = defaultSearchFilters()
    searchAppliedFilters.value = defaultSearchFilters()
    searchPage.value = 1
  }

  const contentDetailsCache = new Map<string, UnifiedContent>()

  /**
   * Stores an item in the detail cache, optionally promoting it to `currentContent`.
   * @param item - Catalog document to cache.
   * @param setAsCurrent - When true, also set `currentContent`.
   */
  const cacheContent = (item?: UnifiedContent | null, setAsCurrent = false) => {
    if (item?._id) {
      contentDetailsCache.set(item._id, item)
      if (setAsCurrent) {
        currentContent.value = item
      }
    }
  }

  /**
   * Looks up a catalog item by id in current, cache, then list refs.
   * @param id - Mongo content id.
   * @returns The first matching document, or `undefined`.
   */
  const findContentById = (id: string): UnifiedContent | undefined => {
    if (currentContent.value?._id === id) return currentContent.value
    return (
      contentDetailsCache.get(id) ||
      movies.value.find((item) => item._id === id) ||
      tvShows.value.find((item) => item._id === id) ||
      movieRails.value.popular.find((item) => item._id === id) ||
      movieRails.value.theatres.find((item) => item._id === id) ||
      movieRails.value.upcoming.find((item) => item._id === id) ||
      tvRails.value.popular.find((item) => item._id === id) ||
      tvRails.value.airing.find((item) => item._id === id) ||
      tvRails.value.upcoming.find((item) => item._id === id) ||
      searchResults.value.find((item) => item._id === id) ||
      allContent.value.find((item) => item._id === id)
    )
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
    movieRails.value = { popular: [], theatres: [], upcoming: [] }
    tvRails.value = { popular: [], airing: [], upcoming: [] }
    movieRailsLoaded.value = false
    tvRailsLoaded.value = false
  }

  return {
    allContent,
    movies,
    tvShows,
    movieRails,
    tvRails,
    searchResults,
    currentContent,
    watchlist,
    recommendations,
    isLoading,
    moviesLoading,
    tvShowsLoading,
    movieRailsLoading,
    tvRailsLoading,
    searchLoading,
    error,
    pagination,
    moviesPagination,
    tvShowsPagination,
    lastSearchQuery,
    searchFilters,
    searchAppliedFilters,
    searchPage,

    getContent,
    loadCatalogRails,
    getPopularContent,
    searchContent,
    ensureFullCatalog,
    getContentDetails,
    getSimilarContent,
    addToWatchlist,
    updateWatchlistItem,
    removeFromWatchlist,
    loadWatchlist,

    isInWatchlist,
    getWatchlistItem,

    getContentDisplayInfo,
    findContentById,
    cacheContent,

    saveScrollPosition,
    restoreScrollPosition,
    clearScrollPosition,
    clearAllScrollPositions,
    scrollToTop,

    clearSearchResults,
    clearCurrentContent,
    clearAll,
  }
})
