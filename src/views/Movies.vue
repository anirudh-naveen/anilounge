<!-- eslint-disable vue/multi-word-component-names -->
<template>
  <div class="movies-page">
    <div class="container">
      <!-- Page Header -->
      <div class="page-header">
        <h1 class="page-title">🎬 Animated Movies</h1>
        <p class="page-subtitle">Discover amazing animated films from around the world</p>
      </div>

      <!-- Loading State -->
      <div v-if="contentStore.isLoading" class="loading-container">
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
      <div v-else-if="contentStore.movies.length > 0" class="movies-grid">
        <div
          v-for="movie in contentStore.movies"
          :key="movie._id"
          class="movie-card"
          @click="viewMovieDetails(movie)"
        >
          <div class="movie-poster">
            <img
              :src="getPosterUrl(movie.posterPath)"
              :alt="movie.title"
              @error="handleImageError"
            />
              <div class="movie-overlay">
                <div class="movie-rating">⭐ {{ movie.voteAverage?.toFixed(1) || 'N/A' }}</div>
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
              <span v-for="genre in movie.genres?.slice(0, 3)" :key="genre.id" class="genre-tag">
                {{ genre.name }}
              </span>
            </div>
            <div class="movie-meta">
              <span class="release-year">{{ getReleaseYear(movie.releaseDate) }}</span>
              <span class="runtime" v-if="movie.runtime">{{ movie.runtime }}min</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div v-if="!contentStore.isLoading && contentStore.movies.length === 0" class="empty-state">
        <div class="empty-icon">🎬</div>
        <h3>No movies found</h3>
        <p>Try refreshing the page or check back later</p>
        <button @click="() => loadMovies(1)" class="btn btn-primary">Refresh</button>
      </div>

      <!-- Pagination -->
      <div v-if="contentStore.movies.length > 0" class="pagination">
        <button
          @click="loadPreviousPage"
          :disabled="contentStore.pagination.page <= 1"
          class="btn btn-secondary"
        >
          ← Previous
        </button>
        <span class="page-info">
          Page {{ contentStore.pagination.page }} of {{ contentStore.pagination.totalPages }}
        </span>
        <button
          @click="loadNextPage"
          :disabled="contentStore.pagination.page >= contentStore.pagination.totalPages"
          class="btn btn-secondary"
        >
          Next →
        </button>
      </div>
    </div>

    <!-- Status Dropdown -->
    <StatusDropdown
      :show-dropdown="showStatusDropdown"
      :content-id="selectedContentId"
      content-type="movie"
      @close="closeStatusDropdown"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useContentStore } from '@/stores/content'
import { useAuthStore } from '@/stores/auth'
import { getPosterUrl } from '@/services/api'
import { useToast } from 'vue-toastification'
import type { Movie } from '@/types'
import StatusDropdown from '@/components/StatusDropdown.vue'

const router = useRouter()
const contentStore = useContentStore()
const authStore = useAuthStore()
const toast = useToast()

const currentPage = ref(1)
const showStatusDropdown = ref(false)
const selectedContentId = ref('')

onMounted(async () => {
  await loadMovies()
})

const loadMovies = async (page = 1) => {
  try {
    await contentStore.getMovies(page)
    currentPage.value = page
  } catch (error) {
    console.error('Error loading movies:', error)
  }
}

const loadNextPage = (event?: Event) => {
  event?.preventDefault()
  const nextPage = currentPage.value + 1
  if (nextPage <= contentStore.pagination.totalPages) {
    loadMovies(nextPage)
  }
}

const loadPreviousPage = (event?: Event) => {
  event?.preventDefault()
  const prevPage = currentPage.value - 1
  if (prevPage >= 1) {
    loadMovies(prevPage)
  }
}

const viewMovieDetails = (movie: Movie) => {
  router.push(`/movie/${movie.tmdbId}`)
}

const handleWatchlistClick = (contentId: string) => {
  if (contentStore.isInWatchlist(contentId)) {
    toggleWatchlist(contentId)
  } else {
    selectedContentId.value = contentId
    showStatusDropdown.value = true
  }
}

const closeStatusDropdown = () => {
  showStatusDropdown.value = false
  selectedContentId.value = ''
}

const toggleWatchlist = async (contentId: string) => {
  if (!authStore.isAuthenticated) {
    toast.warning('Please login to add items to your watchlist')
    return
  }

  try {
    if (contentStore.isInWatchlist(contentId)) {
      await contentStore.removeFromWatchlist(contentId)
      toast.success('Removed from watchlist')
    } else {
      await contentStore.addToWatchlist(contentId)
      toast.success('Added to watchlist')
    }
  } catch (error) {
    console.error('Error updating watchlist:', error)
    toast.error('Failed to update watchlist')
  }
}

const truncateText = (text: string, maxLength: number) => {
  if (!text) return ''
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text
}

const getReleaseYear = (dateString: string) => {
  if (!dateString) return 'N/A'
  return new Date(dateString).getFullYear()
}

const handleImageError = (event: Event) => {
  const img = event.target as HTMLImageElement
  img.src = '/placeholder-movie.jpg'
}
</script>

<style scoped>
.movies-page {
  min-height: 100vh;
  padding: 2rem 0;
}

.page-header {
  text-align: center;
  margin-bottom: 3rem;
}

.page-title {
  font-size: 3rem;
  font-weight: 800;
  margin-bottom: 1rem;
  background: linear-gradient(135deg, var(--highlight-color), var(--purple-accent));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.page-subtitle {
  font-size: 1.25rem;
  color: var(--text-secondary);
  max-width: 600px;
  margin: 0 auto;
}

.loading-container {
  text-align: center;
  padding: 4rem 0;
}

.loading-container p {
  margin-top: 1rem;
  color: var(--text-secondary);
}

.movies-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1.5rem;
  margin-bottom: 3rem;
  max-width: 1200px;
  margin-left: auto;
  margin-right: auto;
}

.movie-card {
  background: var(--bg-card);
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.3s ease;
  cursor: pointer;
  border: 1px solid var(--border-color);
}

.movie-card:hover {
  transform: translateY(-8px);
  box-shadow: var(--shadow-lg);
  border-color: var(--border-hover);
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
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.3) 0%, rgba(0, 0, 0, 0.7) 100%);
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
  background: var(--highlight-color);
  color: white;
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
  font-weight: 600;
  font-size: 0.9rem;
  align-self: flex-start;
}

.movie-actions {
  display: flex;
  justify-content: flex-end;
}

.action-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: none;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 1.2rem;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.action-btn:hover {
  background: var(--highlight-color);
  transform: scale(1.1);
}

.action-btn.in-watchlist {
  background: var(--success-color);
}

.movie-info {
  padding: 1.5rem;
}

.movie-title {
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: var(--text-primary);
}

.movie-overview {
  color: var(--text-secondary);
  font-size: 0.9rem;
  line-height: 1.5;
  margin-bottom: 1rem;
}

.movie-genres {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-bottom: 1rem;
}

.genre-tag {
  background: var(--bg-hover);
  color: var(--text-primary);
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: 500;
}

.movie-meta {
  display: flex;
  gap: 1rem;
  font-size: 0.9rem;
  color: var(--text-muted);
}

.error-state {
  text-align: center;
  padding: 4rem 0;
  color: var(--text-secondary);
}

.error-icon {
  font-size: 4rem;
  margin-bottom: 1rem;
}

.error-state h3 {
  font-size: 1.5rem;
  margin-bottom: 1rem;
  color: var(--text-primary);
}

.error-state p {
  margin-bottom: 2rem;
  max-width: 500px;
  margin-left: auto;
  margin-right: auto;
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

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 2rem;
  margin-top: 3rem;
}

.page-info {
  color: var(--text-secondary);
  font-weight: 500;
}

@media (max-width: 768px) {
  .page-title {
    font-size: 2.5rem;
  }

  .movies-grid {
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1.5rem;
  }

  .pagination {
    flex-direction: column;
    gap: 1rem;
  }
}
</style>
