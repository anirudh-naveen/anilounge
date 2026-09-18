<!-- eslint-disable vue/multi-word-component-names -->
<!--
  Search.vue — catalog browse and search view.

  Movies/Series toggle, search field, collapsible filters, and horizontal
  catalog rails (trending, in theatres / airing, upcoming). Search results
  replace the rails. Backed by the content store. The site-wide AI assistant
  can also fill these results.
-->
<template>
  <div class="search-page">
    <div class="container">
      <!-- Browse Header -->
      <div class="browse-header">
        <h1 class="browse-title">Search for</h1>
        <div class="type-toggle" role="tablist" aria-label="Content type">
          <button
            type="button"
            role="tab"
            class="type-toggle-btn"
            data-testid="browse-type-movie"
            :class="{ active: browseType === 'movie' }"
            :aria-selected="browseType === 'movie'"
            @click="setBrowseType('movie')"
          >
            Movies
          </button>
          <button
            type="button"
            role="tab"
            class="type-toggle-btn"
            data-testid="browse-type-tv"
            :class="{ active: browseType === 'tv' }"
            :aria-selected="browseType === 'tv'"
            @click="setBrowseType('tv')"
          >
            Series
          </button>
        </div>
      </div>

      <!-- Search -->
      <div class="search-form-container">
        <form @submit.prevent="handleSearch" class="search-form">
          <div class="search-input-group">
            <input
              v-model="searchQuery"
              type="text"
              class="search-input"
              data-testid="search-query"
              :placeholder="browseType === 'tv' ? 'Search for series...' : 'Search for movies...'"
            />
            <button
              type="submit"
              class="search-btn"
              data-testid="search-submit"
              :disabled="contentStore.isLoading || !canSearch"
            >
              <span v-if="contentStore.isLoading" class="spinner"></span>
              {{ contentStore.isLoading ? 'Searching...' : 'Search' }}
            </button>
            <button
              type="button"
              class="filters-toggle-btn"
              data-testid="search-filters-toggle"
              :class="{ active: filtersOpen, filled: hasExtraFilters }"
              :aria-expanded="filtersOpen"
              aria-controls="search-filters"
              @click="filtersOpen = !filtersOpen"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
                <path stroke-linecap="round" d="M4 7h16M7 12h10M10 17h4" />
              </svg>
              <span>Filters</span>
            </button>
          </div>
        </form>
      </div>

      <!-- Filters -->
      <div v-if="filtersOpen" id="search-filters" class="filters-container">
        <div class="filters-header">
          <h3>Filters</h3>
          <button @click="clearFilters" class="clear-filters-btn">
            <i class="fas fa-times"></i>
            Clear All
          </button>
        </div>
        <div class="filters-bar">
          <div class="filter-group">
            <label>Genre:</label>
            <select v-model="filters.genre" data-testid="filter-genre">
              <option value="all">All Genres</option>
              <option value="Action">Action</option>
              <option value="Adventure">Adventure</option>
              <option value="Comedy">Comedy</option>
              <option value="Drama">Drama</option>
              <option value="Fantasy">Fantasy</option>
              <option value="Mystery">Mystery</option>
              <option value="Sci-Fi">Sci-Fi</option>
              <option value="Supernatural">Supernatural</option>
              <option value="Historical">Historical</option>
              <option value="Military">Military</option>
              <option value="Psychological">Psychological</option>
              <option value="Mecha">Mecha</option>
              <option value="Samurai">Samurai</option>
              <option value="Vampire">Vampire</option>
            </select>
          </div>
          <div class="filter-group">
            <label>Language:</label>
            <select v-model="filters.language">
              <option value="all">All Languages</option>
              <option value="Japanese">Japanese</option>
              <option value="English">English</option>
              <option value="Korean">Korean</option>
              <option value="Chinese">Chinese</option>
            </select>
          </div>
          <div class="filter-group">
            <label>Country:</label>
            <select v-model="filters.country" data-testid="filter-country">
              <option value="all">All Countries</option>
              <option
                v-for="country in ORIGIN_COUNTRY_OPTIONS"
                :key="country.value"
                :value="country.value"
              >
                {{ country.label }}
              </option>
            </select>
          </div>
          <div class="filter-row-time">
            <div class="filter-group">
              <label>Year:</label>
              <select v-model="filters.year" data-testid="filter-year">
                <option
                  v-for="option in yearFilterOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
            </div>
            <div class="filter-group">
              <label>Season:</label>
              <select v-model="filters.season" data-testid="filter-season">
                <option
                  v-for="option in SEASON_FILTER_OPTIONS"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
            </div>
            <div class="filter-group">
              <label>Status:</label>
              <select v-model="filters.status" data-testid="filter-status">
                <option
                  v-for="option in STATUS_FILTER_OPTIONS"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
            </div>
          </div>
          <div class="filter-group sort-filter">
            <SortByControls
              v-model:sort-by="filters.sortBy"
              v-model:sort-direction="filters.sortDirection"
            />
          </div>
          <div class="filter-group rating-filter">
            <label>Rating: {{ filters.ratingMin }} – {{ filters.ratingMax }}</label>
            <div class="rating-slider">
              <div class="rating-slider-track">
                <div class="rating-slider-range" :style="ratingFillStyle"></div>
              </div>
              <input
                v-model.number="filters.ratingMin"
                type="range"
                min="1"
                max="10"
                step="1"
                aria-label="Minimum rating"
                @input="clampRatingMin"
              />
              <input
                v-model.number="filters.ratingMax"
                type="range"
                min="1"
                max="10"
                step="1"
                aria-label="Maximum rating"
                @input="clampRatingMax"
              />
            </div>
            <div class="rating-slider-scale">
              <span v-for="n in 10" :key="n">{{ n }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Results -->
      <!-- Title: Loading State -->
      <div v-if="contentStore.isLoading && hasSearched" class="loading-container">
        <div class="spinner"></div>
        <p>Searching for amazing content...</p>
      </div>

      <!-- Title: Error State -->
      <div v-else-if="contentStore.error && hasSearched" class="error-state">
        <div class="error-icon">⚠️</div>
        <h3>Search failed</h3>
        <p>{{ contentStore.error }}</p>
        <button @click="handleSearch" class="btn btn-primary">Try Again</button>
      </div>

      <!-- Title: Results Grid -->
      <div v-else-if="hasSearched && filteredResults.length > 0" class="search-results">
        <div class="results-header">
          <h2>Search Results</h2>
          <p>
            {{ filteredResults.length }} result{{ filteredResults.length !== 1 ? 's' : '' }} found
          </p>
        </div>

        <div class="results-grid">
          <div
            v-for="item in paginatedResults"
            :key="item._id"
            class="result-card poster-frame"
            @click="viewContentDetails(item)"
          >
            <div class="result-poster">
              <img
                :src="getPosterUrl(item.posterPath || '')"
                :alt="getDisplayTitle(item)"
                @error="handleImageError"
              />
              <div
                class="content-type-badge poster-corner-tag poster-corner-tag-right"
                :class="getContentTypeBadgeClass(item.contentType)"
              >
                {{ getCardContentTypeDisplay(item.contentType) }}
              </div>
              <AiringBadge :content="item" variant="card" />
            </div>
            <div class="result-info">
              <h3 class="result-title">{{ getDisplayTitle(item) }}</h3>
              <p v-if="getNativeTitle(item)" class="result-native-title">
                {{ getNativeTitle(item) }}
              </p>
              <p class="result-overview">{{ truncateText(item.overview, 100) }}</p>
              <div class="result-genres">
                <span
                  v-for="genre in getDisplayGenres(item.genres)?.slice(0, 2)"
                  :key="genre"
                  class="genre-tag"
                >
                  {{ genre }}
                </span>
              </div>
              <div class="result-meta">
                <span v-if="item.releaseDate" class="release-year">
                  {{ getReleaseYear(item.releaseDate) }}
                </span>
                <span v-if="isMovieLike(item.contentType) && item.runtime" class="runtime">
                  {{ item.runtime }} min
                </span>
                <span
                  v-if="tracksEpisodes(item) && (item.episodeCount || item.malEpisodes)"
                  class="episodes"
                >
                  {{ item.episodeCount || item.malEpisodes }} episodes
                </span>
              </div>
            </div>
            <ContentHoverPreview
              :item="item"
              :is-authenticated="authStore.isAuthenticated"
              :in-watchlist="contentStore.isInWatchlist(item._id)"
              :show-watchlist="!(item as any).source && !isCatalogEntity(item)"
            />
          </div>
        </div>

        <!-- Title: Pagination -->
        <PaginationNav :current-page="currentPage" :total-pages="totalPages" @change="goToPage" />
      </div>

      <!-- Title: Empty State -->
      <div v-else-if="hasSearched && filteredResults.length === 0" class="no-results">
        <div class="no-results-icon">🔍</div>
        <h3>No results found</h3>
        <p>Try adjusting your search terms or filters.</p>
        <button @click="clearSearch" class="btn btn-primary">Clear Search</button>
      </div>

      <!-- Title: Browse Rails -->
      <div v-else class="browse-rails">
        <ContentRail
          v-for="rail in browseRails"
          :key="`${browseType}-${rail.id}`"
          :rail-id="rail.id"
          :title="rail.title"
          :items="railItems(rail.id)"
          :loading="railsLoading"
          :view-all="rail.viewAll"
          :empty-text="railEmptyText(rail.id)"
          :is-authenticated="authStore.isAuthenticated"
          :in-watchlist="contentStore.isInWatchlist"
          @select="viewContentDetails"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter, useRoute } from 'vue-router'
import { useContentStore, defaultSearchFilters, hasActiveSearchFilters } from '@/stores/content'
import { useAuthStore } from '@/stores/auth'
import {
  getPosterUrl,
  formatGenres,
  getCardContentTypeDisplay,
  getContentTypeBadgeClass,
  getDetailsRouteName,
  isMovieLike,
  matchesContentTypeFilter,
  tracksEpisodes,
  isCatalogEntity,
} from '@/services/api'
import { useToast } from 'vue-toastification'
import type { UnifiedContent } from '@/types/content'
import PaginationNav from '@/components/PaginationNav.vue'
import ContentHoverPreview from '@/components/ContentHoverPreview.vue'
import AiringBadge from '@/components/AiringBadge.vue'
import ContentRail from '@/components/ContentRail.vue'
import SortByControls from '@/components/SortByControls.vue'
import { applySort } from '@/utils/sorting'
import { getTotalVoteCount, getWeightedAverage, ratingMatchesFilter } from '@/utils/ratings'
import { getDisplayTitle, getNativeTitle } from '@/utils/titles'
import {
  ORIGIN_COUNTRY_OPTIONS,
  SEASON_FILTER_OPTIONS,
  STATUS_FILTER_OPTIONS,
  buildYearFilterOptions,
  getSearchCategoryDate,
  matchesCountryFilter,
  matchesSeasonFilter,
  matchesStatusFilter,
  matchesYearFilter,
} from '@/utils/searchFilters'
import {
  MOVIE_BROWSE_RAILS,
  TV_BROWSE_RAILS,
  normalizeBrowseType,
  type BrowseContentType,
} from '@/utils/catalogTabs'

const router = useRouter()
const route = useRoute()
const contentStore = useContentStore()
const authStore = useAuthStore()
const toast = useToast()

// State
const searchQuery = ref(contentStore.lastSearchQuery)
const hasSearched = ref(
  contentStore.searchResults.length > 0 || Boolean(contentStore.lastSearchQuery),
)
const filtersOpen = ref(false)
const itemsPerPage = 20

const {
  searchFilters: filters,
  searchAppliedFilters: appliedFilters,
  searchPage: currentPage,
} = storeToRefs(contentStore)

const browseType = computed(() => normalizeBrowseType(route.query.type))
const hasExtraFilters = computed(() => hasActiveSearchFilters(filters.value))
const browseRails = computed(() =>
  browseType.value === 'tv' ? TV_BROWSE_RAILS : MOVIE_BROWSE_RAILS,
)
const railsLoading = computed(() =>
  browseType.value === 'tv' ? contentStore.tvRailsLoading : contentStore.movieRailsLoading,
)

// Computed properties
const searchResults = computed(() => contentStore.searchResults)

const filteredResults = computed(() => {
  let results = [...searchResults.value]
  const active = appliedFilters.value

  // Apply type filter (Movies includes specials). Characters stay visible in text search.
  if (active.type !== 'all') {
    results = results.filter(
      (item) => isCatalogEntity(item) || matchesContentTypeFilter(item.contentType, active.type),
    )
  }

  // Apply rating range (1–10). Full span includes unrated titles.
  if (!(active.ratingMin === 1 && active.ratingMax === 10)) {
    results = results.filter(
      (item) => isCatalogEntity(item) || ratingMatchesFilter(item, active.ratingMin, active.ratingMax),
    )
  }

  // Apply year filter
  if (active.year !== 'all') {
    results = results.filter((item) => isCatalogEntity(item) || matchesYearFilter(item, active.year))
  }

  // Apply season filter (movies and series)
  if (active.season !== 'all') {
    results = results.filter(
      (item) => isCatalogEntity(item) || matchesSeasonFilter(item, active.season),
    )
  }

  // Apply status filter (completed / airing / upcoming)
  if (active.status !== 'all') {
    results = results.filter(
      (item) => isCatalogEntity(item) || matchesStatusFilter(item, active.status),
    )
  }

  // Apply genre filter
  if (active.genre !== 'all') {
    results = results.filter((item) => {
      if (isCatalogEntity(item)) return true
      if (!item.genres || !Array.isArray(item.genres)) return false
      return item.genres.some((genre) => {
        const genreName = typeof genre === 'string' ? genre : genre.name
        return genreName === active.genre
      })
    })
  }

  // Apply language filter (this is a simplified implementation)
  if (active.language !== 'all') {
    results = results.filter((item) => {
      if (isCatalogEntity(item)) return true
      // For now, we'll assume Japanese content based on MAL data
      // This could be enhanced with actual language data from TMDB
      if (active.language === 'Japanese') {
        return (
          item.malId != null ||
          item.studios?.some(
            (studio) =>
              studio.toLowerCase().includes('japan') ||
              studio.toLowerCase().includes('toei') ||
              studio.toLowerCase().includes('madhouse') ||
              studio.toLowerCase().includes('studio ghibli'),
          )
        )
      }
      // For other languages, we'll need to implement proper language detection
      return true
    })
  }

  // Apply country of origin
  if (active.country !== 'all') {
    results = results.filter(
      (item) => isCatalogEntity(item) || matchesCountryFilter(item, active.country),
    )
  }

  return applySort(
    results,
    active.sortBy,
    active.sortDirection,
    (item) => getDisplayTitle(item),
    (item) => getWeightedAverage(item) || 0,
    (item) => getTotalVoteCount(item),
    undefined,
    (item) => getSearchCategoryDate(item)?.getTime() ?? 0,
  )
})

const totalPages = computed(() => {
  return Math.ceil(filteredResults.value.length / itemsPerPage)
})

const paginatedResults = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage
  const end = start + itemsPerPage
  return filteredResults.value.slice(start, end)
})

const canSearch = computed(
  () => Boolean(searchQuery.value.trim()) || hasActiveSearchFilters(filters.value),
)

const yearFilterOptions = computed(() => buildYearFilterOptions(contentStore.allContent))

const railItems = (id: string): UnifiedContent[] => {
  if (browseType.value === 'tv') {
    if (id === 'airing') return contentStore.tvRails.airing
    if (id === 'upcoming') return contentStore.tvRails.upcoming
    return contentStore.tvRails.popular
  }
  if (id === 'theatres') return contentStore.movieRails.theatres
  if (id === 'upcoming') return contentStore.movieRails.upcoming
  return contentStore.movieRails.popular
}

const railEmptyText = (id: string) => {
  if (browseType.value === 'tv') {
    if (id === 'airing') return 'Nothing is airing right now.'
    if (id === 'upcoming') return 'No upcoming series to highlight yet.'
    return 'No trending series right now.'
  }
  if (id === 'theatres') return 'Nothing looks like it is in theatres right now.'
  if (id === 'upcoming') return 'No upcoming movies to highlight yet.'
  return 'No trending movies right now.'
}

const setBrowseType = (type: BrowseContentType) => {
  if (type === browseType.value) return
  const query = { ...route.query }
  if (type === 'tv') {
    query.type = 'tv'
  } else {
    delete query.type
  }
  void router.replace({ query })
}

watch(
  browseType,
  (type, previous) => {
    filters.value = { ...filters.value, type }
    if (previous !== undefined) {
      appliedFilters.value = { ...appliedFilters.value, type }
    }
    void contentStore.loadCatalogRails(type).catch((error) => {
      console.error('Error loading browse rails:', error)
      toast.error(type === 'tv' ? 'Failed to load series.' : 'Failed to load movies.')
    })
  },
  { immediate: true },
)

// Helper functions
const getDisplayGenres = (genres: Array<{ id?: number; name?: string }> | string[]) => {
  return formatGenres(genres)
}

const getReleaseYear = (dateString: string | Date) => {
  const date = new Date(dateString)
  return date.getFullYear()
}

const truncateText = (text: string, maxLength: number) => {
  if (!text) return ''
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text
}

const clampRatingMin = () => {
  if (filters.value.ratingMin > filters.value.ratingMax) {
    filters.value.ratingMin = filters.value.ratingMax
  }
}

const clampRatingMax = () => {
  if (filters.value.ratingMax < filters.value.ratingMin) {
    filters.value.ratingMax = filters.value.ratingMin
  }
}

const ratingFillStyle = computed(() => {
  const min = filters.value.ratingMin
  const max = filters.value.ratingMax
  const left = ((min - 1) / 9) * 100
  const right = ((max - 1) / 9) * 100
  return {
    clipPath: `inset(0 ${Math.max(0, 100 - right)}% 0 ${Math.max(0, left)}% round 999px)`,
  }
})

const handleImageError = (event: Event) => {
  const img = event.target as HTMLImageElement
  img.src = '/placeholder-movie.jpg'
}

const viewContentDetails = (item: UnifiedContent) => {
  // Save current scroll position for search page
  const scrollKey = `search-page-${currentPage.value}`
  contentStore.saveScrollPosition(scrollKey)

  const routeName = getDetailsRouteName(item)
  router.push({
    name: routeName,
    params: { id: item._id },
    query: { from: route.fullPath },
  })
}

const handleSearch = async () => {
  if (!canSearch.value) {
    toast.info('Enter a search term or set a filter to search.')
    return
  }

  appliedFilters.value = { ...filters.value }
  hasSearched.value = true
  currentPage.value = 1

  const queryChanged = searchQuery.value !== contentStore.lastSearchQuery
  if (!queryChanged && contentStore.searchResults.length > 0) {
    return
  }

  try {
    await contentStore.searchContent(searchQuery.value, 'all')
  } catch (error) {
    console.error('Search error:', error)
    toast.error('Search failed. Please try again.')
  }
}

watch(
  () => contentStore.searchResults.length,
  (count) => {
    if (count > 0) hasSearched.value = true
  },
)

const clearFilters = () => {
  const reset = { ...defaultSearchFilters(), type: browseType.value }
  filters.value = reset
  appliedFilters.value = { ...reset }
  currentPage.value = 1
}

const clearSearch = () => {
  searchQuery.value = ''
  hasSearched.value = false
  contentStore.clearSearchResults()
  filters.value = { ...defaultSearchFilters(), type: browseType.value }
  appliedFilters.value = { ...filters.value }
}

const goToPage = (page: number) => {
  currentPage.value = page
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

// Restore query, filters, page, and scroll when returning from a detail page
onMounted(() => {
  if (contentStore.searchResults.length > 0 || contentStore.lastSearchQuery) {
    hasSearched.value = true
    if (contentStore.lastSearchQuery) {
      searchQuery.value = contentStore.lastSearchQuery
    }
  }

  if (hasActiveSearchFilters(filters.value)) {
    filtersOpen.value = true
  }

  void contentStore.ensureFullCatalog()

  if (authStore.isAuthenticated) {
    void contentStore.loadWatchlist()
  }

  const scrollKey = `search-page-${currentPage.value}`
  const restored = contentStore.restoreScrollPosition(scrollKey)
  if (!restored) {
    nextTick(() => {
      contentStore.scrollToTop()
    })
  }
})
</script>

<style scoped>
.search-page {
  min-height: 100vh;
  background: transparent;
  padding: 2rem 0;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 20px;
}

.browse-header {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.85rem 1.25rem;
  margin-bottom: 1.5rem;
  color: var(--text-primary);
}

.browse-title {
  font-family: var(--font-display);
  font-size: 2.4rem;
  font-weight: 650;
  margin: 0;
  letter-spacing: -0.03em;
}

.type-toggle {
  display: inline-flex;
  padding: 4px;
  border-radius: 999px;
  background: var(--bg-parchment);
  border: 1px solid var(--border-color);
  gap: 2px;
}

.type-toggle-btn {
  padding: 0.5rem 1.1rem;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  border-radius: 999px;
  cursor: pointer;
  font-weight: 650;
  font-family: inherit;
  font-size: 0.95rem;
  line-height: 1.15;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  transition: all 0.2s ease;
}

.type-toggle-btn:hover {
  color: var(--text-primary);
}

.type-toggle-btn.active {
  background: linear-gradient(135deg, var(--coral-light), var(--coral-primary));
  color: var(--text-on-accent);
  box-shadow: 0 6px 14px rgba(224, 122, 95, 0.22);
}

.search-form-container {
  margin-bottom: 1.25rem;
}

.search-form {
  width: 100%;
}

.search-input-group {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

.search-input {
  flex: 1;
  padding: 1rem;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  background: rgba(255, 255, 255, 0.9);
}

.search-input:focus {
  outline: none;
  background: white;
  box-shadow: 0 0 0 3px rgba(224, 122, 95, 0.35);
}

.search-btn {
  padding: 1rem 2rem;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  line-height: 1.15;
  gap: 0.5rem;
  background: linear-gradient(135deg, var(--coral-light), var(--coral-primary));
  color: var(--text-on-accent);
  box-shadow: 0 8px 18px rgba(224, 122, 95, 0.22);
}

.search-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.2);
}

.search-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.filters-toggle-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  line-height: 1.15;
  gap: 0.4rem;
  padding: 0.9rem 1.1rem;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-parchment);
  color: var(--text-secondary);
  font-weight: 650;
  font-family: inherit;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.2s ease;
}

.filters-toggle-btn svg {
  width: 18px;
  height: 18px;
  display: block;
}

.filters-toggle-btn:hover,
.filters-toggle-btn.active {
  color: var(--text-primary);
  border-color: var(--coral-primary);
  background: var(--bg-hover);
}

.filters-toggle-btn.filled {
  color: var(--coral-deep);
  border-color: var(--coral-primary);
}

.filters-container {
  margin-bottom: 2rem;
  position: relative;
}

.filters-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.filters-header h3 {
  color: var(--text-primary);
  font-size: 1.2rem;
  font-weight: 600;
  margin: 0;
}

.filters-bar {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem 1rem;
  align-items: start;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  padding: 1.5rem;
  border-radius: 12px;
  backdrop-filter: blur(10px);
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}

.rating-filter {
  grid-column: 1 / -1;
}

.filter-row-time {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem 1rem;
}

.sort-filter :deep(.sort-by-controls) {
  width: 100%;
}

.filter-group label {
  color: var(--text-secondary);
  font-weight: 500;
  font-size: 0.85rem;
}

.filter-group select {
  padding: 0.5rem;
  border: 2px solid var(--text-primary);
  border-radius: 6px;
  background: #fff;
  color: #333;
  font-size: 0.9rem;
  transition: all 0.3s ease;
}

.filter-group select:focus {
  outline: none;
  background: white;
  border-color: var(--coral-primary);
  box-shadow: 0 0 0 2px rgba(224, 122, 95, 0.25);
}

.filter-group select:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  background: #f3f3f3;
}

.rating-slider {
  position: relative;
  height: 28px;
  display: flex;
  align-items: center;
}

.rating-slider-track {
  position: absolute;
  left: 0;
  right: 0;
  height: 6px;
  border-radius: 999px;
  background: linear-gradient(90deg, #fca5a5 0%, #fde047 50%, #86efac 100%);
}

.rating-slider-range {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background: linear-gradient(90deg, #ef4444 0%, #facc15 50%, #22c55e 100%);
}

.rating-slider input[type='range'] {
  position: absolute;
  left: 0;
  width: 100%;
  margin: 0;
  background: none;
  appearance: none;
  -webkit-appearance: none;
  pointer-events: none;
  height: 6px;
}

.rating-slider input[type='range']::-webkit-slider-thumb {
  appearance: none;
  -webkit-appearance: none;
  pointer-events: auto;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: none;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
  cursor: pointer;
}

.rating-slider input[type='range']::-moz-range-thumb {
  pointer-events: auto;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: none;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
  cursor: pointer;
}

.rating-slider input[type='range']:nth-of-type(1) {
  z-index: 2;
}

.rating-slider input[type='range']:nth-of-type(2) {
  z-index: 3;
}

.rating-slider-scale {
  display: flex;
  justify-content: space-between;
  color: var(--text-muted);
  font-size: 0.7rem;
  font-weight: 600;
  padding: 0 1px;
}

.clear-filters-btn {
  background: linear-gradient(135deg, var(--coral-primary), var(--teal-primary));
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.8rem;
  line-height: 1.15;
  transition: all 0.3s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 0.4rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  flex-shrink: 0;
  white-space: nowrap;
}

.clear-filters-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.clear-filters-btn i {
  font-size: 0.7rem;
}

.results-header {
  text-align: center;
  margin-bottom: 2rem;
  color: var(--text-primary);
}

.results-header h2 {
  font-size: 2rem;
  margin-bottom: 0.5rem;
}

.results-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 1rem;
  margin-bottom: 3rem;
}

.result-card {
  position: relative;
  background: #fff;
  border-radius: 14px;
  overflow: visible;
  box-shadow: var(--shadow-sm);
  transition: all 0.3s ease;
  cursor: pointer;
  z-index: 1;
  border: 1px solid var(--border-color);
}

.result-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-spot), var(--shadow-md);
  border-color: var(--coral-primary);
  z-index: 20;
}

.result-poster {
  position: relative;
  aspect-ratio: 2/3;
  overflow: hidden;
  border-radius: 8px 8px 0 0;
}

.result-poster img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s ease;
}

.result-card:hover .result-poster img {
  transform: scale(1.05);
}

.content-type-badge {
  z-index: 2;
}

.result-info {
  padding: 0.6rem 0.7rem 0.75rem;
  border-radius: 0 0 8px 8px;
}

.result-title {
  font-size: 0.85rem;
  font-weight: 600;
  margin-bottom: 0.35rem;
  color: var(--text-ink);
  line-height: 1.25;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.result-native-title {
  font-size: 0.75rem;
  color: #666;
  font-style: italic;
  margin: -0.2rem 0 0.35rem;
  line-height: 1.2;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.result-overview {
  display: none;
}

.result-genres {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin-bottom: 0.4rem;
}

.genre-tag {
  background: rgba(224, 122, 95, 0.14);
  color: var(--coral-deep);
  padding: 2px 5px;
  border-radius: 999px;
  font-size: 0.65rem;
  font-weight: 600;
}

.genre-tag:nth-child(n + 2) {
  display: none;
}

.result-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  font-size: 0.7rem;
  color: #999;
}

.release-year,
.runtime,
.episodes {
  background: #f8f9fa;
  padding: 2px 6px;
  border-radius: 3px;
}

.loading-container,
.error-state,
.no-results,
.initial-state {
  text-align: center;
  padding: 4rem 0;
  color: var(--text-primary);
}

.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--border-color);
  border-top: 2px solid var(--coral-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.error-icon,
.no-results-icon,
.initial-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  line-height: 1.15;
  padding: 12px 24px;
  border-radius: 8px;
  text-decoration: none;
  font-weight: 600;
  transition: all 0.3s ease;
  border: none;
  cursor: pointer;
}

.btn-primary {
  background: linear-gradient(135deg, var(--coral-light), var(--coral-primary));
  color: var(--text-on-accent);
  box-shadow: 0 8px 18px rgba(224, 122, 95, 0.22);
}

.btn-secondary {
  background: var(--bg-parchment);
  color: var(--coral-deep);
  border: 1px solid var(--border-color);
}

.btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.2);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 1rem;
  margin-top: 2rem;
}

.pagination-info {
  color: var(--text-secondary);
  font-weight: 500;
}

@media (max-width: 900px) {
  .filters-bar {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .sort-filter,
  .rating-filter,
  .filter-row-time {
    grid-column: 1 / -1;
  }
}

@media (max-width: 768px) {
  .browse-title {
    font-size: 1.85rem;
  }

  .search-input-group {
    flex-wrap: wrap;
  }

  .search-input {
    min-width: 0;
    flex: 1 1 100%;
  }

  .search-btn,
  .filters-toggle-btn {
    flex: 1;
    justify-content: center;
  }

  .filters-bar {
    grid-template-columns: 1fr;
    gap: 1rem;
    padding: 1rem;
  }

  .sort-filter,
  .rating-filter,
  .filter-row-time {
    grid-column: 1;
  }

  .filter-row-time {
    grid-template-columns: 1fr;
  }

  .clear-filters-btn {
    padding: 0.4rem 0.8rem;
    font-size: 0.75rem;
  }

  .results-grid {
    grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
    gap: 0.75rem;
  }
}
</style>
