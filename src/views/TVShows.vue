<!-- eslint-disable vue/multi-word-component-names -->
<template>
  <div class="tvshows-page">
    <div class="container">
      <!-- Page Header -->
      <div class="page-header">
        <h1 class="page-title">Animated TV Shows</h1>
        <p class="page-subtitle">Discover amazing animated series from around the world</p>
      </div>

      <!-- Loading State -->
      <div v-if="contentStore.tvShowsLoading" class="loading-container">
        <div class="spinner"></div>
        <p>Loading amazing TV shows...</p>
      </div>

      <!-- Error State -->
      <div v-else-if="contentStore.error" class="error-state">
        <div class="error-icon">⚠️</div>
        <h3>Failed to load TV shows</h3>
        <p>{{ contentStore.error }}</p>
        <button @click="loadTVShows(1)" class="btn btn-primary">Try Again</button>
      </div>

      <!-- TV Shows Grid -->
      <div v-else-if="tvShows.length > 0" class="tvshows-grid">
        <div
          v-for="show in tvShows"
          :key="show._id"
          class="show-card"
          @click="viewShowDetails(show)"
        >
          <div class="show-poster">
            <img
              :src="getPosterUrl(show.posterPath || '')"
              :alt="show.title"
              @error="handleImageError"
            />
            <div class="content-type-badge">
              {{ getContentTypeDisplay(show.contentType) }}
            </div>
            <div class="show-overlay">
              <div class="show-rating">{{ getDisplayRating(show) }}</div>
              <div class="show-actions">
                <button
                  v-if="authStore.isAuthenticated"
                  @click.stop="handleWatchlistClick(show._id)"
                  class="action-btn"
                  :class="{ 'in-watchlist': contentStore.isInWatchlist(show._id) }"
                >
                  {{ contentStore.isInWatchlist(show._id) ? '✓' : '+' }}
                </button>
              </div>
            </div>
          </div>
          <div class="show-info">
            <h3 class="show-title">{{ show.title }}</h3>
            <p class="show-overview">{{ truncateText(show.overview, 120) }}</p>
            <div class="show-genres">
              <span
                v-for="genre in getDisplayGenres(show.genres)?.slice(0, 3)"
                :key="genre"
                class="genre-tag"
              >
                {{ genre }}
              </span>
            </div>
            <div class="show-meta">
              <span v-if="show.releaseDate" class="release-year">
                {{ getReleaseYear(show.releaseDate) }}
              </span>
              <span v-if="show.episodeCount || show.malEpisodes" class="episodes">
                {{ show.episodeCount || show.malEpisodes }} episodes
              </span>
              <span v-if="show.seasonCount" class="seasons"> {{ show.seasonCount }} seasons </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div v-else class="empty-state">
        <div class="empty-icon">📺</div>
        <h3>No TV shows found</h3>
        <p>We couldn't find any animated TV shows at the moment.</p>
        <button @click="loadTVShows(1)" class="btn btn-primary">Refresh</button>
      </div>

      <!-- Pagination -->
      <div v-if="contentStore.tvShowsPagination.totalPages > 1" class="pagination">
        <button
          @click="loadTVShows(contentStore.tvShowsPagination.currentPage - 1)"
          :disabled="!contentStore.tvShowsPagination.hasPrevPage"
          class="btn btn-secondary"
        >
          Previous
        </button>
        <span class="pagination-info">
          Page {{ contentStore.tvShowsPagination.currentPage }} of
          {{ contentStore.tvShowsPagination.totalPages }}
        </span>
        <button
          @click="loadTVShows(contentStore.tvShowsPagination.currentPage + 1)"
          :disabled="!contentStore.tvShowsPagination.hasNextPage"
          class="btn btn-secondary"
        >
          Next
        </button>
      </div>

      <!-- Status Dropdown -->
      <StatusDropdown
        :show-dropdown="showStatusDropdown"
        :content-id="selectedContentId"
        content-type="tv"
        @close="closeStatusDropdown"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useContentStore } from '@/stores/content'
import { useAuthStore } from '@/stores/auth'
import { getPosterUrl, formatGenres, getContentTypeDisplay } from '@/services/api'
import { useToast } from 'vue-toastification'
import StatusDropdown from '@/components/StatusDropdown.vue'
import type { UnifiedContent } from '@/types/content'

const router = useRouter()
const contentStore = useContentStore()
const authStore = useAuthStore()
const toast = useToast()

const showStatusDropdown = ref(false)
const selectedContentId = ref('')

// Get TV shows from unified store
const tvShows = computed(() => {
  return contentStore.tvShows
})

// Helper functions
const getDisplayRating = (show: UnifiedContent) => {
  const rating = show.unifiedScore
  return rating ? rating.toFixed(1) : 'N/A'
}

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

const handleImageError = (event: Event) => {
  const img = event.target as HTMLImageElement
  img.src = '/placeholder-movie.jpg'
}

const viewShowDetails = (show: UnifiedContent) => {
  router.push({ 
    name: 'TVDetails', 
    params: { id: show._id },
    query: { from: `/tv?page=${contentStore.tvShowsPagination.currentPage}` }
  })
}

const handleWatchlistClick = (contentId: string) => {
  if (!authStore.isAuthenticated) {
    toast.error('Please log in to add items to your watchlist')
    return
  }

  if (contentStore.isInWatchlist(contentId)) {
    toast.info('Already in your watchlist!')
    return
  }

  selectedContentId.value = contentId
  showStatusDropdown.value = true
}

const closeStatusDropdown = () => {
  showStatusDropdown.value = false
  selectedContentId.value = ''
}

const loadTVShows = async (page: number) => {
  try {
    await contentStore.getContent(page, 'tv', 20)
  } catch (error) {
    console.error('Error loading TV shows:', error)
    toast.error('Failed to load TV shows. Please try again.')
  }
}

onMounted(async () => {
  const startTime = Date.now()
  console.log(`📺 [${new Date().toISOString()}] TVShows component mounted`)

  try {
    // Load TV shows if not already loaded
    if (contentStore.tvShows.length === 0) {
      console.log(`📺 [${new Date().toISOString()}] TV shows array empty, loading content...`)
      await contentStore.getContent(1, 'tv', 20)
    } else {
      console.log(
        `📺 [${new Date().toISOString()}] TV shows already loaded (${contentStore.tvShows.length} items), skipping API call`,
      )
    }

    // Load watchlist if user is authenticated (now optimized to skip if already loaded)
    if (authStore.isAuthenticated) {
      console.log(`📺 [${new Date().toISOString()}] User authenticated, loading watchlist...`)
      await contentStore.loadWatchlist()
    } else {
      console.log(`📺 [${new Date().toISOString()}] User not authenticated, skipping watchlist`)
    }

    const totalTime = Date.now() - startTime
    console.log(
      `✅ [${new Date().toISOString()}] TVShows component mounted successfully in ${totalTime}ms`,
    )
  } catch (error) {
    const totalTime = Date.now() - startTime
    console.error(
      `❌ [${new Date().toISOString()}] TVShows component error after ${totalTime}ms:`,
      error,
    )
    toast.error('Failed to load TV shows. Please try again.')
  }
})
</script>

<style scoped>
.tvshows-page {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 2rem 0;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 20px;
}

.page-header {
  text-align: center;
  margin-bottom: 3rem;
  color: white;
}

.page-title {
  font-size: 3rem;
  font-weight: 700;
  margin-bottom: 1rem;
}

.page-subtitle {
  font-size: 1.25rem;
  opacity: 0.9;
}

.tvshows-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 2rem;
  margin-bottom: 3rem;
}

.show-card {
  background: white;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
  cursor: pointer;
}

.show-card:hover {
  transform: translateY(-8px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
}

.show-poster {
  position: relative;
  aspect-ratio: 2/3;
  overflow: hidden;
}

.show-poster img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s ease;
}

.show-card:hover .show-poster img {
  transform: scale(1.05);
}

.show-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(
    to bottom,
    rgba(0, 0, 0, 0.7) 0%,
    rgba(0, 0, 0, 0.3) 50%,
    rgba(0, 0, 0, 0.8) 100%
  );
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 1rem;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.show-card:hover .show-overlay {
  opacity: 1;
}

.show-rating {
  background: rgba(255, 255, 255, 0.9);
  color: #333;
  padding: 4px 8px;
  border-radius: 4px;
  font-weight: 600;
  font-size: 0.9rem;
  align-self: flex-start;
}

.show-actions {
  align-self: flex-end;
}

.action-btn {
  background: rgba(255, 255, 255, 0.9);
  border: none;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s ease;
}

.action-btn:hover {
  background: white;
  transform: scale(1.1);
}

.action-btn.in-watchlist {
  background: #4ecdc4;
  color: white;
}

.show-info {
  padding: 1.5rem;
}

.show-title {
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: #333;
  line-height: 1.3;
}

.show-overview {
  color: #666;
  font-size: 0.9rem;
  line-height: 1.5;
  margin-bottom: 1rem;
}

.show-genres {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.genre-tag {
  background: #f0f0f0;
  color: #666;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.8rem;
  font-weight: 500;
}

.show-meta {
  display: flex;
  gap: 1rem;
  font-size: 0.8rem;
  color: #999;
}

.release-year,
.episodes,
.seasons {
  background: #f8f9fa;
  padding: 2px 6px;
  border-radius: 3px;
}

.loading-container,
.error-state,
.empty-state {
  text-align: center;
  padding: 4rem 0;
  color: white;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid rgba(255, 255, 255, 0.3);
  border-top: 4px solid #4ecdc4;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 1rem;
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
.empty-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.btn {
  display: inline-block;
  padding: 12px 24px;
  border-radius: 8px;
  text-decoration: none;
  font-weight: 600;
  transition: all 0.3s ease;
  border: none;
  cursor: pointer;
}

.btn-primary {
  background: linear-gradient(45deg, #ff6b6b, #4ecdc4);
  color: white;
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.2);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.3);
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
  color: white;
  font-weight: 500;
}

.content-type-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.8rem;
  font-weight: 600;
  z-index: 2;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  opacity: 0;
  transform: translateY(-5px);
  transition: all 0.3s ease;
}

.show-card:hover .content-type-badge {
  opacity: 1;
  transform: translateY(0);
}

@media (max-width: 768px) {
  .page-title {
    font-size: 2rem;
  }

  .tvshows-grid {
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1.5rem;
  }

  .pagination {
    flex-direction: column;
    gap: 0.5rem;
  }
}
</style>
