<!-- eslint-disable vue/multi-word-component-names -->
<template>
  <div class="movies-page">
    <div class="container">
      <!-- Page Header -->
      <div class="page-header">
        <h1 class="page-title">Animated Movies</h1>
        <p class="page-subtitle">Discover amazing animated films from around the world</p>
      </div>

      <!-- Loading State -->
      <div v-if="contentStore.moviesLoading" class="loading-container">
        <div class="spinner"></div>
        <p>Loading amazing movies...</p>
      </div>

      <!-- Error State -->
      <div v-else-if="contentStore.error" class="error-state">
        <div class="error-icon">⚠️</div>
        <h3>Failed to load movies</h3>
        <p>{{ contentStore.error }}</p>
        <button @click="loadMovies(1)" class="btn btn-primary">Try Again</button>
      </div>

      <!-- Movies Grid -->
      <div v-else-if="movies.length > 0" class="movies-grid">
        <div
          v-for="movie in movies"
          :key="movie._id"
          class="movie-card"
          @click="viewMovieDetails(movie)"
        >
          <div class="movie-poster">
            <img
              :src="getPosterUrl(movie.posterPath || '')"
              :alt="movie.title"
              @error="handleImageError"
            />
            <div
              class="content-type-badge"
              :class="movie.contentType === 'movie' ? 'movie-badge' : 'tv-badge'"
            >
              {{ getContentTypeDisplay(movie.contentType) }}
            </div>
            <div class="movie-overlay">
              <div class="movie-rating" :style="getRatingStyle(movie)">
                {{ getDisplayRating(movie) }}
              </div>
              <div class="movie-actions">
                <button
                  v-if="authStore.isAuthenticated"
                  @click.stop="handleWatchlistClick(movie._id)"
                  class="action-btn"
                  :class="{ 'in-watchlist': contentStore.isInWatchlist(movie._id) }"
                >
                  {{ contentStore.isInWatchlist(movie._id) ? '✓' : '+' }}
                </button>
              </div>
            </div>
          </div>
          <div class="movie-info">
            <h3 class="movie-title">{{ movie.title }}</h3>
            <p class="movie-overview">{{ truncateText(movie.overview, 120) }}</p>
            <div class="movie-genres">
              <span
                v-for="genre in getDisplayGenres(movie.genres)?.slice(0, 3)"
                :key="genre"
                class="genre-tag"
              >
                {{ genre }}
              </span>
            </div>
            <div class="movie-meta">
              <span v-if="movie.releaseDate" class="release-year">
                {{ getReleaseYear(movie.releaseDate) }}
              </span>
              <span v-if="movie.runtime" class="runtime"> {{ movie.runtime }} min </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div v-else class="empty-state">
        <div class="empty-icon">🎬</div>
        <h3>No movies found</h3>
        <p>We couldn't find any animated movies at the moment.</p>
        <button @click="loadMovies(1)" class="btn btn-primary">Refresh</button>
      </div>

      <!-- Pagination -->
      <div v-if="contentStore.moviesPagination.totalPages > 1" class="pagination">
        <button
          @click="loadMovies(contentStore.moviesPagination.currentPage - 1)"
          :disabled="!contentStore.moviesPagination.hasPrevPage"
          class="btn btn-secondary"
        >
          Previous
        </button>
        <span class="pagination-info">
          Page {{ contentStore.moviesPagination.currentPage }} of
          {{ contentStore.moviesPagination.totalPages }}
        </span>
        <button
          @click="loadMovies(contentStore.moviesPagination.currentPage + 1)"
          :disabled="!contentStore.moviesPagination.hasNextPage"
          class="btn btn-secondary"
        >
          Next
        </button>
      </div>

      <!-- Status Dropdown -->
      <StatusDropdown
        :show-dropdown="showStatusDropdown"
        :content-id="selectedContentId"
        content-type="movie"
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
import { getRatingTextStyle } from '@/utils/ratingColors'
import { useToast } from 'vue-toastification'
import StatusDropdown from '@/components/StatusDropdown.vue'
import type { UnifiedContent } from '@/types/content'

const router = useRouter()
const contentStore = useContentStore()
const authStore = useAuthStore()
const toast = useToast()

const showStatusDropdown = ref(false)
const selectedContentId = ref('')

// Get movies from unified store
const movies = computed(() => {
  return contentStore.movies
})

// Helper functions
const getDisplayRating = (movie: UnifiedContent) => {
  const rating = movie.unifiedScore
  return rating ? rating.toFixed(1) : 'N/A'
}

const getRatingStyle = (movie: UnifiedContent) => {
  return getRatingTextStyle(movie.unifiedScore)
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

const viewMovieDetails = (movie: UnifiedContent) => {
  // Save current scroll position before navigating
  const scrollKey = `movies-page-${contentStore.moviesPagination.currentPage}`
  contentStore.saveScrollPosition(scrollKey)

  router.push({
    name: 'MovieDetails',
    params: { id: movie._id },
    query: { from: `/movies?page=${contentStore.moviesPagination.currentPage}` },
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

const loadMovies = async (page: number) => {
  try {
    await contentStore.getContent(page, 'movie', 20)
  } catch (error) {
    console.error('Error loading movies:', error)
    toast.error('Failed to load movies. Please try again.')
  }
}

onMounted(async () => {
  try {
    // Always load movies when mounting the component to ensure fresh data
    await contentStore.getContent(1, 'movie', 20)

    // Load watchlist if user is authenticated (now optimized to skip if already loaded)
    if (authStore.isAuthenticated) {
      await contentStore.loadWatchlist()
    }
  } catch (error) {
    console.error('Error in Movies component:', error)
    toast.error('Failed to load movies. Please try again.')
  }
})
</script>

<style scoped>
.movies-page {
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

.movies-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 2rem;
  margin-bottom: 3rem;
}

.movie-card {
  background: white;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
  cursor: pointer;
}

.movie-card:hover {
  transform: translateY(-8px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
}

.movie-poster {
  position: relative;
  aspect-ratio: 2/3;
  overflow: hidden;
}

.movie-poster img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s ease;
}

.movie-card:hover .movie-poster img {
  transform: scale(1.05);
}

.movie-overlay {
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

.movie-card:hover .movie-overlay {
  opacity: 1;
}

.movie-rating {
  padding: 4px 8px;
  border-radius: 4px;
  font-weight: 600;
  font-size: 0.9rem;
  align-self: flex-start;
}

.movie-actions {
  position: absolute;
  bottom: 8px;
  right: 8px;
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

.movie-info {
  padding: 1.5rem;
}

.movie-title {
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: #333;
  line-height: 1.3;
}

.movie-overview {
  color: #666;
  font-size: 0.9rem;
  line-height: 1.5;
  margin-bottom: 1rem;
}

.movie-genres {
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

.movie-meta {
  display: flex;
  gap: 1rem;
  font-size: 0.8rem;
  color: #999;
}

.release-year,
.runtime {
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

.movie-badge {
  background: var(--teal-primary);
}

.tv-badge {
  background: var(--coral-primary);
}

.movie-card:hover .content-type-badge {
  opacity: 1;
  transform: translateY(0);
}

@media (max-width: 768px) {
  .page-title {
    font-size: 2rem;
  }

  .movies-grid {
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1.5rem;
  }

  .pagination {
    flex-direction: column;
    gap: 0.5rem;
  }
}
</style>
