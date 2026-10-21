<!-- eslint-disable vue/multi-word-component-names -->
<!--
  Search.vue — catalog browse and search view.

  Movies/Series/Characters/Voice Actors toggle (Series has a Series/Seasons mode), search
  field, collapsible filters, and horizontal catalog rails (trending, in theatres / airing
  + this season, upcoming). Search results replace the rails. The Characters and Voice
  Actors tabs (`?type=character`, `?type=voice`) have their own filters and search
  (usePeopleSearch), showing a page of trending people until something is searched. Backed by the content store. Hosts the floating AI
  assistant, which can also fill these results.
-->
<template>
  <div class="search-page" :class="{ 'is-app': isAppLayout }">
    <!-- App layout: type, search, and the filter sheet live in the top bar -->
    <AppBar>
      <div v-if="!appSearchOpen" class="app-bar-segments" role="tablist" aria-label="Content type">
        <button
          v-for="tab in APP_TABS"
          :key="tab.id"
          type="button"
          role="tab"
          :class="{ active: appTab === tab.id }"
          :aria-selected="appTab === tab.id"
          :data-testid="`app-browse-type-${tab.id}`"
          @click="setAppTab(tab.id)"
        >
          {{ tab.label }}
        </button>
      </div>
      <span v-if="!appSearchOpen" class="app-bar-spacer"></span>
      <button
        v-if="!appSearchOpen"
        type="button"
        class="app-bar-button chat-button"
        aria-label="Open Lounge Guide, the AI assistant"
        data-testid="chat-launcher"
        @click="chatOpen = true"
      >
        <img src="/anilounge-logo.png" alt="" width="38" height="38" />
      </button>
      <AppSearchToggle
        v-model="searchQuery"
        v-model:expanded="appSearchOpen"
        :placeholder="searchPlaceholder"
        data-testid="search-query"
        @submit="handleSearch"
        @cancel="clearSearch"
      />
      <button
        type="button"
        class="app-bar-button"
        :class="{ active: hasExtraFilters || seasonMode }"
        aria-label="Filter and sort"
        data-testid="search-filters-toggle"
        @click="filterSheetOpen = true"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9">
          <path stroke-linecap="round" d="M4 7h16M7 12h10M10 17h4" />
        </svg>
      </button>
    </AppBar>
    <AppSheet
      v-if="isAppLayout"
      v-model:open="filterSheetOpen"
      title="Filter & Sort"
      reset-label="Reset"
      :can-reset="hasExtraFilters"
      :done-label="canSearch ? 'Search' : 'Done'"
      @reset="clearFilters"
      @close="applySheet"
    >
      <AppSheetSection v-if="browseType === 'tv'" title="Show">
        <div class="type-toggle sheet-toggle" role="tablist" aria-label="Series or seasons">
          <button
            type="button"
            role="tab"
            class="type-toggle-btn"
            :class="{ active: !seasonMode }"
            :aria-selected="!seasonMode"
            @click="setSeasonMode(false)"
          >
            Series
          </button>
          <button
            type="button"
            role="tab"
            class="type-toggle-btn"
            :class="{ active: seasonMode }"
            :aria-selected="seasonMode"
            @click="setSeasonMode(true)"
          >
            Seasons
          </button>
        </div>
      </AppSheetSection>
      <AppSheetSection v-if="peopleKind" title="Show">
        <div
          class="type-toggle sheet-toggle"
          role="tablist"
          aria-label="Characters or voice actors"
        >
          <button
            v-for="tab in PEOPLE_TABS"
            :key="tab.id"
            type="button"
            role="tab"
            class="type-toggle-btn"
            :class="{ active: activeTab === tab.id }"
            :aria-selected="activeTab === tab.id"
            @click="setBrowseType(tab.id)"
          >
            {{ tab.label }}
          </button>
        </div>
      </AppSheetSection>
      <AppSheetSection v-if="peopleKind" title="Filter & Sort" plain>
        <PeopleFilterPanel
          v-model="people.tabs[peopleKind].filters"
          :kind="peopleKind"
          :languages="people.tabs[peopleKind].result?.languages"
          class="sheet-filter-panel"
          @clear="clearFilters"
        />
      </AppSheetSection>
      <template v-else>
        <AppSheetSection title="Sort">
          <SortByControls
            v-model:sort-by="filters.sortBy"
            v-model:sort-direction="filters.sortDirection"
            class="sheet-sort"
          />
        </AppSheetSection>
        <AppSheetSection title="Filters" plain>
          <CatalogFilterPanel
            v-model="filters"
            :year-options="yearFilterOptions"
            class="sheet-filter-panel"
            @clear="clearFilters"
          />
        </AppSheetSection>
      </template>
    </AppSheet>

    <div class="container">
      <!-- Browse Header -->
      <div
        v-if="!isAppLayout"
        class="browse-header"
        :class="{ 'has-seasons': browseType === 'tv' }"
      >
        <h1 class="browse-title">Search For</h1>
        <div class="type-toggle-stack">
          <div class="type-toggle" role="tablist" aria-label="Content type">
            <button
              v-for="tab in SEARCH_TABS"
              :key="tab.id"
              type="button"
              role="tab"
              class="type-toggle-btn"
              :data-testid="`browse-type-${tab.id}`"
              :class="{ active: activeTab === tab.id }"
              :aria-selected="activeTab === tab.id"
              @click="setBrowseType(tab.id)"
            >
              <span class="tab-label">{{ tab.label }}</span>
              <span class="tab-label-short">{{ tab.short }}</span>
            </button>
          </div>
          <!-- Series mode lists whole series; Seasons mode lists each season instead.
             It drops down under the Series button while Series is picked. -->
          <Transition name="seasons-pop">
            <div
              v-if="browseType === 'tv'"
              class="type-toggle type-toggle-sm seasons-toggle"
              role="tablist"
              aria-label="Series or seasons"
            >
              <button
                type="button"
                role="tab"
                class="type-toggle-btn"
                data-testid="tv-view-series"
                :class="{ active: !seasonMode }"
                :aria-selected="!seasonMode"
                @click="setSeasonMode(false)"
              >
                Series
              </button>
              <button
                type="button"
                role="tab"
                class="type-toggle-btn"
                data-testid="tv-view-seasons"
                :class="{ active: seasonMode }"
                :aria-selected="seasonMode"
                @click="setSeasonMode(true)"
              >
                Seasons
              </button>
            </div>
          </Transition>
        </div>
      </div>

      <!-- Search -->
      <div v-if="!isAppLayout" class="search-form-container">
        <form @submit.prevent="handleSearch" class="search-form">
          <div class="search-input-group">
            <input
              v-model="searchQuery"
              type="text"
              class="search-input"
              data-testid="search-query"
              :placeholder="searchPlaceholder"
            />
            <button
              v-if="showReset"
              type="button"
              class="search-btn search-btn-reset"
              data-testid="search-submit"
              @click="clearSearch"
            >
              Reset
            </button>
            <button
              v-else
              type="submit"
              class="search-btn"
              data-testid="search-submit"
              :disabled="searching || !canSearch"
            >
              <span v-if="searching" class="spinner"></span>
              {{ searching ? 'Searching...' : 'Search' }}
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

      <!-- Filters (the people tabs' own, else the catalog's) -->
      <PeopleFilterPanel
        v-if="filtersOpen && !isAppLayout && peopleKind"
        id="search-filters"
        v-model="people.tabs[peopleKind].filters"
        :kind="peopleKind"
        :languages="people.tabs[peopleKind].result?.languages"
        @clear="clearFilters"
      />
      <CatalogFilterPanel
        v-else-if="filtersOpen && !isAppLayout"
        id="search-filters"
        v-model="filters"
        :year-options="yearFilterOptions"
        @clear="clearFilters"
      >
        <div class="sort-filter">
          <SortByControls
            v-model:sort-by="filters.sortBy"
            v-model:sort-direction="filters.sortDirection"
          />
        </div>
      </CatalogFilterPanel>

      <!-- Results -->
      <!-- Title: People -->
      <PeopleResults
        v-if="peopleKind"
        :kind="peopleKind"
        :result="people.tabs[peopleKind].result"
        :loading="people.tabs[peopleKind].loading"
        :error="people.tabs[peopleKind].error"
        @page="goToPeoplePage"
      />

      <!-- Title: Loading State -->
      <div v-else-if="contentStore.isLoading && hasSearched" class="loading-container">
        <div class="spinner"></div>
        <p>Searching for amazing content...</p>
      </div>

      <!-- Title: Error State -->
      <div v-else-if="contentStore.error && hasSearched" class="error-state">
        <div class="error-icon">⚠️</div>
        <h3>Search Failed</h3>
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
                :class="{ 'studio-logo': item.contentType === 'studio' && item.posterPath }"
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
              <WatchlistCardTag :content-id="item._id" />
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
        <svg
          class="no-results-icon"
          viewBox="0 0 24 24"
          width="56"
          height="56"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="m15.5 15.5 5 5" />
        </svg>
        <h3>No Results Found</h3>
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

    <!-- AI Assistant (in the app layout, opened from the top bar) -->
    <ChatLauncher v-model:open="chatOpen" :hide-trigger="isAppLayout" />
  </div>
</template>

<script setup lang="ts">
import { showPosterPlaceholder } from '@/utils/posters'
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter, useRoute } from 'vue-router'
import { useContentStore, defaultSearchFilters, hasActiveSearchFilters } from '@/stores/content'
import type { SearchFilters } from '@/stores/content'
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
import { usePageMeta } from '@/composables/usePageMeta'
import AppBar from '@/components/AppBar.vue'
import AppSearchToggle from '@/components/AppSearchToggle.vue'
import AppSheet from '@/components/AppSheet.vue'
import AppSheetSection from '@/components/AppSheetSection.vue'
import { isAppLayout } from '@/utils/nativeApp'
import PaginationNav from '@/components/PaginationNav.vue'
import ContentHoverPreview from '@/components/ContentHoverPreview.vue'
import WatchlistCardTag from '@/components/WatchlistCardTag.vue'
import AiringBadge from '@/components/AiringBadge.vue'
import ContentRail from '@/components/ContentRail.vue'
import ChatLauncher from '@/components/ChatLauncher.vue'
import SortByControls from '@/components/SortByControls.vue'
import CatalogFilterPanel from '@/components/CatalogFilterPanel.vue'
import PeopleFilterPanel from '@/components/PeopleFilterPanel.vue'
import PeopleResults from '@/components/PeopleResults.vue'
import {
  defaultPeopleFilters,
  hasActivePeopleFilters,
  usePeopleSearch,
  type PeopleKind,
} from '@/composables/usePeopleSearch'
import { applySort } from '@/utils/sorting'
import { getTotalVoteCount, getWeightedAverage } from '@/utils/ratings'
import { getDisplayTitle, getNativeTitle } from '@/utils/titles'
import { buildYearFilterOptions, getSearchCategoryDate } from '@/utils/searchFilters'
import { matchesCatalogFilters } from '@/utils/catalogFilters'
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
/** App layout: the top bar's search field (open while it holds a search) and the filter sheet. */
const appSearchOpen = ref(Boolean(searchQuery.value))
const filterSheetOpen = ref(false)
/** The Lounge Guide chat (opened from the top bar in the app layout). */
const chatOpen = ref(false)
const itemsPerPage = 20

const {
  searchFilters: filters,
  searchAppliedFilters: appliedFilters,
  searchPage: currentPage,
} = storeToRefs(contentStore)

const browseType = computed(() => normalizeBrowseType(route.query.type))

type SearchTab = BrowseContentType | 'character' | 'voice'
/** `short` labels fit the app layout's top bar. */
const SEARCH_TABS: { id: SearchTab; label: string; short: string }[] = [
  { id: 'movie', label: 'Movies', short: 'Movies' },
  { id: 'tv', label: 'Series', short: 'Series' },
  { id: 'character', label: 'Characters', short: 'Characters' },
  { id: 'voice', label: 'Voice Actors', short: 'Voices' },
]
const PEOPLE_TABS = SEARCH_TABS.filter((tab) => tab.id === 'character' || tab.id === 'voice')
/**
 * The app layout's top bar has room for three segments: People stands for both people
 * tabs, picked in the filter sheet (as Series / Seasons is).
 */
const APP_TABS = [
  { id: 'movie', label: 'Movies' },
  { id: 'tv', label: 'Series' },
  { id: 'people', label: 'People' },
] as const
type AppTab = (typeof APP_TABS)[number]['id']
const people = usePeopleSearch()
/** The people tab People opens: the one last used, else Characters. */
let lastPeopleTab: 'character' | 'voice' = 'character'
/** The Characters (`?type=character`) or Voice Actors (`?type=voice`) tab, else null. */
const peopleKind = computed<PeopleKind | null>(() => {
  const raw = Array.isArray(route.query.type) ? route.query.type[0] : route.query.type
  return raw === 'character' ? 'character' : raw === 'voice' ? 'voice_actor' : null
})
const activeTab = computed<SearchTab>(() =>
  peopleKind.value === 'character'
    ? 'character'
    : peopleKind.value === 'voice_actor'
      ? 'voice'
      : browseType.value,
)
const appTab = computed<AppTab>(() => (peopleKind.value ? 'people' : browseType.value))
const setAppTab = (tab: AppTab) => setBrowseType(tab === 'people' ? lastPeopleTab : tab)
const searching = computed(() =>
  peopleKind.value ? people.tabs[peopleKind.value].loading : contentStore.isLoading,
)
/** Series tab in Seasons mode (`?view=seasons`): results list seasons, not series. */
const seasonMode = computed(() => browseType.value === 'tv' && route.query.view === 'seasons')
const hasExtraFilters = computed(() =>
  peopleKind.value
    ? hasActivePeopleFilters(people.tabs[peopleKind.value].filters)
    : hasActiveSearchFilters(filters.value),
)
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

  // Characters, voice actors, and studios are never results themselves.
  results = results.filter((item) => !isCatalogEntity(item))

  // Series lists series, Seasons lists seasons; a one-season series shows as the series in both.
  if (browseType.value === 'tv') {
    results = results.filter((item) => {
      if (item.contentType === 'season') {
        const siblings = item.seriesId
          ? contentStore.catalogSeasonsBySeries.get(item.seriesId)
          : null
        return seasonMode.value && (siblings?.length ?? 2) > 1
      }
      if (item.contentType === 'tv' && seasonMode.value) {
        return !contentStore.hasSeasonRows(item) || Boolean(contentStore.getSoleSeasonId(item))
      }
      return true
    })
  }

  // Apply type filter (Movies includes specials)
  if (active.type !== 'all') {
    results = results.filter((item) => matchesContentTypeFilter(item.contentType, active.type))
  }

  // Genre, language, country, year, season, status, and rating range.
  results = results.filter((item) => matchesCatalogFilters(item, active))

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

const canSearch = computed(() => Boolean(searchQuery.value.trim()) || hasExtraFilters.value)

/**
 * After a search, while the query and filters still match what was searched (or the
 * query has been emptied with nothing left to search), the Search button turns into
 * Reset (back to the browse highlights).
 */
const showReset = computed(() => {
  const kind = peopleKind.value
  if (kind) {
    const tab = people.tabs[kind]
    return (
      people.hasSearched(kind) &&
      !tab.loading &&
      (!canSearch.value ||
        (searchQuery.value.trim() === tab.query &&
          (Object.keys(tab.filters) as (keyof typeof tab.filters)[]).every(
            (key) => tab.filters[key] === tab.applied[key],
          )))
    )
  }
  return (
    hasSearched.value &&
    !contentStore.isLoading &&
    (!canSearch.value ||
      (searchQuery.value === contentStore.lastSearchQuery &&
        (Object.keys(filters.value) as (keyof SearchFilters)[]).every(
          (key) => filters.value[key] === appliedFilters.value[key],
        )))
  )
})

const searchPlaceholder = computed(() =>
  peopleKind.value === 'character'
    ? 'Search for characters...'
    : peopleKind.value === 'voice_actor'
      ? 'Search for voice actors...'
      : browseType.value === 'tv'
        ? seasonMode.value
          ? 'Search for seasons...'
          : 'Search for series...'
        : 'Search for movies...',
)

const yearFilterOptions = computed(() => buildYearFilterOptions(contentStore.allContent))

const railItems = (id: string): UnifiedContent[] => {
  if (browseType.value === 'tv') {
    if (id === 'airing') return contentStore.tvRails.airing
    if (id === 'season') return contentStore.tvRails.season
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
    if (id === 'season') return 'No anime from this season yet.'
    if (id === 'upcoming') return 'No upcoming series to highlight yet.'
    return 'No trending series right now.'
  }
  if (id === 'theatres') return 'Nothing looks like it is in theatres right now.'
  if (id === 'upcoming') return 'No upcoming movies to highlight yet.'
  return 'No trending movies right now.'
}

const setBrowseType = (type: SearchTab) => {
  if (type === activeTab.value) return
  const query = { ...route.query }
  if (type === 'movie') {
    delete query.type
  } else {
    query.type = type
  }
  if (type !== 'tv') delete query.view
  void router.replace({ query })
}

const goToPeoplePage = (page: number) => {
  if (!peopleKind.value) return
  void people.goToPage(peopleKind.value, page)
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

// Each tab keeps its own search text; the people tabs load their trending page.
watch(
  peopleKind,
  (kind, previous) => {
    if (kind) {
      lastPeopleTab = kind === 'voice_actor' ? 'voice' : 'character'
      if (previous !== undefined) searchQuery.value = people.tabs[kind].query
      people.ensureLoaded(kind)
    } else if (previous) {
      searchQuery.value = contentStore.lastSearchQuery
    }
  },
  { immediate: true },
)

const setSeasonMode = (on: boolean) => {
  if (on === seasonMode.value) return
  const query = { ...route.query }
  if (on) {
    query.view = 'seasons'
  } else {
    delete query.view
  }
  currentPage.value = 1
  void router.replace({ query })
}

watch(
  browseType,
  (type, previous) => {
    filters.value = { ...filters.value, type }
    if (previous !== undefined) {
      appliedFilters.value = { ...appliedFilters.value, type }
    }
  },
  { immediate: true },
)

watch(
  [browseType, peopleKind],
  ([type, kind]) => {
    if (kind) return
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

const handleImageError = showPosterPlaceholder

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
  if (peopleKind.value) {
    await people.submit(peopleKind.value, searchQuery.value)
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
  const kind = peopleKind.value
  if (kind) {
    const tab = people.tabs[kind]
    tab.filters = defaultPeopleFilters()
    void (tab.query ? people.submit(kind, tab.query) : people.reset(kind))
    return
  }
  const reset = { ...defaultSearchFilters(), type: browseType.value }
  filters.value = reset
  appliedFilters.value = { ...reset }
  currentPage.value = 1
}

/** Closing the filter sheet searches with its filters (or returns to browsing when cleared). */
const applySheet = () => {
  const searched = peopleKind.value ? people.hasSearched(peopleKind.value) : hasSearched.value
  if (canSearch.value) void handleSearch()
  else if (searched) clearSearch()
}

const clearSearch = () => {
  if (peopleKind.value) {
    searchQuery.value = ''
    void people.reset(peopleKind.value)
    return
  }
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

usePageMeta({
  title: 'Search',
  description:
    'Search animated movies, series, characters, voice actors, and studios by title, genre, year, season, and rating.',
  path: '/search',
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

/* App layout */
.chat-button {
  overflow: hidden;
  padding: 0;
  border: 2px solid transparent;
  background:
    linear-gradient(var(--navbar-primary), var(--navbar-primary)) padding-box,
    linear-gradient(135deg, var(--coral-primary), var(--teal-primary)) border-box;
}

.chat-button img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.search-page.is-app {
  min-height: 0;
  padding: 0;
}

.search-page.is-app .container {
  padding: 0 16px;
}

.search-page.is-app .results-header {
  margin-bottom: 0.85rem;
  text-align: left;
}

.search-page.is-app .results-header h2 {
  font-size: 1.15rem;
  margin: 0;
}

.search-page.is-app .results-header p {
  font-size: 0.85rem;
  color: var(--text-muted);
}

.search-page.is-app .results-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.65rem;
  margin-bottom: 1.5rem;
}

.search-page.is-app .result-overview,
.search-page.is-app .result-genres,
.search-page.is-app .result-native-title {
  display: none;
}

.sheet-toggle {
  display: flex;
  width: 100%;
}

.sheet-toggle .type-toggle-btn {
  flex: 1;
}

.sheet-sort {
  width: 100%;
}

.sheet-sort :deep(.sort-label) {
  display: none;
}

.sheet-filter-panel {
  margin: 0;
}

.sheet-filter-panel :deep(.filters-header) {
  display: none;
}

.sheet-filter-panel :deep(.filters-bar) {
  border-radius: 14px;
  box-shadow: none;
}

.browse-header {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.85rem 1.25rem;
  margin-bottom: 1.5rem;
  color: var(--text-primary);
  transition: margin-bottom 0.25s ease;
}

/* Room under the header for the Series/Seasons toggle that drops down. */
.browse-header.has-seasons {
  margin-bottom: 4.25rem;
}

.type-toggle-stack {
  position: relative;
}

.seasons-toggle {
  position: absolute;
  top: calc(100% + 0.6rem);
  right: 0;
  white-space: nowrap;
}

.seasons-pop-enter-active,
.seasons-pop-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.25s ease;
}

.seasons-pop-enter-from,
.seasons-pop-leave-to {
  opacity: 0;
  transform: translateY(-8px);
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

.type-toggle-sm .type-toggle-btn {
  padding: 0.35rem 0.85rem;
  font-size: 0.85rem;
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
  background: var(--bg-card);
  color: var(--text-primary);
}

.search-input:focus {
  outline: none;
  background: var(--bg-card);
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

.search-btn-reset {
  background: var(--error-color);
  box-shadow: 0 8px 18px rgba(244, 67, 54, 0.22);
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

.sort-filter {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.sort-filter :deep(.sort-by-controls) {
  width: 100%;
  gap: 0.25rem;
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
  background: var(--bg-card);
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

.result-poster img.studio-logo {
  object-fit: contain;
  padding: 1.5rem;
  background: var(--bg-card);
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
  color: var(--text-body);
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
  color: var(--text-faint);
}

.release-year,
.runtime,
.episodes {
  background: var(--bg-muted);
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

.no-results-icon {
  color: var(--coral-primary);
}

.no-results p {
  margin-bottom: 1.5rem;
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
  .sort-filter {
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

  .sort-filter {
    grid-column: 1;
  }

  .results-grid {
    grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
    gap: 0.75rem;
  }
}

.tab-label-short {
  display: none;
}

/* Phones: the four tabs share the row, with short labels. */
@media (max-width: 600px) {
  .type-toggle-stack,
  .type-toggle-stack > .type-toggle:first-child {
    width: 100%;
  }

  .type-toggle-stack > .type-toggle:first-child .type-toggle-btn {
    flex: 1;
    padding: 0.5rem 0.35rem;
    font-size: 0.88rem;
    white-space: nowrap;
  }

  .tab-label {
    display: none;
  }

  .tab-label-short {
    display: inline;
  }
}
</style>
