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

      <!-- Loading State -->
      <div v-if="isLoading" class="loading-container">
        <div class="spinner"></div>
        <p>Loading your watchlist...</p>
        <button @click="refreshWatchlist" class="btn btn-secondary">Refresh</button>
      </div>

      <!-- Watchlist Items -->
      <div v-else-if="filteredWatchlist.length > 0" class="watchlist-container">
        <div
          v-for="item in filteredWatchlist"
          :key="getContentId(item)"
          class="watchlist-item"
          :class="{ expanded: expandedItems.has(getContentId(item)) }"
        >
          <!-- Collapsed State -->
          <div class="item-header" @click="toggleExpanded(item)">
            <div class="item-poster">
              <img
                :src="getPosterUrl(getContentPosterPath(item))"
                :alt="getContentTitle(item)"
                @error="handleImageError"
              />
            </div>

            <div class="item-info">
              <div class="item-title-section">
                <h3 class="item-title">{{ getContentTitle(item) }}</h3>
                <div class="item-meta">
                  <span class="item-type">{{ getContentType(item) }}</span>
                  <span class="item-year">{{ getContentYear(item) }}</span>
                  <span class="item-status" :class="getStatusClass(item.status)">
                    {{ getStatusLabel(item.status) }}
                  </span>
                </div>
              </div>

              <div class="item-progress">
                <div v-if="getContentType(item) === 'TV Show'" class="episode-progress">
                  <span class="episodes-watched">{{ getCurrentEpisodes(item) }}</span>
                  <span class="episode-separator">/</span>
                  <span class="total-episodes">{{ getTotalEpisodes(item) }}</span>
                  <span class="episode-label">episodes</span>
                  <span v-if="hasNewEpisodes(item)" class="new-episodes-indicator">🆕</span>
                </div>
                <div v-else class="movie-progress">
                  <span class="movie-status">{{ getContentType(item) }}</span>
                </div>
              </div>

              <div class="item-rating">
                <div v-if="item.rating" class="user-rating">
                  <span class="rating-label">Your Rating:</span>
                  <span class="rating-value" :style="getRatingStyle(item.rating)"
                    >{{ item.rating }}/10</span
                  >
                </div>
                <div v-else class="no-rating">
                  <span class="no-rating-text">No rating yet</span>
                </div>
              </div>
            </div>

            <div class="item-actions">
              <button class="expand-btn">
                {{ expandedItems.has(getContentId(item)) ? '▼' : '▶' }}
              </button>
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
                  <div v-if="getContentType(item) === 'TV Show'" class="info-item">
                    <span class="info-label">Seasons:</span>
                    <span class="info-value">{{ getContentSeasons(item) }}</span>
                  </div>
                  <div class="info-item">
                    <span class="info-label">TMDB Rating:</span>
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

                  <div v-if="getContentType(item) === 'TV Show'" class="episode-control">
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
                    v-if="getContentType(item) === 'TV Show' && getTotalSeasons(item) > 1"
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
import { getPosterUrl } from '@/services/api'
import { getRatingColorHSL } from '@/utils/ratingColors'
import { useToast } from 'vue-toastification'
import type { WatchlistItem, Movie, TVShow } from '@/types'

const router = useRouter()
const contentStore = useContentStore()
const authStore = useAuthStore()
const toast = useToast()

const selectedStatus = ref('all')
const isLoading = ref(false)
const expandedItems = ref(new Set<string>())

const statusOptions = [
  { value: 'all', label: 'All' },
  { value: 'plan_to_watch', label: 'Plan to Watch' },
  { value: 'watching', label: 'Watching' },
  { value: 'completed', label: 'Completed' },
  { value: 'dropped', label: 'Dropped' },
]

const filteredWatchlist = computed(() => {
  if (selectedStatus.value === 'all') {
    return contentStore.watchlist
  }
  return contentStore.watchlist.filter((item) => item.status === selectedStatus.value)
})

const getStatusCount = (status: string) => {
  if (status === 'all') return contentStore.watchlist.length
  return contentStore.watchlist.filter((item) => item.status === status).length
}

const getStatusLabel = (status: string) => {
  const option = statusOptions.find((opt) => opt.value === status)
  return option ? option.label : status
}

const getStatusClass = (status: string) => {
  return `status-${status.replace('_', '-')}`
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
  return item.content?.contentType === 'movie' ? 'Movie' : 'TV Show'
}

const getContentYear = (item: WatchlistItem) => {
  if (typeof item === 'string') return ''
  if (typeof item.content === 'string') return ''
  const content = item.content
  if (!content) return ''
  const date =
    content.contentType === 'movie'
      ? (content as unknown as Movie).releaseDate
      : (content as unknown as TVShow).releaseDate
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
  const date =
    content.contentType === 'movie'
      ? (content as unknown as Movie).releaseDate
      : (content as unknown as TVShow).releaseDate
  return date ? new Date(date).toLocaleDateString() : 'Unknown'
}

const getContentSeasons = (item: WatchlistItem) => {
  if (typeof item === 'string') return 'Unknown'
  if (typeof item.content === 'string') return 'Unknown'
  const content = item.content
  if (!content) return 'Unknown'
  return content.contentType === 'tv' ? (content as unknown as TVShow).numberOfSeasons || 'Unknown' : 'N/A'
}

const getContentRating = (item: WatchlistItem) => {
  if (typeof item === 'string') return 'N/A'
  if (typeof item.content === 'string') return 'N/A'
  return item.content?.unifiedScore?.toFixed(1) || 'N/A'
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
  if (typeof item.content === 'string') return

  const route =
    item.content?.contentType === 'movie'
      ? `/movie/${item.content?.tmdbId}`
      : `/tv/${item.content?.tmdbId}`
  router.push(route)
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
  margin-bottom: 2rem;
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
  gap: 1rem;
}

.watchlist-item {
  background: var(--bg-card);
  border-radius: 12px;
  border: 1px solid var(--border-color);
  overflow: hidden;
  transition: all 0.3s ease;
}

.watchlist-item:hover {
  border-color: var(--border-hover);
  box-shadow: var(--shadow-md);
}

.item-header {
  display: flex;
  align-items: center;
  padding: 1rem;
  cursor: pointer;
  gap: 1rem;
}

.item-poster {
  flex-shrink: 0;
  width: 80px;
  height: 120px;
  border-radius: 8px;
  overflow: hidden;
}

.item-poster img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.item-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.item-title-section {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.item-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.item-meta {
  display: flex;
  gap: 1rem;
  font-size: 0.9rem;
  color: var(--text-secondary);
}

.item-type {
  font-weight: 500;
}

.item-year {
  color: var(--text-muted);
}

.item-status {
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: 500;
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

.item-progress {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.episode-progress {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.9rem;
  color: var(--text-secondary);
}

.episodes-watched {
  font-weight: 600;
  color: var(--text-primary);
}

.total-episodes {
  color: var(--text-muted);
}

.episode-label {
  color: var(--text-muted);
  font-size: 0.8rem;
}

.new-episodes-indicator {
  font-size: 0.8rem;
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
  color: var(--text-secondary);
}

.item-rating {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.user-rating {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
}

.rating-label {
  color: var(--text-secondary);
}

.rating-value {
  font-weight: 600;
}

.no-rating {
  font-size: 0.9rem;
  color: var(--text-muted);
}

.item-actions {
  flex-shrink: 0;
}

.expand-btn {
  background: none;
  border: none;
  font-size: 1.2rem;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0.5rem;
  border-radius: 50%;
  transition: all 0.2s ease;
}

.expand-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
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

  .item-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 1rem;
  }

  .item-poster {
    width: 100%;
    height: 200px;
  }

  .action-buttons {
    flex-direction: column;
  }

  .btn {
    width: 100%;
  }
}
</style>
