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
            <label>Rating:</label>
            <select v-model="filters.rating" @change="applyFilters">
              <option value="all">All Ratings</option>
              <option value="8">8+ Stars</option>
              <option value="7">7+ Stars</option>
              <option value="6">6+ Stars</option>
            </select>
          </div>

          <div class="filter-group">
            <label>Year:</label>
            <select v-model="filters.year" @change="applyFilters">
              <option value="all">All Years</option>
              <option value="2024">2024</option>
              <option value="2023">2023</option>
              <option value="2022">2022</option>
              <option value="2021">2021</option>
              <option value="2020">2020</option>
              <option value="older">Older</option>
            </select>
          </div>

          <button @click="clearFilters" class="clear-filters-btn">Clear Filters</button>
        </div>
      </div>

      <!-- Loading State -->
      <div v-if="contentStore.isLoading" class="loading-container">
        <div class="spinner"></div>
        <p>Searching for amazing content...</p>
      </div>

      <!-- Error State -->
      <div v-else-if="contentStore.error" class="error-state">
        <div class="error-icon">⚠️</div>
        <h3>Search failed</h3>
        <p>{{ contentStore.error }}</p>
        <button @click="handleSearch" class="btn btn-primary">Try Again</button>
      </div>

      <!-- Search Results -->
      <div v-else-if="hasSearched && filteredResults.length > 0" class="search-results">
        <div class="results-header">
          <h2>Search Results</h2>
          <p>
            {{ filteredResults.length }} result{{ filteredResults.length !== 1 ? 's' : '' }} found
          </p>
        </div>

        <div class="results-grid">
          <div
            v-for="item in paginatedResults"
            :key="item._id"
            class="result-card"
            @click="viewContentDetails(item)"
          >
            <div class="result-poster">
              <img
                :src="getPosterUrl(item.posterPath || '')"
                :alt="item.title"
                @error="handleImageError"
              />
              <div class="content-type-badge">
                {{ getContentTypeDisplay(item.contentType) }}
              </div>
              <div class="result-overlay">
                <div class="result-rating">{{ getDisplayRating(item) }}</div>
                <div class="result-actions">
                  <button
                    v-if="authStore.isAuthenticated"
                    @click.stop="handleWatchlistClick(item._id)"
                    class="action-btn"
                    :class="{ 'in-watchlist': contentStore.isInWatchlist(item._id) }"
                  >
                    {{ contentStore.isInWatchlist(item._id) ? '✓' : '+' }}
                  </button>
                </div>
              </div>
            </div>
            <div class="result-info">
              <h3 class="result-title">{{ item.title }}</h3>
              <p class="result-overview">{{ truncateText(item.overview, 100) }}</p>
              <div class="result-genres">
                <span
                  v-for="genre in getDisplayGenres(item.genres)?.slice(0, 2)"
                  :key="genre"
                  class="genre-tag"
                >
                  {{ genre }}
                </span>
              </div>
              <div class="result-meta">
                <span v-if="item.releaseDate" class="release-year">
                  {{ getReleaseYear(item.releaseDate) }}
                </span>
                <span v-if="item.contentType === 'movie' && item.runtime" class="runtime">
                  {{ item.runtime }} min
                </span>
                <span
                  v-if="item.contentType === 'tv' && (item.episodeCount || item.malEpisodes)"
                  class="episodes"
                >
                  {{ item.episodeCount || item.malEpisodes }} episodes
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Pagination -->
        <div v-if="totalPages > 1" class="pagination">
          <button
            @click="currentPage = Math.max(1, currentPage - 1)"
            :disabled="currentPage === 1"
            class="btn btn-secondary"
          >
            Previous
          </button>
          <span class="pagination-info"> Page {{ currentPage }} of {{ totalPages }} </span>
          <button
            @click="currentPage = Math.min(totalPages, currentPage + 1)"
            :disabled="currentPage === totalPages"
            class="btn btn-secondary"
          >
            Next
          </button>
        </div>
      </div>

      <!-- No Results -->
      <div v-else-if="hasSearched && filteredResults.length === 0" class="no-results">
        <div class="no-results-icon">🔍</div>
        <h3>No results found</h3>
        <p>Try adjusting your search terms or filters.</p>
        <button @click="clearSearch" class="btn btn-primary">Clear Search</button>
      </div>

      <!-- Initial State -->
      <div v-else class="initial-state">
        <div class="initial-icon">🎬</div>
        <h3>Start your search</h3>
        <p>Enter a movie or TV show title to get started.</p>
      </div>

      <!-- Status Dropdown -->
      <StatusDropdown
        :show-dropdown="showStatusDropdown"
        :content-id="selectedContentId"
        :content-type="getContentType(selectedContentId)"
        @close="closeStatusDropdown"
      />

      <!-- Chatbot Modal -->
      <Chatbot
        v-if="showChatbot"
        :show-chatbot="showChatbot"
        @close="showChatbot = false"
        @search="handleAISearch"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useContentStore } from '@/stores/content'
import { useAuthStore } from '@/stores/auth'
import { getPosterUrl, formatGenres, getContentTypeDisplay } from '@/services/api'
import { useToast } from 'vue-toastification'
import StatusDropdown from '@/components/StatusDropdown.vue'
import Chatbot from '@/components/Chatbot.vue'
import type { UnifiedContent } from '@/types/content'

const router = useRouter()
const contentStore = useContentStore()
const authStore = useAuthStore()
const toast = useToast()

// State
const searchQuery = ref('')
const hasSearched = ref(false)
const showChatbot = ref(false)
const showStatusDropdown = ref(false)
const selectedContentId = ref('')
const currentPage = ref(1)
const itemsPerPage = 12

const filters = ref({
  type: 'all',
  rating: 'all',
  year: 'all',
})

// Computed properties
const searchResults = computed(() => contentStore.searchResults)

const filteredResults = computed(() => {
  let results = [...searchResults.value]

  // Apply type filter
  if (filters.value.type !== 'all') {
    results = results.filter((item) => item.contentType === filters.value.type)
  }

  // Apply rating filter
  if (filters.value.rating !== 'all') {
    const minRating = parseFloat(filters.value.rating)
    results = results.filter((item) => {
      const rating = item.unifiedScore || 0
      return rating >= minRating
    })
  }

  // Apply year filter
  if (filters.value.year !== 'all') {
    results = results.filter((item) => {
      if (!item.releaseDate) return false
      const year = new Date(item.releaseDate).getFullYear()

      if (filters.value.year === 'older') {
        return year < 2020
      }
      return year === parseInt(filters.value.year)
    })
  }

  return results
})

const totalPages = computed(() => {
  return Math.ceil(filteredResults.value.length / itemsPerPage)
})

const paginatedResults = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage
  const end = start + itemsPerPage
  return filteredResults.value.slice(start, end)
})

// Helper functions
const getDisplayRating = (item: UnifiedContent) => {
  const rating = item.unifiedScore
  return rating ? rating.toFixed(1) : 'N/A'
}

const getDisplayGenres = (genres: Array<{ id?: number; name?: string }> | string[]) => {
  return formatGenres(genres)
}

const getReleaseYear = (dateString: string | Date) => {
  const date = new Date(dateString)
  return date.getFullYear()
}

const getContentType = (contentId: string) => {
  const content = searchResults.value.find((item: UnifiedContent) => item._id === contentId)
  return content?.contentType || 'movie'
}

const truncateText = (text: string, maxLength: number) => {
  if (!text) return ''
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text
}

const handleImageError = (event: Event) => {
  const img = event.target as HTMLImageElement
  img.src = '/placeholder-movie.jpg'
}

const viewContentDetails = (item: UnifiedContent) => {
  const routeName = item.contentType === 'movie' ? 'MovieDetails' : 'TVDetails'
  router.push({ name: routeName, params: { id: item._id } })
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

const handleSearch = async () => {
  if (!searchQuery.value.trim()) return

  try {
    hasSearched.value = true
    currentPage.value = 1
    await contentStore.searchContent(searchQuery.value, 'all', 1, 50)
  } catch (error) {
    console.error('Search error:', error)
    toast.error('Search failed. Please try again.')
  }
}

const handleAISearch = async (query: string) => {
  searchQuery.value = query
  await handleSearch()
}

const applyFilters = () => {
  currentPage.value = 1
}

const clearFilters = () => {
  filters.value = {
    type: 'all',
    rating: 'all',
    year: 'all',
  }
  currentPage.value = 1
}

const clearSearch = () => {
  searchQuery.value = ''
  hasSearched.value = false
  currentPage.value = 1
  contentStore.clearSearchResults()
}

// Watch for filter changes
watch(
  filters,
  () => {
    applyFilters()
  },
  { deep: true },
)
</script>

<style scoped>
.search-page {
  min-height: 100vh;
  background: linear-gradient(180deg, var(--primary-color) 0%, var(--secondary-color) 100%);
  padding: 2rem 0;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 20px;
}

.search-header {
  text-align: center;
  margin-bottom: 3rem;
  color: white;
}

.search-title {
  font-size: 3rem;
  font-weight: 700;
  margin-bottom: 1rem;
}

.search-subtitle {
  font-size: 1.25rem;
  opacity: 0.9;
}

.search-form-container {
  margin-bottom: 2rem;
}

.search-form {
  max-width: 800px;
  margin: 0 auto;
}

.search-input-group {
  display: flex;
  gap: 1rem;
  align-items: center;
}

.search-input {
  flex: 1;
  padding: 1rem;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  background: rgba(255, 255, 255, 0.9);
}

.search-input:focus {
  outline: none;
  background: white;
  box-shadow: 0 0 0 3px rgba(78, 205, 196, 0.3);
}

.search-btn,
.ai-btn {
  padding: 1rem 2rem;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.search-btn {
  background: linear-gradient(90deg, var(--coral-light), var(--teal-light));
  color: white;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
}

.ai-btn {
  background: var(--navbar-accent);
  color: white;
  border: 1px solid var(--navbar-primary);
}

.search-btn:hover,
.ai-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.2);
}

.search-btn:disabled,
.ai-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.filters-container {
  margin-bottom: 2rem;
}

.filters-bar {
  display: flex;
  gap: 2rem;
  align-items: center;
  background: rgba(255, 255, 255, 0.1);
  padding: 1rem 2rem;
  border-radius: 12px;
  backdrop-filter: blur(10px);
  flex-wrap: wrap;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: white;
}

.filter-group label {
  font-weight: 600;
}

.filter-group select {
  padding: 0.5rem;
  border: none;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.9);
}

.clear-filters-btn {
  background: rgba(255, 107, 107, 0.8);
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.clear-filters-btn:hover {
  background: rgba(255, 107, 107, 1);
}

.results-header {
  text-align: center;
  margin-bottom: 2rem;
  color: white;
}

.results-header h2 {
  font-size: 2rem;
  margin-bottom: 0.5rem;
}

.results-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 2rem;
  margin-bottom: 3rem;
}

.result-card {
  background: white;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
  cursor: pointer;
}

.result-card:hover {
  transform: translateY(-8px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
}

.result-poster {
  position: relative;
  aspect-ratio: 2/3;
  overflow: hidden;
}

.result-poster img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s ease;
}

.result-card:hover .result-poster img {
  transform: scale(1.05);
}

.result-overlay {
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

.result-card:hover .result-overlay {
  opacity: 1;
}

.result-rating {
  background: rgba(255, 255, 255, 0.9);
  color: #333;
  padding: 4px 8px;
  border-radius: 4px;
  font-weight: 600;
  font-size: 0.9rem;
  align-self: flex-start;
}

.result-type {
  background: rgba(102, 126, 234, 0.9);
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-weight: 600;
  font-size: 0.8rem;
  align-self: flex-start;
}

.content-type-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  background: linear-gradient(90deg, var(--coral-primary), var(--teal-primary));
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

.result-card:hover .content-type-badge {
  opacity: 1;
  transform: translateY(0);
}

.result-actions {
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

.result-info {
  padding: 1.5rem;
}

.result-title {
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: #333;
  line-height: 1.3;
}

.result-overview {
  color: #666;
  font-size: 0.9rem;
  line-height: 1.5;
  margin-bottom: 1rem;
}

.result-genres {
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

.result-meta {
  display: flex;
  gap: 1rem;
  font-size: 0.8rem;
  color: #999;
}

.release-year,
.runtime,
.episodes {
  background: #f8f9fa;
  padding: 2px 6px;
  border-radius: 3px;
}

.loading-container,
.error-state,
.no-results,
.initial-state {
  text-align: center;
  padding: 4rem 0;
  color: white;
}

.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top: 2px solid #4ecdc4;
  border-radius: 50%;
  animation: spin 1s linear infinite;
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
.no-results-icon,
.initial-icon {
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

@media (max-width: 768px) {
  .search-title {
    font-size: 2rem;
  }

  .search-input-group {
    flex-direction: column;
  }

  .filters-bar {
    flex-direction: column;
    align-items: stretch;
  }

  .results-grid {
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1.5rem;
  }

  .pagination {
    flex-direction: column;
    gap: 0.5rem;
  }
}
</style>
