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
            <div
              class="content-type-badge"
              :class="show.contentType === 'movie' ? 'movie-badge' : 'tv-badge'"
            >
              {{ getContentTypeDisplay(show.contentType) }}
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
          <ContentHoverPreview
            :item="show"
            :is-authenticated="authStore.isAuthenticated"
            :in-watchlist="contentStore.isInWatchlist(show._id)"
          />
        </div>
      </div>

      <!-- Empty State -->
      <div v-else class="empty-state">
        <div class="empty-icon">📺</div>
        <h3>No TV shows found</h3>
        <p>We couldn't find any animated TV shows at the moment.</p>
        <button @click="loadTVShows(1)" class="btn btn-primary">Refresh</button>
      </div>

      <PaginationNav
        :current-page="contentStore.tvShowsPagination.currentPage"
        :total-pages="contentStore.tvShowsPagination.totalPages"
        @change="loadTVShows"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useContentStore } from '@/stores/content'
import { useAuthStore } from '@/stores/auth'
import { getPosterUrl, formatGenres, getContentTypeDisplay } from '@/services/api'
import { useToast } from 'vue-toastification'
import PaginationNav from '@/components/PaginationNav.vue'
import ContentHoverPreview from '@/components/ContentHoverPreview.vue'
import type { UnifiedContent } from '@/types/content'

const router = useRouter()
const contentStore = useContentStore()
const authStore = useAuthStore()
const toast = useToast()

// Get TV shows from unified store
const tvShows = computed(() => {
  return contentStore.tvShows
})

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

const handleImageError = (event: Event) => {
  const img = event.target as HTMLImageElement
  img.src = '/placeholder-movie.jpg'
}

const viewShowDetails = (show: UnifiedContent) => {
  // Save current scroll position before navigating
  const scrollKey = `tv-shows-page-${contentStore.tvShowsPagination.currentPage}`
  contentStore.saveScrollPosition(scrollKey)

  router.push({
    name: 'TVShowDetails',
    params: { id: show._id },
    query: { from: `/tv-shows?page=${contentStore.tvShowsPagination.currentPage}` },
  })
}

const loadTVShows = async (page: number) => {
  try {
    await contentStore.getContent(page, 'tv', 20)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  } catch (error) {
    console.error('Error loading TV shows:', error)
    toast.error('Failed to load TV shows. Please try again.')
  }
}

onMounted(async () => {
  try {
    // Always load TV shows when mounting the component to ensure fresh data
    await contentStore.getContent(1, 'tv', 20)

    // Load watchlist if user is authenticated (now optimized to skip if already loaded)
    if (authStore.isAuthenticated) {
      await contentStore.loadWatchlist()
    }
  } catch (error) {
    console.error('Error in TVShows component:', error)
    toast.error('Failed to load TV shows. Please try again.')
  }
})
</script>

<style scoped>
.tvshows-page {
  min-height: 100vh;
  background: linear-gradient(180deg, var(--primary-color) 0%, var(--secondary-color) 100%);
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
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 1rem;
  margin-bottom: 3rem;
}

.show-card {
  position: relative;
  background: white;
  border-radius: 8px;
  overflow: visible;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
  cursor: pointer;
  z-index: 1;
}

.show-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  z-index: 20;
}

.show-poster {
  position: relative;
  aspect-ratio: 2/3;
  overflow: hidden;
  border-radius: 8px 8px 0 0;
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

.show-info {
  padding: 0.6rem 0.7rem 0.75rem;
  border-radius: 0 0 8px 8px;
}

.show-title {
  font-size: 0.85rem;
  font-weight: 600;
  margin-bottom: 0.35rem;
  color: #333;
  line-height: 1.25;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.show-overview {
  display: none;
}

.show-genres {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin-bottom: 0.4rem;
}

.genre-tag {
  background: #f0f0f0;
  color: #666;
  padding: 2px 5px;
  border-radius: 3px;
  font-size: 0.65rem;
  font-weight: 500;
}

.genre-tag:nth-child(n + 2) {
  display: none;
}

.show-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  font-size: 0.7rem;
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
  background: linear-gradient(90deg, var(--coral-light), var(--teal-light));
  color: white;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
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

.content-type-badge {
  position: absolute;
  top: 6px;
  right: 6px;
  color: white;
  padding: 2px 5px;
  border-radius: 3px;
  font-size: 0.65rem;
  font-weight: 600;
  z-index: 2;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  opacity: 0;
  transform: translateY(-5px);
  transition: all 0.3s ease;
}

.movie-badge {
  background: var(--teal-primary);
}

.tv-badge {
  background: var(--coral-primary);
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
    grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
    gap: 0.75rem;
  }
}
</style>
