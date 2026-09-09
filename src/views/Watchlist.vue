<!-- eslint-disable vue/multi-word-component-names -->
<template>
  <div class="watchlist-page">
    <div class="container">
      <!-- Page Header -->
      <div class="page-header">
        <h1 class="page-title">My Watchlist</h1>
        <p class="page-subtitle">Track your animated content progress</p>
      </div>

      <!-- Filter Tabs -->
      <div class="filter-tabs">
        <button
          v-for="status in statusOptions"
          :key="status.value"
          @click="selectedStatus = status.value"
          :class="['tab-btn', { active: selectedStatus === status.value }]"
        >
          {{ status.label }} ({{ getStatusCount(status.value) }})
        </button>
      </div>

      <div class="watchlist-toolbar">
        <SortByControls v-model:sort-by="sortBy" v-model:sort-direction="sortDirection" />
      </div>

      <!-- Loading State -->
      <div v-if="isLoading" class="loading-container">
        <div class="spinner"></div>
        <p>Loading your watchlist...</p>
        <button @click="refreshWatchlist" class="btn btn-secondary">Refresh</button>
      </div>

      <!-- Watchlist Items -->
      <div v-else-if="filteredWatchlist.length > 0" class="watchlist-container">
        <div class="list-column-header">
          <span class="col-poster"></span>
          <span class="col-title">Title</span>
          <span class="col-progress">Progress</span>
          <span class="col-score">Score</span>
          <span class="col-status">Status</span>
          <span class="col-expand"></span>
        </div>

        <div
          v-for="item in filteredWatchlist"
          :key="getContentId(item)"
          class="watchlist-item"
          :class="{ expanded: expandedItems.has(getContentId(item)) }"
        >
          <!-- Compact list bar -->
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
              </div>
            </div>

            <div class="item-progress">
              <div v-if="tracksItemEpisodes(item)" class="episode-progress">
                <span class="episodes-watched">{{ getCurrentEpisodes(item) }}</span>
                <span class="episode-separator">/</span>
                <span class="total-episodes">{{ getTotalEpisodes(item) }}</span>
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
              <span v-if="item.rating" class="rating-value" :style="getRatingStyle(item.rating)">{{
                item.rating
              }}</span>
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

          <!-- Expanded State -->
          <div v-if="expandedItems.has(getContentId(item))" class="item-details">
            <div class="details-content">
              <div class="content-description">
                <h4>Description</h4>
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
              </div>

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
                      <option value="plan_to_watch">Plan to Watch</option>
                      <option value="watching">Watching</option>
                      <option value="completed">Completed</option>
                      <option value="dropped">Dropped</option>
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
                      :max="getTotalEpisodes(item)"
                      class="episode-input"
                    />
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
                      <option v-for="season in getTotalSeasons(item)" :key="season" :value="season">
                        Season {{ season }}
                      </option>
                    </select>
                  </div>

                  <div class="rating-control">
                    <label>Your Rating (1-10):</label>
                    <input
                      :value="getLocalFormData(item).rating || ''"
                      @change="
                        updateLocalFormData(
                          item,
                          'rating',
                          parseInt(($event.target as HTMLInputElement).value) || undefined,
                        )
                      "
                      type="number"
                      min="1"
                      max="10"
                      class="rating-input"
                      placeholder="No rating"
                    />
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
            </div>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div v-else class="empty-state">
        <div class="empty-icon">Watchlist</div>
        <h3>No items in your watchlist</h3>
        <p>Start adding movies and TV shows to track your progress!</p>
        <router-link to="/movies" class="btn btn-primary">Browse Movies</router-link>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
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
import { getRatingColorHSL } from '@/utils/ratingColors'
import { getTotalVoteCount, getWeightedAverage } from '@/utils/ratings'
import { useToast } from 'vue-toastification'
import type { WatchlistItem, TVShow } from '@/types'
import SortByControls from '@/components/SortByControls.vue'
import { applySort, type SortByOption, type SortDirection } from '@/utils/sorting'

const router = useRouter()
const contentStore = useContentStore()
const authStore = useAuthStore()
const toast = useToast()

const selectedStatus = ref('all')
const isLoading = ref(false)
const expandedItems = ref(new Set<string>())
const sortBy = ref<SortByOption>('relevance')
const sortDirection = ref<SortDirection>('desc')

const statusOptions = [
  { value: 'all', label: 'All' },
  { value: 'plan_to_watch', label: 'Plan to Watch' },
  { value: 'watching', label: 'Watching' },
  { value: 'completed', label: 'Completed' },
  { value: 'dropped', label: 'Dropped' },
]

const getStatusCount = (status: string) => {
  if (status === 'all') return contentStore.watchlist.length
  return contentStore.watchlist.filter((item) => item.status === status).length
}

const getStatusLabel = (status: string) => {
  const option = statusOptions.find((opt) => opt.value === status)
  return option ? option.label : status
}

const getStatusClass = (status: string) => {
  return `status-${status.replace(/_/g, '-')}`
}

const getContentId = (item: WatchlistItem) => {
  if (typeof item === 'string') return item
  return typeof item.content === 'string' ? item.content : item.content?._id
}

const getRatingStyle = (rating: number | undefined) => {
  const color = getRatingColorHSL(rating)
  return {
    color: color,
    fontWeight: 'bold',
  }
}

const getContentTitle = (item: WatchlistItem) => {
  if (typeof item === 'string') return 'Unknown Title'
  if (typeof item.content === 'string') return 'Unknown Title'
  return item.content?.title || 'Unknown Title'
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
  return content.contentType === 'tv'
    ? (content as unknown as TVShow).numberOfSeasons || 'Unknown'
    : 'N/A'
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
  return content.contentType === 'tv'
    ? (content as unknown as TVShow).numberOfEpisodes || item.totalEpisodes || 0
    : 0
}

const getTotalSeasons = (item: WatchlistItem) => {
  if (typeof item === 'string') return 1
  if (typeof item.content === 'string') return 1
  const content = item.content
  if (!content) return 1
  return content.contentType === 'tv'
    ? (content as unknown as TVShow).numberOfSeasons || item.totalSeasons || 1
    : 1
}

const hasNewEpisodes = (item: WatchlistItem) => {
  if (typeof item === 'string') return false
  if (typeof item.content === 'string') return false
  const current = getCurrentEpisodes(item)
  const total = getTotalEpisodes(item)
  return current < total
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

const filteredWatchlist = computed(() => {
  const items =
    selectedStatus.value === 'all'
      ? contentStore.watchlist
      : contentStore.watchlist.filter((item) => item.status === selectedStatus.value)

  return applySort(
    items,
    sortBy.value,
    sortDirection.value,
    getContentTitle,
    getWatchlistRatingValue,
    getWatchlistPopularity,
    getWatchlistAddedAt,
  )
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
      rating: number | undefined
      notes: string
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
      rating: item.rating,
      notes: item.notes || '',
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
      currentSeason:
        ((existingData as Record<string, unknown>).currentSeason as number) ||
        item.currentSeason ||
        1,
      rating: existingData.rating || item.rating,
      notes: existingData.notes || item.notes || '',
    }
  }

  return {
    status: item.status || 'plan_to_watch',
    currentEpisode: item.currentEpisode || 0,
    currentSeason: item.currentSeason || 1,
    rating: item.rating,
    notes: item.notes || '',
  }
}

// Local form data interface
interface LocalFormData {
  status: string
  currentEpisode: number
  currentSeason: number
  rating: number | undefined
  notes: string
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
  } else if (field === 'currentEpisode') {
    currentData.currentEpisode = value as number
  } else if (field === 'currentSeason') {
    currentData.currentSeason = value as number
  } else if (field === 'rating') {
    currentData.rating = value as number | undefined
  } else if (field === 'notes') {
    currentData.notes = value as string
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
      status: formData.status as 'plan_to_watch' | 'watching' | 'completed' | 'dropped',
      currentEpisode: formData.currentEpisode,
      rating: formData.rating,
      notes: formData.notes,
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

const handleImageError = (event: Event) => {
  const img = event.target as HTMLImageElement
  img.src = '/placeholder-movie.jpg'
}

const refreshWatchlist = async () => {
  if (isLoading.value) return

  if (!authStore.isAuthenticated) {
    router.push('/login')
    return
  }

  isLoading.value = true

  const timeout = setTimeout(() => {
    isLoading.value = false
    toast.error('Loading timeout - please try again')
  }, 5000)

  try {
    // Use the proper content store method to load watchlist
    await contentStore.loadWatchlist(true) // Force reload
    toast.success('Watchlist refreshed')
  } catch (error: unknown) {
    console.error('Error refreshing watchlist:', error)
    toast.error('Failed to refresh watchlist')
    if (error && typeof error === 'object' && 'response' in error) {
      const axiosError = error as { response?: { status?: number } }
      if (axiosError.response?.status === 401) {
        router.push('/login')
      }
    }
  } finally {
    clearTimeout(timeout)
    isLoading.value = false
  }
}

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
  font-size: 2.5rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
  color: var(--text-primary);
}

.page-subtitle {
  color: var(--text-secondary);
  font-size: 1.1rem;
}

.filter-tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
  justify-content: center;
}

.tab-btn {
  padding: 0.75rem 1.5rem;
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  color: var(--text-primary);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-weight: 500;
}

.tab-btn:hover {
  background: var(--bg-hover);
  border-color: var(--border-hover);
}

.tab-btn.active {
  background: var(--highlight-color);
  color: white;
  border-color: var(--highlight-color);
}

.watchlist-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 1.25rem;
}

.watchlist-toolbar :deep(.sort-by-controls) {
  min-width: 240px;
}

.loading-container {
  text-align: center;
  padding: 4rem 0;
}

.loading-container p {
  margin-top: 1rem;
  color: var(--text-secondary);
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

.content-description h4,
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
  display: flex;
  flex-direction: column;
  gap: 1rem;
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
.notes-textarea:focus {
  outline: none;
  border-color: var(--highlight-color);
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
  background: linear-gradient(135deg, var(--coral-primary), var(--teal-primary));
  color: white;
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
