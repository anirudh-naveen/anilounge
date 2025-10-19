<template>
  <div class="search-page">
    <div class="container">
      <!-- Search Header -->
      <div class="search-header">
        <h1 class="search-title">🔍 Search Animated Content</h1>
        <p class="search-subtitle">Find your next favorite animated movie or TV show</p>
      </div>

      <!-- Search Form -->
      <div class="search-form-container">
        <form @submit.prevent="handleSearch" class="search-form">
          <div class="search-input-group">
            <input
              v-model="searchQuery"
              type="text"
              class="search-input"
              placeholder="Search for movies or TV shows..."
              required
            />
            <button type="submit" class="search-btn" :disabled="contentStore.isLoading">
              <span v-if="contentStore.isLoading" class="spinner"></span>
              {{ contentStore.isLoading ? 'Searching...' : 'Search' }}
            </button>
          </div>
        </form>
      </div>

      <!-- Search Results -->
      <div v-if="hasSearched" class="search-results">
        <div v-if="contentStore.isLoading" class="loading-container">
          <div class="spinner"></div>
          <p>Searching for content...</p>
        </div>

        <div v-else-if="hasResults" class="results-container">
          <!-- Movies Results -->
          <div v-if="contentStore.searchResults.movies.length > 0" class="results-section">
            <h2 class="results-title">🎬 Movies</h2>
            <div class="movies-grid">
              <div
                v-for="movie in contentStore.searchResults.movies"
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
                  </div>
                </div>
                <div class="movie-info">
                  <h3 class="movie-title">{{ movie.title }}</h3>
                  <p class="movie-overview">{{ truncateText(movie.overview, 100) }}</p>
                </div>
              </div>
            </div>
          </div>

          <!-- TV Shows Results -->
          <div v-if="contentStore.searchResults.tv.length > 0" class="results-section">
            <h2 class="results-title">📺 TV Shows</h2>
            <div class="shows-grid">
              <div
                v-for="show in contentStore.searchResults.tv"
                :key="show._id"
                class="show-card"
                @click="viewShowDetails(show)"
              >
                <div class="show-poster">
                  <img
                    :src="getPosterUrl(show.posterPath)"
                    :alt="show.title"
                    @error="handleImageError"
                  />
                  <div class="show-overlay">
                    <div class="show-rating">⭐ {{ show.voteAverage?.toFixed(1) || 'N/A' }}</div>
                  </div>
                </div>
                <div class="show-info">
                  <h3 class="show-title">{{ show.title }}</h3>
                  <p class="show-overview">{{ truncateText(show.overview, 100) }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="no-results">
          <div class="no-results-icon">🔍</div>
          <h3>No results found</h3>
          <p>Try searching for something else or check your spelling</p>
        </div>
      </div>

      <!-- Popular Searches -->
      <div v-else class="popular-searches">
        <h2 class="popular-title">Popular Searches</h2>
        <div class="search-tags">
          <button
            v-for="tag in popularSearches"
            :key="tag"
            @click="searchForTag(tag)"
            class="search-tag"
          >
            {{ tag }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useContentStore } from '@/stores/content'
import { getPosterUrl } from '@/services/api'

const router = useRouter()
const contentStore = useContentStore()

const searchQuery = ref('')
const hasSearched = ref(false)

const popularSearches = [
  'Disney',
  'Pixar',
  'Studio Ghibli',
  'Anime',
  'Cartoon',
  'Spirited Away',
  'Toy Story',
  'Frozen',
  'Avatar',
  'Naruto',
]

const hasResults = computed(() => {
  return contentStore.searchResults.movies.length > 0 || contentStore.searchResults.tv.length > 0
})

const handleSearch = async () => {
  if (!searchQuery.value.trim()) return

  try {
    hasSearched.value = true
    await contentStore.searchContent(searchQuery.value.trim())
  } catch (error) {
    console.error('Search error:', error)
  }
}

const searchForTag = (tag: string) => {
  searchQuery.value = tag
  handleSearch()
}

const viewMovieDetails = (movie: any) => {
  router.push(`/movie/${movie.tmdbId}`)
}

const viewShowDetails = (show: any) => {
  router.push(`/tv/${show.tmdbId}`)
}

const truncateText = (text: string, maxLength: number) => {
  if (!text) return ''
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text
}

const handleImageError = (event: Event) => {
  const img = event.target as HTMLImageElement
  img.src = '/placeholder-movie.jpg'
}
</script>

<style scoped>
.search-page {
  min-height: 100vh;
  padding: 2rem 0;
}

.search-header {
  text-align: center;
  margin-bottom: 3rem;
}

.search-title {
  font-size: 3rem;
  font-weight: 800;
  margin-bottom: 1rem;
  background: linear-gradient(135deg, var(--highlight-color), var(--purple-accent));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.search-subtitle {
  font-size: 1.25rem;
  color: var(--text-secondary);
  max-width: 600px;
  margin: 0 auto;
}

.search-form-container {
  max-width: 600px;
  margin: 0 auto 3rem;
}

.search-form {
  width: 100%;
}

.search-input-group {
  display: flex;
  gap: 1rem;
}

.search-input {
  flex: 1;
  padding: 1rem;
  font-size: 1.1rem;
}

.search-btn {
  padding: 1rem 2rem;
  font-size: 1.1rem;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.loading-container {
  text-align: center;
  padding: 4rem 0;
}

.loading-container p {
  margin-top: 1rem;
  color: var(--text-secondary);
}

.results-container {
  max-width: 1200px;
  margin: 0 auto;
}

.results-section {
  margin-bottom: 3rem;
}

.results-title {
  font-size: 2rem;
  font-weight: 700;
  margin-bottom: 2rem;
  color: var(--text-primary);
}

.movies-grid,
.shows-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1.5rem;
}

.movie-card,
.show-card {
  background: var(--bg-card);
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.3s ease;
  cursor: pointer;
  border: 1px solid var(--border-color);
}

.movie-card:hover,
.show-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-lg);
  border-color: var(--border-hover);
}

.movie-poster,
.show-poster {
  position: relative;
  aspect-ratio: 2/3;
  overflow: hidden;
}

.movie-poster img,
.show-poster img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.movie-overlay,
.show-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.3) 0%, rgba(0, 0, 0, 0.7) 100%);
  display: flex;
  justify-content: flex-start;
  align-items: flex-start;
  padding: 1rem;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.movie-card:hover .movie-overlay,
.show-card:hover .show-overlay {
  opacity: 1;
}

.movie-rating,
.show-rating {
  background: var(--highlight-color);
  color: white;
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
  font-weight: 600;
  font-size: 0.9rem;
}

.movie-info,
.show-info {
  padding: 1rem;
}

.movie-title,
.show-title {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: var(--text-primary);
}

.movie-overview,
.show-overview {
  color: var(--text-secondary);
  font-size: 0.85rem;
  line-height: 1.4;
}

.no-results {
  text-align: center;
  padding: 4rem 0;
}

.no-results-icon {
  font-size: 4rem;
  margin-bottom: 1rem;
}

.no-results h3 {
  font-size: 1.5rem;
  margin-bottom: 0.5rem;
  color: var(--text-primary);
}

.no-results p {
  color: var(--text-secondary);
}

.popular-searches {
  max-width: 800px;
  margin: 0 auto;
  text-align: center;
}

.popular-title {
  font-size: 1.5rem;
  font-weight: 600;
  margin-bottom: 2rem;
  color: var(--text-primary);
}

.search-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  justify-content: center;
}

.search-tag {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  padding: 0.5rem 1rem;
  border-radius: 20px;
  cursor: pointer;
  transition: all 0.3s ease;
  font-size: 0.9rem;
}

.search-tag:hover {
  background: var(--highlight-color);
  border-color: var(--highlight-color);
  transform: translateY(-2px);
}

@media (max-width: 768px) {
  .search-title {
    font-size: 2.5rem;
  }

  .search-input-group {
    flex-direction: column;
  }

  .search-btn {
    justify-content: center;
  }

  .movies-grid,
  .shows-grid {
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 1rem;
  }
}
</style>
