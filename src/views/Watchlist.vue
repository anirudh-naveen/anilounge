<!-- eslint-disable vue/multi-word-component-names -->
<!--
  Watchlist.vue — authenticated watchlist view.

  Sort toolbar over collapsible status sections (Watching, On Hold, Planned,
  Completed, Dropped), each a compact expandable list of tracked titles.
  Progress, rating, and status are editable per row.
-->
<template>
  <div class="watchlist-page">
    <div class="container">
      <!-- Page Header -->
      <div class="page-header">
        <h1 class="page-title">Watchlist</h1>
        <p class="page-subtitle">Track your animated content progress</p>
      </div>

      <ImportReminder />

      <!-- Toolbar -->
      <div class="watchlist-toolbar">
        <!-- Title: Search -->
        <ListSearch
          v-model="searchQuery"
          placeholder="Search your watchlist"
          data-testid="watchlist-search"
        />
        <!-- Title: Sort -->
        <SortByControls v-model:sort-by="sortBy" v-model:sort-direction="sortDirection" />
      </div>

      <!-- List -->
      <!-- Title: Loading State -->
      <div v-if="isLoading && !contentStore.watchlist.length" class="loading-container">
        <div class="spinner"></div>
        <p>Loading your watchlist...</p>
      </div>

      <div v-else-if="contentStore.watchlist.length > 0" class="watchlist-container">
        <!-- Title: Column Header -->
        <div class="list-column-header">
          <span class="col-poster"></span>
          <span class="col-title">Title</span>
          <span class="col-progress">Progress</span>
          <span class="col-score">Score</span>
          <span class="col-status">Status</span>
          <span class="col-expand"></span>
        </div>

        <!-- Title: Status Sections -->
        <section
          v-for="section in sections"
          :key="section.status"
          class="status-section"
          :data-testid="`watchlist-section-${section.status}`"
        >
          <button
            type="button"
            class="section-header"
            :aria-expanded="!collapsedSections.has(section.status)"
            :aria-controls="`watchlist-section-${section.status}-items`"
            @click="toggleSection(section.status)"
          >
            <span
              class="section-dot"
              :class="getStatusClass(section.status)"
              aria-hidden="true"
            ></span>
            <span class="section-label">{{ section.label }}</span>
            <span class="section-count">{{ section.items.length }}</span>
            <svg
              class="section-chevron"
              :class="{ collapsed: collapsedSections.has(section.status) }"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="m6 9 6 6 6-6" />
            </svg>
          </button>
          <div
            v-show="!collapsedSections.has(section.status)"
            :id="`watchlist-section-${section.status}-items`"
            class="section-items"
          >
            <div
              v-for="item in section.items"
              :key="getContentId(item)"
              class="watchlist-item"
              :class="{ expanded: expandedItems.has(getContentId(item)) }"
            >
              <!-- Title: Compact Row -->
              <div class="item-header" @click="toggleExpanded(item)">
                <div class="item-poster">
                  <img
                    :src="getPosterUrl(getContentPosterPath(item))"
                    :alt="getContentTitle(item)"
                    @error="handleImageError"
                  />
                </div>

                <div class="item-title-section">
                  <h3 class="item-title" @click.stop="viewContentDetails(item)">
                    {{ getContentTitle(item) }}
                  </h3>
                  <div class="item-meta">
                    <span class="item-type">{{ getContentType(item) }}</span>
                    <span v-if="getContentYear(item)" class="item-year">{{
                      getContentYear(item)
                    }}</span>
                    <AiringBadge
                      v-if="typeof item.content !== 'string' && item.content"
                      :content="item.content"
                      variant="inline"
                    />
                  </div>
                </div>

                <div class="item-progress">
                  <div v-if="tracksItemEpisodes(item)" class="episode-progress">
                    <span class="episodes-watched">{{ getCurrentEpisodes(item) }}</span>
                    <span class="episode-separator">/</span>
                    <span class="total-episodes">{{ getTotalEpisodes(item) || '?' }}</span>
                    <span
                      v-if="hasNewEpisodes(item)"
                      class="new-episodes-indicator"
                      title="New episodes available"
                      >🆕</span
                    >
                  </div>
                  <div v-else class="movie-progress">—</div>
                </div>

                <div class="item-rating">
                  <span
                    v-if="item.rating"
                    class="rating-value"
                    :style="getRatingStyle(item.rating)"
                    >{{ item.rating }}</span
                  >
                  <span v-else class="no-rating-text">—</span>
                </div>

                <div class="item-status" :class="getStatusClass(item.status)">
                  {{ getStatusLabel(item.status) }}
                </div>

                <div class="item-actions">
                  <button
                    class="expand-btn"
                    type="button"
                    :aria-expanded="expandedItems.has(getContentId(item))"
                    :aria-label="
                      expandedItems.has(getContentId(item)) ? 'Collapse details' : 'Expand details'
                    "
                  >
                    {{ expandedItems.has(getContentId(item)) ? '▼' : '▶' }}
                  </button>
                </div>

                <div class="item-progress-track">
                  <div
                    class="item-progress-bar"
                    :class="getStatusClass(item.status)"
                    :style="{ width: getProgressPercent(item) + '%' }"
                  ></div>
                </div>
              </div>

              <!-- Title: Expanded Details -->
              <div v-if="expandedItems.has(getContentId(item))" class="item-details">
                <div class="details-content">
                  <div class="user-data">
                    <h4>Your Progress</h4>

                    <div class="progress-section">
                      <div class="status-control">
                        <label>Status:</label>
                        <select
                          :value="getLocalFormData(item).status"
                          @change="
                            updateLocalFormData(
                              item,
                              'status',
                              ($event.target as HTMLSelectElement).value,
                            )
                          "
                          class="status-select"
                        >
                          <option
                            v-for="option in WATCHLIST_STATUS_OPTIONS"
                            :key="option.value"
                            :value="option.value"
                          >
                            {{ option.label }}
                          </option>
                        </select>
                      </div>

                      <div
                        v-if="isTvContent(item) && getTotalSeasons(item) > 1"
                        class="season-control"
                      >
                        <label>Current Season:</label>
                        <select
                          :value="getLocalFormData(item).currentSeason || 1"
                          @change="
                            updateLocalFormData(
                              item,
                              'currentSeason',
                              parseInt(($event.target as HTMLSelectElement).value) || 1,
                            )
                          "
                          class="season-select"
                        >
                          <option
                            v-for="season in getTotalSeasons(item)"
                            :key="season"
                            :value="season"
                          >
                            Season {{ season }}
                          </option>
                        </select>
                      </div>

                      <div v-if="tracksItemEpisodes(item)" class="episode-control">
                        <label>Episodes Watched:</label>
                        <input
                          :value="getLocalFormData(item).currentEpisode"
                          @change="
                            updateLocalFormData(
                              item,
                              'currentEpisode',
                              parseInt(($event.target as HTMLInputElement).value) || 0,
                            )
                          "
                          type="number"
                          min="0"
                          :max="getTotalEpisodes(item) || undefined"
                          :disabled="
                            getLocalFormData(item).status === 'completed' &&
                            getTotalEpisodes(item) > 0
                          "
                          class="episode-input"
                        />
                      </div>

                      <div class="rating-control">
                        <label>Your Rating (1-10):</label>
                        <input
                          :value="getLocalFormData(item).rating || ''"
                          @change="
                            updateLocalFormData(
                              item,
                              'rating',
                              toUserRating(($event.target as HTMLInputElement).value),
                            )
                          "
                          type="number"
                          min="1"
                          max="10"
                          step="0.1"
                          class="rating-input"
                          placeholder="No rating"
                        />
                      </div>

                      <details class="more-details">
                        <summary>More details</summary>
                        <p class="more-hint">
                          Start and finish dates fill in automatically when you save progress.
                        </p>
                        <div class="dates-control">
                          <label>
                            Started
                            <input
                              :value="getLocalFormData(item).startedOn"
                              @change="
                                updateLocalFormData(
                                  item,
                                  'startedOn',
                                  ($event.target as HTMLInputElement).value,
                                )
                              "
                              type="date"
                              class="date-input"
                            />
                          </label>
                          <label>
                            Finished
                            <input
                              :value="getLocalFormData(item).completedOn"
                              @change="
                                updateLocalFormData(
                                  item,
                                  'completedOn',
                                  ($event.target as HTMLInputElement).value,
                                )
                              "
                              type="date"
                              class="date-input"
                            />
                          </label>
                          <label>
                            Rewatches
                            <input
                              :value="getLocalFormData(item).rewatchCount"
                              @change="
                                updateLocalFormData(
                                  item,
                                  'rewatchCount',
                                  Math.max(
                                    0,
                                    parseInt(($event.target as HTMLInputElement).value) || 0,
                                  ),
                                )
                              "
                              type="number"
                              min="0"
                              max="999"
                              class="rewatch-input"
                            />
                          </label>
                        </div>

                        <div class="notes-control">
                          <label>Your Review:</label>
                          <textarea
                            :value="getLocalFormData(item).notes"
                            @change="
                              updateLocalFormData(
                                item,
                                'notes',
                                ($event.target as HTMLTextAreaElement).value,
                              )
                            "
                            class="notes-textarea"
                            placeholder="Add your thoughts..."
                            rows="3"
                          ></textarea>
                        </div>
                      </details>
                    </div>

                    <div class="action-buttons">
                      <button @click="viewContentDetails(item)" class="btn btn-secondary">
                        View Details
                      </button>
                      <button @click="saveWatchlistItem(item)" class="save-watch-btn">
                        Save Watch
                      </button>
                      <button @click="removeFromWatchlist(item)" class="btn btn-danger">
                        Remove from Watchlist
                      </button>
                    </div>
                  </div>

                  <details class="content-description" :open="!isPhone">
                    <summary>About this title</summary>
                    <p>{{ getContentOverview(item) }}</p>

                    <div class="content-genres">
                      <h5>Genres:</h5>
                      <div class="genre-tags">
                        <span
                          v-for="genre in getContentGenres(item)"
                          :key="typeof genre === 'string' ? genre : genre.id"
                          class="genre-tag"
                        >
                          {{ typeof genre === 'string' ? genre : genre.name }}
                        </span>
                      </div>
                    </div>

                    <div class="content-info">
                      <div class="info-item">
                        <span class="info-label">Release Date:</span>
                        <span class="info-value">{{ getContentReleaseDate(item) }}</span>
                      </div>
                      <div v-if="isTvContent(item)" class="info-item">
                        <span class="info-label">Seasons:</span>
                        <span class="info-value">{{ getContentSeasons(item) }}</span>
                      </div>
                      <div class="info-item">
                        <span class="info-label">Rating:</span>
                        <span class="info-value">{{ getContentRating(item) }}</span>
                      </div>
                    </div>
                  </details>
                </div>
              </div>
            </div>
          </div>
        </section>

        <p v-if="!sections.length" class="no-matches" data-testid="watchlist-no-matches">
          No titles match “{{ searchQuery.trim() }}”.
        </p>
      </div>

      <!-- Title: Empty State -->
      <div v-else class="empty-state">
        <div class="empty-icon">Watchlist</div>
        <h3>No items in your watchlist</h3>
        <p>Start adding movies and series to track your progress!</p>
        <router-link to="/search" class="btn btn-primary">Browse the catalog</router-link>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { showPosterPlaceholder } from '@/utils/posters'
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useContentStore } from '@/stores/content'
import { useAuthStore } from '@/stores/auth'
import {
  getPosterUrl,
  getCardContentTypeDisplay,
  getDetailsRouteName,
  tracksEpisodes,
} from '@/services/api'
import { getRatingColor } from '@/utils/ratingColors'
import { getTotalVoteCount, getWeightedAverage, toUserRating } from '@/utils/ratings'
import { useToast } from 'vue-toastification'
import type { WatchlistItem } from '@/types'
import SortByControls from '@/components/SortByControls.vue'
import AiringBadge from '@/components/AiringBadge.vue'
import { applySort, type SortByOption, type SortDirection } from '@/utils/sorting'
import { getDisplayTitle } from '@/utils/titles'
import { getSearchCategoryDate } from '@/utils/searchFilters'
import {
  getWatchlistStatusLabel,
  WATCHLIST_STATUS_OPTIONS,
  WATCHLIST_STATUS_ORDER,
  type WatchlistStatus,
} from '@/utils/watchlist'
import ImportReminder from '@/components/ImportReminder.vue'
import ListSearch from '@/components/ListSearch.vue'

const router = useRouter()
const contentStore = useContentStore()
const authStore = useAuthStore()
const toast = useToast()

const isLoading = ref(false)
const expandedItems = ref(new Set<string>())
// On phones the title's description starts collapsed so the progress fields come first.
const isPhone =
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(max-width: 768px)').matches
    : false
const searchQuery = ref('')
const sortBy = ref<SortByOption>('relevance')
const sortDirection = ref<SortDirection>('desc')

/** Collapsed status sections, remembered per browser. */
const COLLAPSED_KEY = 'anilounge:watchlist-collapsed'
const readCollapsed = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(COLLAPSED_KEY) || '[]')
    return new Set<string>(Array.isArray(saved) ? saved : [])
  } catch {
    return new Set<string>()
  }
}
const collapsedSections = ref(readCollapsed())

const toggleSection = (status: string) => {
  const next = new Set(collapsedSections.value)
  if (next.has(status)) next.delete(status)
  else next.add(status)
  collapsedSections.value = next
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]))
  } catch {
    // Storage unavailable: the choice lasts until the page reloads.
  }
}

const getStatusLabel = (status: string) => getWatchlistStatusLabel(status)

const getStatusClass = (status: string) => {
  return `status-${status.replace(/_/g, '-')}`
}

const getContentId = (item: WatchlistItem) => {
  if (typeof item === 'string') return item
  return typeof item.content === 'string' ? item.content : item.content?._id
}

const getRatingStyle = (rating: number | undefined) => {
  const color = getRatingColor(rating)
  return {
    color: color,
    fontWeight: 'bold',
  }
}

const getContentTitle = (item: WatchlistItem) => {
  if (typeof item === 'string') return 'Unknown Title'
  if (typeof item.content === 'string') return 'Unknown Title'
  return getDisplayTitle(item.content)
}

const getContentOverview = (item: WatchlistItem) => {
  if (typeof item === 'string') return 'No description available'
  if (typeof item.content === 'string') return 'No description available'
  return item.content?.overview || 'No description available'
}

const getContentPosterPath = (item: WatchlistItem) => {
  if (typeof item === 'string') return ''
  if (typeof item.content === 'string') return ''
  return item.content?.posterPath || ''
}

const getContentType = (item: WatchlistItem) => {
  if (typeof item === 'string') return 'Unknown'
  if (typeof item.content === 'string') return 'Unknown'
  if (!item.content?.contentType) return 'Unknown'
  return getCardContentTypeDisplay(item.content.contentType)
}

const tracksItemEpisodes = (item: WatchlistItem) => {
  if (typeof item === 'string' || typeof item.content === 'string' || !item.content) return false
  return tracksEpisodes(item.content)
}

const isTvContent = (item: WatchlistItem) => {
  if (typeof item === 'string' || typeof item.content === 'string') return false
  return item.content?.contentType === 'tv'
}

const getContentYear = (item: WatchlistItem) => {
  if (typeof item === 'string') return ''
  if (typeof item.content === 'string') return ''
  const content = item.content
  if (!content) return ''
  const date = content.releaseDate
  return date ? new Date(date).getFullYear().toString() : ''
}

const getContentGenres = (item: WatchlistItem) => {
  if (typeof item === 'string') return []
  if (typeof item.content === 'string') return []
  return item.content?.genres || []
}

const getContentReleaseDate = (item: WatchlistItem) => {
  if (typeof item === 'string') return 'Unknown'
  if (typeof item.content === 'string') return 'Unknown'
  const content = item.content
  if (!content) return 'Unknown'
  const date = content.releaseDate
  return date ? new Date(date).toLocaleDateString() : 'Unknown'
}

const getContentSeasons = (item: WatchlistItem) => {
  if (typeof item === 'string') return 'Unknown'
  if (typeof item.content === 'string') return 'Unknown'
  const content = item.content
  if (!content) return 'Unknown'
  return content.contentType === 'tv' ? content.seasonCount || 'Unknown' : 'N/A'
}

const getContentRating = (item: WatchlistItem) => {
  if (typeof item === 'string') return 'N/A'
  if (typeof item.content === 'string' || !item.content) return 'N/A'
  const average = getWeightedAverage(item.content)
  return average != null ? average.toFixed(1) : 'N/A'
}

const getCurrentEpisodes = (item: WatchlistItem) => {
  if (typeof item === 'string') return 0
  return item.currentEpisode || 0
}

const getTotalEpisodes = (item: WatchlistItem) => {
  if (typeof item === 'string') return 0
  if (typeof item.content === 'string') return 0
  const content = item.content
  if (!content) return 0
  // The API sends `episodeCount` / `malEpisodes`; `totalEpisodes` is never stored, and
  // 0 means the episode count isn't known yet (e.g. a show still airing).
  return content.episodeCount || content.malEpisodes || item.totalEpisodes || 0
}

const getTotalSeasons = (item: WatchlistItem) => {
  if (typeof item === 'string') return 1
  if (typeof item.content === 'string') return 1
  const content = item.content
  if (!content) return 1
  return content.contentType === 'tv' ? content.seasonCount || item.totalSeasons || 1 : 1
}

/** Episodes out so far: up to the next scheduled one while airing, else the total. */
const getAiredEpisodes = (item: WatchlistItem) => {
  if (typeof item.content === 'string' || !item.content) return 0
  const { malStatus, nextEpisodeNumber } = item.content
  if (malStatus === 'not_yet_aired') return 0
  if (nextEpisodeNumber && nextEpisodeNumber > 1) return nextEpisodeNumber - 1
  return getTotalEpisodes(item)
}

/** A show the user is watching or plans to watch has aired episodes they haven't seen. */
const hasNewEpisodes = (item: WatchlistItem) => {
  if (typeof item === 'string') return false
  if (item.status !== 'watching' && item.status !== 'plan_to_watch') return false
  return getCurrentEpisodes(item) < getAiredEpisodes(item)
}

const getProgressPercent = (item: WatchlistItem) => {
  if (tracksItemEpisodes(item)) {
    const total = getTotalEpisodes(item)
    if (!total) return 0
    return Math.min(100, Math.round((getCurrentEpisodes(item) / total) * 100))
  }
  return item.status === 'completed' ? 100 : 0
}

const getWatchlistRatingValue = (item: WatchlistItem) => {
  if (item.rating) return item.rating
  if (typeof item.content === 'string' || !item.content) return 0
  return getWeightedAverage(item.content) || 0
}

const getWatchlistPopularity = (item: WatchlistItem) => {
  if (typeof item.content === 'string' || !item.content) return 0
  return getTotalVoteCount(item.content)
}

const getWatchlistAddedAt = (item: WatchlistItem) => {
  return item.addedAt ? new Date(item.addedAt).getTime() : 0
}

const getWatchlistSearchDate = (item: WatchlistItem) => {
  if (typeof item.content === 'string' || !item.content) return 0
  return getSearchCategoryDate(item.content)?.getTime() ?? 0
}

/** Whether a row's title (display, original, or English) contains the search text. */
const matchesSearch = (item: WatchlistItem, query: string) => {
  if (!query) return true
  if (typeof item.content === 'string' || !item.content) return false
  const { title, originalTitle } = item.content
  const englishTitle = (item.content as { englishTitle?: string }).englishTitle
  return [getContentTitle(item), title, originalTitle, englishTitle].some((name) =>
    name?.toLowerCase().includes(query),
  )
}

/** Non-empty status sections in display order, filtered by search and sorted by the toolbar. */
const sections = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  const sorted = applySort(
    contentStore.watchlist.filter((item) => matchesSearch(item, query)),
    sortBy.value,
    sortDirection.value,
    getContentTitle,
    getWatchlistRatingValue,
    getWatchlistPopularity,
    getWatchlistAddedAt,
    getWatchlistSearchDate,
  )
  return WATCHLIST_STATUS_ORDER.map((status) => ({
    status,
    label: getWatchlistStatusLabel(status),
    items: sorted.filter((item) => item.status === status),
  })).filter((section) => section.items.length > 0)
})

const toggleExpanded = (item: WatchlistItem) => {
  const contentId = getContentId(item)
  if (expandedItems.value.has(contentId)) {
    expandedItems.value.delete(contentId)
  } else {
    expandedItems.value.add(contentId)
    initializeFormData(item)
  }
}

// Local state for form data
const localFormData = ref<
  Map<
    string,
    {
      status: string
      currentEpisode: number
      currentSeason?: number
      rating: number | undefined
      notes: string
      startedOn?: string
      completedOn?: string
      rewatchCount?: number
    }
  >
>(new Map())

// Initialize local form data when item is expanded
const initializeFormData = (item: WatchlistItem) => {
  const itemId = getContentId(item)
  if (!localFormData.value.has(itemId)) {
    localFormData.value.set(itemId, {
      status: item.status || 'plan_to_watch',
      currentEpisode: item.currentEpisode || 0,
      currentSeason: item.currentSeason || 1,
      rating: item.rating,
      notes: item.notes || '',
      startedOn: item.startedOn || '',
      completedOn: item.completedOn || '',
      rewatchCount: item.rewatchCount || 0,
    })
  }
}

// Get local form data for an item
const getLocalFormData = (item: WatchlistItem): LocalFormData => {
  const itemId = getContentId(item)
  const existingData = localFormData.value.get(itemId)

  if (existingData) {
    // Ensure all required fields exist
    return {
      status: existingData.status || item.status || 'plan_to_watch',
      currentEpisode: existingData.currentEpisode || item.currentEpisode || 0,
      currentSeason: existingData.currentSeason || item.currentSeason || 1,
      rating: existingData.rating || item.rating,
      notes: existingData.notes || item.notes || '',
      startedOn: existingData.startedOn ?? item.startedOn ?? '',
      completedOn: existingData.completedOn ?? item.completedOn ?? '',
      rewatchCount: existingData.rewatchCount ?? item.rewatchCount ?? 0,
    }
  }

  return {
    status: item.status || 'plan_to_watch',
    currentEpisode: item.currentEpisode || 0,
    currentSeason: item.currentSeason || 1,
    rating: item.rating,
    notes: item.notes || '',
    startedOn: item.startedOn || '',
    completedOn: item.completedOn || '',
    rewatchCount: item.rewatchCount || 0,
  }
}

// Local form data interface
interface LocalFormData {
  status: string
  currentEpisode: number
  currentSeason: number
  rating: number | undefined
  notes: string
  startedOn: string
  completedOn: string
  rewatchCount: number
}

// Update local form data
const updateLocalFormData = (
  item: WatchlistItem,
  field: keyof LocalFormData,
  value: string | number | undefined,
) => {
  const itemId = getContentId(item)
  const currentData: LocalFormData = getLocalFormData(item)

  // Type-safe assignment
  if (field === 'status') {
    currentData.status = value as string
    // Completed titles sit on their last episode (the server enforces the same rule).
    const total = getTotalEpisodes(item)
    if (value === 'completed' && total > 0) currentData.currentEpisode = total
    // Back to watching: resume where the saved row was before it was completed.
    const resumeAt = item.previousEpisode || 0
    if (
      value === 'watching' &&
      item.status === 'completed' &&
      resumeAt > 0 &&
      resumeAt < currentData.currentEpisode
    ) {
      currentData.currentEpisode = resumeAt
    }
  } else if (field === 'currentEpisode') {
    currentData.currentEpisode = value as number
  } else if (field === 'currentSeason') {
    currentData.currentSeason = value as number
  } else if (field === 'rating') {
    currentData.rating = value as number | undefined
  } else if (field === 'notes') {
    currentData.notes = value as string
  } else if (field === 'startedOn' || field === 'completedOn') {
    currentData[field] = (value as string) || ''
  } else if (field === 'rewatchCount') {
    currentData.rewatchCount = value as number
  }

  localFormData.value.set(itemId, currentData)
}

// Save all changes for an item
const saveWatchlistItem = async (item: WatchlistItem) => {
  const itemId = getContentId(item)
  const formData = localFormData.value.get(itemId)

  if (!formData) {
    toast.error('No changes to save')
    return
  }

  try {
    await contentStore.updateWatchlistItem(itemId, {
      status: formData.status as WatchlistStatus,
      currentEpisode: formData.currentEpisode,
      currentSeason: formData.currentSeason || 1,
      rating: formData.rating,
      notes: formData.notes,
      startedOn: formData.startedOn || null,
      completedOn: formData.completedOn || null,
      rewatchCount: formData.rewatchCount || 0,
    })
    toast.success('Watchlist item saved successfully')
  } catch (error) {
    console.error('Error saving watchlist item:', error)
    toast.error('Failed to save watchlist item')
  }
}

const removeFromWatchlist = async (item: WatchlistItem) => {
  try {
    await contentStore.removeFromWatchlist(getContentId(item))
    toast.success('Removed from watchlist')
  } catch (error) {
    console.error('Error removing from watchlist:', error)
    toast.error('Failed to remove from watchlist')
  }
}

const viewContentDetails = (item: WatchlistItem) => {
  if (typeof item === 'string') return
  if (typeof item.content === 'string' || !item.content) return

  router.push({
    name: getDetailsRouteName(item.content),
    params: { id: item.content._id },
  })
}

const handleImageError = showPosterPlaceholder

// Watch for authentication state changes
watch(
  () => authStore.isAuthenticated,
  (isAuthenticated, wasAuthenticated) => {
    if (wasAuthenticated && !isAuthenticated) {
      router.push('/login')
    }
  },
)

// Watch for route changes to refresh watchlist when navigating to this page
watch(
  () => router.currentRoute.value.path,
  (newPath) => {
    if (newPath === '/watchlist' && authStore.isAuthenticated) {
      contentStore.loadWatchlist(true)
    }
  },
  { immediate: true },
)

onMounted(async () => {
  if (isLoading.value) {
    return
  }

  // Check authentication first
  if (!authStore.isAuthenticated) {
    router.push('/login')
    return
  }

  // Use the proper content store method to load watchlist
  isLoading.value = true
  try {
    await contentStore.loadWatchlist(true) // Force reload to get latest data
  } catch (error) {
    console.error('Error loading watchlist:', error)
    toast.error('Failed to load watchlist')
  } finally {
    isLoading.value = false
  }
})

onUnmounted(() => {
  isLoading.value = false
})
</script>

<style scoped>
.watchlist-page {
  padding: 2rem 0;
  min-height: calc(100vh - 140px);
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1rem;
}

.page-header {
  text-align: center;
  margin-bottom: 2rem;
}

.page-title {
  font-family: var(--font-display);
  font-size: 2.5rem;
  font-weight: 650;
  margin-bottom: 0.5rem;
  color: var(--text-primary);
  letter-spacing: -0.03em;
}

.page-subtitle {
  color: var(--text-secondary);
  font-size: 1.1rem;
}

.watchlist-toolbar {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: flex-end;
  gap: 0.75rem 1rem;
  margin-bottom: 1.25rem;
}

.status-section {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.status-section + .status-section {
  margin-top: 1rem;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  padding: 0.6rem 0.75rem;
  border: none;
  border-bottom: 1px solid var(--border-color);
  background: none;
  color: var(--text-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease;
}

.section-header:hover {
  background: var(--bg-hover);
}

.section-header:focus-visible {
  outline: 2px solid var(--coral-primary);
  outline-offset: 2px;
  border-radius: 6px;
}

.section-dot {
  width: 0.65rem;
  height: 0.65rem;
  border-radius: 50%;
  flex-shrink: 0;
}

.section-dot.status-plan-to-watch {
  background: var(--text-muted);
}

.section-label {
  font-family: var(--font-display);
  font-size: 1.15rem;
  font-weight: 600;
}

.section-count {
  padding: 0.1rem 0.55rem;
  border-radius: 999px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 0.8rem;
  font-weight: 600;
}

.section-chevron {
  width: 18px;
  height: 18px;
  margin-left: auto;
  color: var(--text-muted);
  transition: transform 0.2s ease;
}

.section-chevron.collapsed {
  transform: rotate(-90deg);
}

.section-items {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.watchlist-toolbar :deep(.sort-by-controls) {
  min-width: 240px;
}

.watchlist-toolbar :deep(.list-search) {
  max-width: 420px;
}

.no-matches {
  padding: 2rem 0;
  text-align: center;
  color: var(--text-secondary);
}

.loading-container {
  text-align: center;
  padding: 4rem 0;
}

.loading-container p {
  margin-top: 1rem;
  color: var(--text-secondary);
}

.loading-container .spinner {
  width: 40px;
  height: 40px;
  margin: 0 auto;
  border: 3px solid var(--border-color);
  border-top-color: var(--coral-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.watchlist-container {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.list-column-header,
.item-header {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) 5.5rem 3.5rem 7.5rem 2rem;
  align-items: center;
  column-gap: 0.25rem;
}

.list-column-header {
  padding: 0.25rem 0.5rem 0.4rem 0;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.col-title {
  padding: 0 0.75rem;
}

.col-progress,
.col-score,
.col-status {
  text-align: center;
}

.watchlist-item {
  background: var(--bg-card);
  border-radius: 6px;
  border: 1px solid var(--border-color);
  overflow: hidden;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    background 0.2s ease;
}

.watchlist-item:hover {
  border-color: var(--border-hover);
  background: var(--bg-hover);
}

.item-header {
  position: relative;
  grid-template-rows: 68px;
  min-height: 68px;
  padding: 0 0.5rem 0 0;
  cursor: pointer;
}

.item-poster {
  width: 48px;
  height: 68px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.2);
}

.item-poster img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.item-title-section {
  min-width: 0;
  padding: 0 0.75rem;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.1rem;
}

.item-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}

.item-title:hover {
  color: var(--highlight-color);
  text-decoration: underline;
}

.item-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.item-type {
  font-weight: 500;
}

.item-year {
  color: var(--text-muted);
}

.item-year::before {
  content: '·';
  margin-right: 0.5rem;
  color: var(--text-muted);
}

.item-status {
  justify-self: center;
  padding: 0.15rem 0.55rem;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 600;
  white-space: nowrap;
  text-align: center;
  line-height: 1.3;
}

.status-plan-to-watch {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.status-watching {
  background: var(--highlight-color);
  color: white;
}

.status-completed {
  background: var(--success-color);
  color: white;
}

.status-on-hold {
  background: var(--warning-color);
  color: white;
}

.status-dropped {
  background: var(--error-color);
  color: white;
}

.item-progress,
.item-rating {
  display: flex;
  align-items: center;
  justify-content: center;
  font-variant-numeric: tabular-nums;
}

.episode-progress {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.15rem;
  font-size: 0.9rem;
  color: var(--text-secondary);
}

.episodes-watched {
  font-weight: 700;
  color: var(--text-primary);
}

.total-episodes {
  color: var(--text-muted);
}

.new-episodes-indicator {
  font-size: 0.7rem;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.movie-progress {
  font-size: 0.9rem;
  color: var(--text-muted);
}

.rating-value {
  font-size: 0.95rem;
  font-weight: 700;
}

.no-rating-text {
  font-size: 0.9rem;
  color: var(--text-muted);
}

.item-actions {
  display: flex;
  align-items: center;
  justify-content: center;
}

.expand-btn {
  background: none;
  border: none;
  font-size: 0.7rem;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0.35rem;
  border-radius: 4px;
  line-height: 1;
  transition: all 0.2s ease;
}

.expand-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.item-progress-track {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 3px;
  background: rgba(255, 255, 255, 0.08);
  pointer-events: none;
  z-index: 1;
}

.item-progress-bar {
  height: 100%;
  width: 0;
  transition: width 0.3s ease;
}

.item-progress-bar.status-plan-to-watch {
  background: var(--text-muted);
}

.item-progress-bar.status-watching {
  background: var(--highlight-color);
}

.item-progress-bar.status-completed {
  background: var(--success-color);
}

.item-progress-bar.status-on-hold {
  background: var(--warning-color);
}

.item-progress-bar.status-dropped {
  background: var(--error-color);
}

.item-details {
  border-top: 1px solid var(--border-color);
  padding: 1.5rem;
  background: var(--bg-secondary);
}

.details-content {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2rem;
}

.user-data h4 {
  margin: 0 0 1rem 0;
  color: var(--text-primary);
  font-size: 1.1rem;
}

.content-description p {
  color: var(--text-secondary);
  line-height: 1.6;
  margin-bottom: 1rem;
}

.content-genres {
  margin-bottom: 1rem;
}

.content-genres h5 {
  margin: 0 0 0.5rem 0;
  color: var(--text-primary);
  font-size: 0.9rem;
}

.genre-tags {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.genre-tag {
  background: var(--bg-hover);
  color: var(--text-primary);
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: 500;
}

.content-info {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.info-item {
  display: flex;
  justify-content: space-between;
  font-size: 0.9rem;
}

.info-label {
  color: var(--text-secondary);
}

.info-value {
  color: var(--text-primary);
  font-weight: 500;
}

.progress-section {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

/* Status and season take the full row; episodes and rating sit side by side. */
.status-control,
.season-control,
.more-details,
.progress-section:not(:has(.episode-control)) .rating-control {
  grid-column: 1 / -1;
}

.season-control {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.season-control label {
  color: var(--text-primary);
  font-weight: 500;
  font-size: 0.9rem;
}

.season-select {
  padding: 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 0.9rem;
}

.more-details,
.content-description {
  border-top: 1px solid var(--border-color);
  padding-top: 0.75rem;
}

.more-details[open] {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.more-details summary,
.content-description summary {
  cursor: pointer;
  color: var(--text-primary);
  font-weight: 600;
  font-size: 0.95rem;
}

.content-description summary {
  font-size: 1.1rem;
}

.content-description[open] summary {
  margin-bottom: 1rem;
}

.more-hint {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.8rem;
}

.status-control,
.episode-control,
.rating-control,
.notes-control {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.status-control label,
.episode-control label,
.rating-control label,
.notes-control label {
  color: var(--text-primary);
  font-weight: 500;
  font-size: 0.9rem;
}

.status-select,
.episode-input,
.rating-input,
.date-input,
.rewatch-input,
.notes-textarea {
  padding: 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 0.9rem;
  transition: border-color 0.2s ease;
}

.status-select:focus,
.episode-input:focus,
.rating-input:focus,
.date-input:focus,
.rewatch-input:focus,
.notes-textarea:focus {
  outline: none;
  border-color: var(--highlight-color);
}

.dates-control {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0.75rem;
}

.dates-control label {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  color: var(--text-primary);
  font-weight: 500;
  font-size: 0.9rem;
}

.episode-input,
.rating-input,
.date-input,
.rewatch-input {
  width: 100%;
  min-width: 0;
}

.notes-textarea {
  resize: vertical;
  min-height: 80px;
}

.save-watch-btn {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 8px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 0.9rem;
  line-height: 1.15;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  background: linear-gradient(135deg, var(--coral-light), var(--coral-primary));
  color: var(--text-on-accent);
}

.save-watch-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.action-buttons {
  display: flex;
  gap: 1rem;
  margin-top: 1rem;
}

.btn {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 8px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 0.9rem;
  line-height: 1.15;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.btn-primary {
  background: var(--highlight-color);
  color: white;
}

.btn-primary:hover {
  background: var(--highlight-hover);
}

.btn-secondary {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
}

.btn-secondary:hover {
  background: var(--bg-hover);
}

.btn-danger {
  background: var(--error-color);
  color: white;
}

.btn-danger:hover {
  background: var(--error-hover);
}

.empty-state {
  text-align: center;
  padding: 4rem 0;
}

.empty-icon {
  font-size: 4rem;
  margin-bottom: 1rem;
}

.empty-state h3 {
  font-size: 1.5rem;
  margin-bottom: 0.5rem;
  color: var(--text-primary);
}

.empty-state p {
  color: var(--text-secondary);
  margin-bottom: 2rem;
}

@media (max-width: 768px) {
  .details-content {
    grid-template-columns: 1fr;
    gap: 1.5rem;
  }

  .watchlist-toolbar {
    justify-content: stretch;
  }

  .watchlist-toolbar :deep(.sort-by-controls) {
    width: 100%;
    min-width: 0;
    flex: 1 1 100%;
  }

  .watchlist-toolbar :deep(.list-search) {
    max-width: none;
    flex-basis: 100%;
  }

  .list-column-header {
    display: none;
  }

  .item-header {
    grid-template-columns: 40px minmax(0, 1fr) auto auto 1.75rem;
    grid-template-rows: 56px;
    min-height: 56px;
  }

  .item-poster {
    width: 40px;
    height: 56px;
  }

  .item-title-section {
    padding: 0 0.5rem;
  }

  .item-title {
    font-size: 0.85rem;
  }

  .item-status {
    display: none;
  }

  .action-buttons {
    flex-direction: column;
  }

  .btn {
    width: 100%;
  }
}
</style>
