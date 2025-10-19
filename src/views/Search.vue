<!-- eslint-disable vue/multi-word-component-names -->
<template>
  <div class="search-page">
    <div class="container">
      <!-- Search Header -->
      <div class="search-header">
        <h1 class="search-title">Search Animated Content</h1>
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
              @keydown.enter="handleSearch"
              required
            />
            <button type="submit" class="search-btn" :disabled="contentStore.isLoading">
              <span v-if="contentStore.isLoading" class="spinner"></span>
              {{ contentStore.isLoading ? 'Searching...' : 'Search' }}
            </button>
            <button
              type="button"
              class="ai-btn"
              @click="showChatbot = true"
              :disabled="!authStore.isAuthenticated"
            >
              AI Assistant
            </button>
          </div>
        </form>
      </div>

      <!-- Filters Bar -->
      <div v-if="hasSearched" class="filters-container">
        <div class="filters-bar">
          <div class="filter-group">
            <label>Type:</label>
            <select v-model="filters.type" @change="applyFilters">
              <option value="all">All</option>
              <option value="movie">Movies</option>
              <option value="tv">TV Shows</option>
            </select>
          </div>

          <div class="filter-group">
            <label>Genre:</label>
            <select v-model="filters.genre" @change="applyFilters">
              <option value="all">All Genres</option>
              <option value="action">Action</option>
              <option value="adventure">Adventure</option>
              <option value="comedy">Comedy</option>
              <option value="drama">Drama</option>
              <option value="fantasy">Fantasy</option>
              <option value="horror">Horror</option>
              <option value="romance">Romance</option>
              <option value="sci-fi">Sci-Fi</option>
              <option value="thriller">Thriller</option>
              <option value="family">Family</option>
            </select>
          </div>

          <div class="filter-group">
            <label>Rating:</label>
            <input
              type="range"
              v-model="filters.minRating"
              min="0"
              max="10"
              step="0.5"
              @change="applyFilters"
            />
            <span>{{ filters.minRating }}+</span>
          </div>

          <div class="filter-group">
            <label>Year:</label>
            <select v-model="filters.year" @change="applyFilters">
              <option value="all">All Years</option>
              <option v-for="year in years" :key="year" :value="year">{{ year }}</option>
            </select>
          </div>

          <div class="filter-group">
            <label>Sort by:</label>
            <select v-model="filters.sortBy" @change="applyFilters">
              <option value="relevance">Relevance</option>
              <option value="rating">Rating</option>
              <option value="year">Year</option>
              <option value="title">Title</option>
            </select>
          </div>

          <button @click="clearFilters" class="clear-filters-btn">Clear Filters</button>
        </div>
      </div>

      <!-- Search Results -->
      <div v-if="hasSearched" class="search-results">
        <div v-if="contentStore.isLoading" class="loading-container">
          <div class="spinner"></div>
          <p>Searching for content...</p>
        </div>

        <div v-else-if="hasResults" class="results-container">
          <!-- Combined Results -->
          <div v-if="contentStore.searchResults.results.length > 0" class="results-section">
            <h2 class="results-title">Search Results</h2>
            <div class="content-grid">
              <div
                v-for="item in contentStore.searchResults.results"
                :key="item._id"
                class="content-card"
                @click="
                  item.contentType === 'movie' ? viewMovieDetails(item) : viewShowDetails(item)
                "
              >
                <div class="content-poster">
                  <img
                    :src="getPosterUrl(item.posterPath)"
                    :alt="item.title"
                    @error="handleImageError"
                  />
                  <div class="content-overlay">
                    <div class="content-type">{{ item.typeIcon }}</div>
                    <div class="content-rating">{{ item.voteAverage?.toFixed(1) || 'N/A' }}</div>
                    <button
                      class="add-to-watchlist-btn"
                      @click.stop="handleAddToWatchlist(item)"
                      :disabled="contentStore.isInWatchlist(item._id)"
                    >
                      {{ contentStore.isInWatchlist(item._id) ? '✓' : '+' }}
                    </button>
                  </div>
                </div>
                <div class="content-info">
                  <h3 class="content-title">{{ item.title }}</h3>
                  <div class="content-genres">
                    <span
                      v-for="genre in item.genres"
                      :key="typeof genre === 'string' ? genre : genre.name"
                      class="genre-tag"
                      >{{ typeof genre === 'string' ? genre : genre.name }}</span
                    >
                  </div>
                  <p class="content-overview">{{ truncateText(item.overview, 100) }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Pagination -->
        <div v-if="hasResults && pagination.totalPages > 1" class="pagination-container">
          <div class="pagination">
            <button
              @click="goToPage(pagination.page - 1)"
              :disabled="pagination.page <= 1"
              class="pagination-btn"
            >
              ← Previous
            </button>

            <div class="pagination-numbers">
              <button
                v-for="pageNum in visiblePages"
                :key="pageNum"
                @click="goToPage(pageNum)"
                :class="['pagination-number', { active: pageNum === pagination.page }]"
              >
                {{ pageNum }}
              </button>
            </div>

            <button
              @click="goToPage(pagination.page + 1)"
              :disabled="pagination.page >= pagination.totalPages"
              class="pagination-btn"
            >
              Next →
            </button>
          </div>
          <p class="pagination-info">
            Page {{ pagination.page }} of {{ pagination.totalPages }} ({{ pagination.totalResults }}
            results)
          </p>
        </div>

        <div v-else class="no-results">
          <div class="no-results-icon">No Results</div>
          <h3>No results found</h3>
          <p>Try searching for something else or check your spelling</p>
        </div>
      </div>
    </div>

    <!-- Status Dropdown -->
    <StatusDropdown
      v-if="showDropdown && selectedContent"
      :show-dropdown="showDropdown"
      :content-id="selectedContent._id"
      :content-type="getContentType(selectedContent)"
      @close="closeDropdown"
    />

    <!-- AI Chatbot -->
    <Chatbot v-if="showChatbot" :show-chatbot="showChatbot" @close="showChatbot = false" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useContentStore } from '@/stores/content'
import { useAuthStore } from '@/stores/auth'
import { getPosterUrl } from '@/services/api'
import { useToast } from 'vue-toastification'
import StatusDropdown from '@/components/StatusDropdown.vue'
import Chatbot from '@/components/Chatbot.vue'
import type { Movie, TVShow } from '@/types'

const router = useRouter()
const contentStore = useContentStore()
const authStore = useAuthStore()
const toast = useToast()

const searchQuery = ref('')
const hasSearched = ref(false)
const showDropdown = ref(false)
const selectedContent = ref<Movie | TVShow | null>(null)
const showChatbot = ref(false)

// Filters
const filters = ref({
  type: 'all',
  genre: 'all',
  minRating: 0,
  year: 'all',
  sortBy: 'relevance',
})

// Pagination
const pagination = ref({
  page: 1,
  totalPages: 1,
  totalResults: 0,
})

// Generate years for filter (last 30 years)
const years = Array.from({ length: 30 }, (_, i) => new Date().getFullYear() - i)

const hasResults = computed(() => {
  return contentStore.searchResults.results.length > 0
})

// Pagination computed properties
const visiblePages = computed(() => {
  const current = pagination.value.page
  const total = pagination.value.totalPages
  const pages = []

  // Show up to 5 pages around current page
  const start = Math.max(1, current - 2)
  const end = Math.min(total, current + 2)

  for (let i = start; i <= end; i++) {
    pages.push(i)
  }

  return pages
})

const handleSearch = async () => {
  if (!searchQuery.value.trim()) return

  try {
    hasSearched.value = true
    pagination.value.page = 1 // Reset to first page on new search
    await performSearch()
  } catch (error) {
    console.error('Search error:', error)
  }
}

const performSearch = async () => {
  try {
    const searchParams = {
      query: searchQuery.value.trim(),
      page: pagination.value.page,
      ...filters.value,
    }

    await contentStore.searchContent(searchParams)

    // Update pagination info from response
    if (contentStore.searchResults.pagination) {
      pagination.value = {
        page: Number(contentStore.searchResults.pagination.page) || 1,
        totalPages: Number(contentStore.searchResults.pagination.totalPages) || 1,
        totalResults: Number(contentStore.searchResults.pagination.totalResults) || 0,
      }
    }
  } catch (error) {
    console.error('Search error:', error)
    toast.error('Failed to search content')
  }
}

const applyFilters = () => {
  pagination.value.page = 1 // Reset to first page when applying filters
  performSearch()
}

const clearFilters = () => {
  filters.value = {
    type: 'all',
    genre: 'all',
    minRating: 0,
    year: 'all',
    sortBy: 'relevance',
  }
  pagination.value.page = 1
  performSearch()
}

const goToPage = (pageNum: number) => {
  if (pageNum >= 1 && pageNum <= pagination.value.totalPages) {
    pagination.value.page = pageNum
    performSearch()
  }
}

const viewMovieDetails = (movie: Movie) => {
  router.push({
    name: 'movie-details',
    params: { id: movie._id },
    query: { from: router.currentRoute.value.fullPath },
  })
}

const viewShowDetails = (show: TVShow) => {
  router.push({
    name: 'tv-details',
    params: { id: show._id },
    query: { from: router.currentRoute.value.fullPath },
  })
}

const truncateText = (text: string, maxLength: number) => {
  if (!text) return ''
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text
}

const handleImageError = (event: Event) => {
  const img = event.target as HTMLImageElement
  img.src = '/placeholder-movie.jpg'
}

const handleAddToWatchlist = (content: Movie | TVShow) => {
  if (!authStore.isAuthenticated) {
    toast.error('Please log in to add items to your watchlist')
    router.push('/login')
    return
  }

  selectedContent.value = content
  showDropdown.value = true
}

const closeDropdown = () => {
  showDropdown.value = false
  selectedContent.value = null
}

const getContentType = (content: Movie | TVShow) => {
  return content.contentType || 'movie'
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

.ai-btn {
  padding: 1rem 1.5rem;
  font-size: 1rem;
  white-space: nowrap;
  background: var(--purple-accent);
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.3s ease;
}

.ai-btn:hover:not(:disabled) {
  background: var(--highlight-color);
  transform: translateY(-2px);
}

.ai-btn:disabled {
  background: var(--text-secondary);
  cursor: not-allowed;
  transform: none;
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

/* Content Grid */
.content-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 2rem;
  max-width: 1400px;
  margin: 0 auto;
}

.content-card {
  background: var(--card-bg);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  transition:
    transform 0.2s,
    box-shadow 0.2s;
  cursor: pointer;
}

.content-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
}

.content-poster {
  position: relative;
  aspect-ratio: 2/3;
  overflow: hidden;
}

.content-poster img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.2s;
}

.content-card:hover .content-poster img {
  transform: scale(1.05);
}

.content-overlay {
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
  transition: opacity 0.2s;
}

.content-card:hover .content-overlay {
  opacity: 1;
}

.content-type {
  font-size: 1.5rem;
  font-weight: bold;
  color: white;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
}

.content-rating {
  font-size: 1rem;
  color: #ffd700;
  font-weight: bold;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
}

.content-info {
  padding: 1.5rem;
}

.content-title {
  font-size: 1.2rem;
  font-weight: bold;
  color: var(--text-primary);
  margin-bottom: 0.5rem;
  line-height: 1.3;
}

.content-genres {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.content-overview {
  color: var(--text-secondary);
  font-size: 0.9rem;
  line-height: 1.4;
  margin: 0;
}

/* Legacy grid styles for backward compatibility */
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

.add-to-watchlist-btn {
  position: absolute;
  top: 1rem;
  right: 1rem;
  background: var(--purple-accent);
  color: white;
  border: none;
  border-radius: 50%;
  width: 2.5rem;
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.add-to-watchlist-btn:hover {
  background: var(--highlight-color);
  transform: scale(1.1);
}

.add-to-watchlist-btn:disabled {
  background: #4ade80;
  cursor: not-allowed;
  transform: none;
}

.movie-info,
.show-info {
  padding: 1rem;
}

.movie-genres,
.show-genres {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin-bottom: 0.75rem;
}

.genre-tag {
  background: var(--bg-secondary);
  color: var(--text-primary);
  padding: 0.25rem 0.5rem;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 500;
  border: 1px solid var(--border-color);
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

/* Filters Bar */
.filters-container {
  margin: 2rem 0;
}

.filters-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: center;
  padding: 1rem;
  background: var(--card-bg);
  border-radius: 12px;
  border: 1px solid var(--border-color);
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.filter-group label {
  font-weight: 500;
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.filter-group select,
.filter-group input[type='range'] {
  padding: 0.5rem;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 0.9rem;
}

.filter-group input[type='range'] {
  width: 100px;
}

.filter-group span {
  font-size: 0.9rem;
  color: var(--text-secondary);
  min-width: 30px;
}

.clear-filters-btn {
  padding: 0.5rem 1rem;
  background: var(--accent-color);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: background-color 0.2s;
}

.clear-filters-btn:hover {
  background: var(--accent-hover);
}

/* Pagination */
.pagination-container {
  margin: 2rem 0;
  text-align: center;
}

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.pagination-btn {
  padding: 0.5rem 1rem;
  background: var(--card-bg);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.pagination-btn:hover:not(:disabled) {
  background: var(--accent-color);
  color: white;
  border-color: var(--accent-color);
}

.pagination-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.pagination-numbers {
  display: flex;
  gap: 0.25rem;
}

.pagination-number {
  padding: 0.5rem 0.75rem;
  background: var(--card-bg);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  min-width: 40px;
}

.pagination-number:hover {
  background: var(--accent-color);
  color: white;
  border-color: var(--accent-color);
}

.pagination-number.active {
  background: var(--accent-color);
  color: white;
  border-color: var(--accent-color);
}

.pagination-info {
  color: var(--text-secondary);
  font-size: 0.9rem;
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
