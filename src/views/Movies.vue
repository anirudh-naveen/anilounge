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
            <div class="content-type-badge movie-badge">Movie</div>
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
          <ContentHoverPreview
            :item="movie"
            :is-authenticated="authStore.isAuthenticated"
            :in-watchlist="contentStore.isInWatchlist(movie._id)"
          />
        </div>
      </div>

      <!-- Empty State -->
      <div v-else class="empty-state">
        <div class="empty-icon">🎬</div>
        <h3>No movies found</h3>
        <p>We couldn't find any animated movies at the moment.</p>
        <button @click="loadMovies(1)" class="btn btn-primary">Refresh</button>
      </div>

      <PaginationNav
        :current-page="contentStore.moviesPagination.currentPage"
        :total-pages="contentStore.moviesPagination.totalPages"
        @change="loadMovies"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useContentStore } from '@/stores/content'
import { useAuthStore } from '@/stores/auth'
import { getPosterUrl, formatGenres } from '@/services/api'
import { useToast } from 'vue-toastification'
import PaginationNav from '@/components/PaginationNav.vue'
import ContentHoverPreview from '@/components/ContentHoverPreview.vue'
import type { UnifiedContent } from '@/types/content'

const router = useRouter()
const contentStore = useContentStore()
const authStore = useAuthStore()
const toast = useToast()

// Get movies from unified store
const movies = computed(() => {
  return contentStore.movies
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

const loadMovies = async (page: number) => {
  try {
    await contentStore.getContent(page, 'movie', 20)
    window.scrollTo({ top: 0, behavior: 'smooth' })
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
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 1rem;
  margin-bottom: 3rem;
}

.movie-card {
  position: relative;
  background: white;
  border-radius: 8px;
  overflow: visible;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
  cursor: pointer;
  z-index: 1;
}

.movie-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  z-index: 20;
}

.movie-poster {
  position: relative;
  aspect-ratio: 2/3;
  overflow: hidden;
  border-radius: 8px 8px 0 0;
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

.movie-info {
  padding: 0.6rem 0.7rem 0.75rem;
  border-radius: 0 0 8px 8px;
}

.movie-title {
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

.movie-overview {
  display: none;
}

.movie-genres {
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

.movie-meta {
  display: flex;
  gap: 0.35rem;
  font-size: 0.7rem;
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

.movie-card:hover .content-type-badge {
  opacity: 1;
  transform: translateY(0);
}

@media (max-width: 768px) {
  .page-title {
    font-size: 2rem;
  }

  .movies-grid {
    grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
    gap: 0.75rem;
  }
}
</style>
