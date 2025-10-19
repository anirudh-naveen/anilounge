<template>
  <div class="movie-details">
    <div class="back-button" @click="goBack">
      <i class="fas fa-arrow-left"></i>
      Back
    </div>

    <div v-if="loading" class="loading">
      <div class="spinner"></div>
      <p>Loading movie details...</p>
    </div>

    <div v-else-if="error" class="error">
      <h2>Error loading movie</h2>
      <p>{{ error }}</p>
      <button @click="goBack" class="btn-primary">Go Back</button>
    </div>

    <div v-else-if="movie" class="movie-content">
      <div class="movie-header">
        <div class="movie-poster">
          <img
            v-if="movie.posterPath"
            :src="`https://image.tmdb.org/t/p/w500${movie.posterPath}`"
            :alt="movie.title"
            @error="handleImageError"
          />
          <div v-else class="no-poster">
            <i class="fas fa-film"></i>
            <p>No poster available</p>
          </div>
        </div>

        <div class="movie-info">
          <h1 class="movie-title">{{ movie.title }}</h1>
          <p
            v-if="movie.originalTitle && movie.originalTitle !== movie.title"
            class="original-title"
          >
            Original Title: {{ movie.originalTitle }}
          </p>

          <div class="movie-meta">
            <div class="rating">
              <i class="fas fa-star"></i>
              <span>{{ movie.unifiedScore?.toFixed(1) || 'N/A' }}</span>
              <span class="vote-count">({{ movie.voteCount || 0 }} votes)</span>
            </div>

            <div class="release-date">
              <i class="fas fa-calendar"></i>
              <span>{{ formatDate(movie.releaseDate) }}</span>
            </div>

            <div v-if="movie.runtime" class="runtime">
              <i class="fas fa-clock"></i>
              <span>{{ movie.runtime }} minutes</span>
            </div>
          </div>

          <div class="genres">
            <span
              v-for="genre in movie.genres"
              :key="typeof genre === 'string' ? genre : genre.name || genre.id"
              class="genre-tag"
            >
              {{ typeof genre === 'string' ? genre : genre.name }}
            </span>
          </div>

          <div class="movie-actions">
            <button
              v-if="!isInWatchlist"
              @click="showStatusDropdown = true"
              class="btn-primary add-to-watchlist"
            >
              <i class="fas fa-plus"></i>
              Add to Watchlist
            </button>

            <button v-else @click="removeFromWatchlist" class="btn-secondary remove-from-watchlist">
              <i class="fas fa-check"></i>
              In Watchlist
            </button>

            <button @click="shareMovie" class="btn-outline">
              <i class="fas fa-share"></i>
              Share
            </button>
          </div>
        </div>
      </div>

      <div class="movie-description">
        <h2>Overview</h2>
        <p>{{ movie.overview || 'No overview available.' }}</p>
      </div>

      <div v-if="movie.productionCompanies?.length" class="production-info">
        <h3>Production Companies</h3>
        <div class="companies">
          <span
            v-for="company in movie.productionCompanies"
            :key="`company-${company.id || company._id || company.name}`"
            class="company-tag"
          >
            {{ company.name }}
          </span>
        </div>
      </div>

      <div v-if="movie.productionCountries?.length" class="production-info">
        <h3>Production Countries</h3>
        <div class="countries">
          <span
            v-for="country in movie.productionCountries"
            :key="country.iso_3166_1"
            class="country-tag"
          >
            {{ country.name }}
          </span>
        </div>
      </div>
    </div>

    <!-- Status Dropdown -->
    <StatusDropdown
      v-if="showStatusDropdown"
      :show-dropdown="showStatusDropdown"
      :content-id="movie?._id || ''"
      :content-type="'movie'"
      @close="showStatusDropdown = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useContentStore } from '@/stores/content'
import { useAuthStore } from '@/stores/auth'
import { contentAPI } from '@/services/api'
import StatusDropdown from '@/components/StatusDropdown.vue'
import type { UnifiedContent } from '@/types/content'

const route = useRoute()
const router = useRouter()
const contentStore = useContentStore()
const authStore = useAuthStore()

const movie = ref<UnifiedContent | null>(null)
const loading = ref(true)
const error = ref('')
const showStatusDropdown = ref(false)

const isInWatchlist = computed(() => {
  if (!movie.value || !authStore.user?.watchlist) return false
  return authStore.user.watchlist.some((item) => item.content._id === movie.value?._id)
})

onMounted(async () => {
  const movieId = route.params.id as string
  if (!movieId) {
    error.value = 'No movie ID provided'
    loading.value = false
    return
  }

  try {
    // Try to get movie from store first
    const existingMovie = contentStore.movies.find((m) => m._id === movieId)
    if (existingMovie) {
      movie.value = existingMovie
      loading.value = false
      return
    }

    // If not in store, fetch from API
    const response = await contentAPI.getContentById(movieId)
    movie.value = response.data.data
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load movie'
  } finally {
    loading.value = false
  }
})

const goBack = () => {
  // Check if we have a previous page in the route state
  const previousPage = route.query.from as string
  if (previousPage) {
    router.push(previousPage)
  } else {
    // Default fallback to movies page
    router.push('/movies')
  }
}

const removeFromWatchlist = async () => {
  if (!movie.value) return

  try {
    await contentStore.removeFromWatchlist(movie.value._id)
  } catch (err) {
    console.error('Failed to remove from watchlist:', err)
  }
}

const shareMovie = () => {
  if (navigator.share && movie.value) {
    navigator.share({
      title: movie.value.title,
      text: movie.value.overview,
      url: window.location.href,
    })
  } else {
    // Fallback: copy to clipboard
    navigator.clipboard.writeText(window.location.href)
    // You could add a toast notification here
  }
}

const formatDate = (date: string | Date) => {
  if (!date) return 'N/A'
  const dateObj = typeof date === 'string' ? new Date(date) : date
  return dateObj.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

const handleImageError = (event: Event) => {
  const img = event.target as HTMLImageElement
  img.style.display = 'none'
}
</script>

<style scoped>
.movie-details {
  min-height: 100vh;
  background: var(--bg-primary);
  color: var(--text-primary);
  padding: 2rem;
}

.back-button {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 2rem;
  padding: 0.5rem 1rem;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  width: fit-content;
}

.back-button:hover {
  background: var(--bg-hover);
  transform: translateX(-2px);
}

.loading,
.error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 50vh;
  text-align: center;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid var(--border-color);
  border-top: 4px solid var(--highlight-color);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 1rem;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.movie-content {
  max-width: 1200px;
  margin: 0 auto;
}

.movie-header {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 2rem;
  margin-bottom: 3rem;
}

.movie-poster {
  position: relative;
}

.movie-poster img {
  width: 100%;
  height: auto;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.no-poster {
  width: 100%;
  height: 450px;
  background: var(--bg-card);
  border: 2px dashed var(--border-color);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}

.no-poster i {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.movie-info {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.movie-title {
  font-size: 2.5rem;
  font-weight: 700;
  margin: 0;
  line-height: 1.2;
}

.original-title {
  font-size: 1.1rem;
  color: var(--text-muted);
  font-style: italic;
  margin: 0;
}

.movie-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 1.5rem;
  margin: 1rem 0;
}

.movie-meta > div {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1rem;
}

.movie-meta i {
  color: var(--highlight-color);
  width: 16px;
}

.vote-count {
  color: var(--text-muted);
  font-size: 0.9rem;
}

.genres {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 1rem 0;
}

.genre-tag {
  background: var(--highlight-color);
  color: white;
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
  font-size: 0.9rem;
  font-weight: 500;
}

.movie-actions {
  display: flex;
  gap: 1rem;
  margin-top: 1.5rem;
}

.btn-primary,
.btn-secondary,
.btn-outline {
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.btn-primary {
  background: var(--highlight-color);
  color: white;
  border: none;
}

.btn-primary:hover {
  background: var(--purple-accent);
  transform: translateY(-2px);
}

.btn-secondary {
  background: var(--success-color);
  color: white;
  border: none;
}

.btn-secondary:hover {
  background: var(--success-color);
  opacity: 0.9;
}

.btn-outline {
  background: transparent;
  color: var(--text-primary);
  border: 2px solid var(--border-color);
}

.btn-outline:hover {
  background: var(--bg-hover);
  border-color: var(--highlight-color);
}

.movie-description {
  margin-bottom: 2rem;
}

.movie-description h2 {
  font-size: 1.5rem;
  margin-bottom: 1rem;
  color: var(--text-primary);
}

.movie-description p {
  font-size: 1.1rem;
  line-height: 1.6;
  color: var(--text-muted);
}

.production-info {
  margin-bottom: 2rem;
}

.production-info h3 {
  font-size: 1.2rem;
  margin-bottom: 0.5rem;
  color: var(--text-primary);
}

.companies,
.countries {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.company-tag,
.country-tag {
  background: var(--bg-card);
  color: var(--text-primary);
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
  font-size: 0.9rem;
  border: 1px solid var(--border-color);
}

@media (max-width: 768px) {
  .movie-details {
    padding: 1rem;
  }

  .movie-header {
    grid-template-columns: 1fr;
    gap: 1.5rem;
  }

  .movie-title {
    font-size: 2rem;
  }

  .movie-meta {
    flex-direction: column;
    gap: 0.5rem;
  }

  .movie-actions {
    flex-direction: column;
  }
}
</style>
