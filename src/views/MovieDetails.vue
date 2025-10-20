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
            :src="getPosterUrl(movie.posterPath)"
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
              <span>{{ movie.releaseDate ? formatDate(movie.releaseDate) : 'N/A' }}</span>
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
            v-for="(company, index) in movie.productionCompanies"
            :key="`company-${index}`"
            class="company-tag"
          >
            {{ company }}
          </span>
        </div>
      </div>

      <!-- Related Content Section -->
      <div
        v-if="
          relatedContent &&
          (relatedContent.sequels.length > 0 ||
            relatedContent.prequels.length > 0 ||
            relatedContent.related.length > 0)
        "
        class="related-content"
      >
        <h3>Related Content</h3>

        <!-- Franchise Info -->
        <div v-if="movie.franchise" class="franchise-info">
          <h4>Part of the {{ movie.franchise }} franchise</h4>
        </div>

        <!-- Sequels -->
        <div v-if="relatedContent.sequels.length > 0" class="relationship-section">
          <h4>Sequels</h4>
          <div class="content-grid">
            <div
              v-for="sequel in relatedContent.sequels"
              :key="`sequel-${sequel._id}`"
              class="content-card"
              @click="viewContentDetails(sequel, $event)"
            >
              <img
                v-if="sequel.posterPath"
                :src="getPosterUrl(sequel.posterPath)"
                :alt="sequel.title"
                @error="handleImageError"
              />
              <div v-else class="no-poster">
                <i class="fas fa-film"></i>
              </div>
              <div class="content-info">
                <h5>{{ sequel.title }}</h5>
                <p class="content-type">
                  {{ sequel.contentType === 'movie' ? 'Movie' : 'TV Show' }}
                </p>
                <div class="rating">
                  <i class="fas fa-star"></i>
                  <span>{{ sequel.unifiedScore?.toFixed(1) || 'N/A' }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Prequels -->
        <div v-if="relatedContent.prequels.length > 0" class="relationship-section">
          <h4>Prequels</h4>
          <div class="content-grid">
            <div
              v-for="prequel in relatedContent.prequels"
              :key="`prequel-${prequel._id}`"
              class="content-card"
              @click="viewContentDetails(prequel, $event)"
            >
              <img
                v-if="prequel.posterPath"
                :src="getPosterUrl(prequel.posterPath)"
                :alt="prequel.title"
                @error="handleImageError"
              />
              <div v-else class="no-poster">
                <i class="fas fa-film"></i>
              </div>
              <div class="content-info">
                <h5>{{ prequel.title }}</h5>
                <p class="content-type">
                  {{ prequel.contentType === 'movie' ? 'Movie' : 'TV Show' }}
                </p>
                <div class="rating">
                  <i class="fas fa-star"></i>
                  <span>{{ prequel.unifiedScore?.toFixed(1) || 'N/A' }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Related -->
        <div v-if="relatedContent.related.length > 0" class="relationship-section">
          <h4>Related</h4>
          <div class="content-grid">
            <div
              v-for="related in relatedContent.related"
              :key="`related-${related._id}`"
              class="content-card"
              @click="viewContentDetails(related, $event)"
            >
              <img
                v-if="related.posterPath"
                :src="getPosterUrl(related.posterPath)"
                :alt="related.title"
                @error="handleImageError"
              />
              <div v-else class="no-poster">
                <i class="fas fa-film"></i>
              </div>
              <div class="content-info">
                <h5>{{ related.title }}</h5>
                <p class="content-type">
                  {{ related.contentType === 'movie' ? 'Movie' : 'TV Show' }}
                </p>
                <div class="rating">
                  <i class="fas fa-star"></i>
                  <span>{{ related.unifiedScore?.toFixed(1) || 'N/A' }}</span>
                </div>
              </div>
            </div>
          </div>
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
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useContentStore } from '@/stores/content'
import { useAuthStore } from '@/stores/auth'
import { contentAPI, getPosterUrl } from '@/services/api'
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
const relatedContent = ref<{
  sequels: UnifiedContent[]
  prequels: UnifiedContent[]
  related: UnifiedContent[]
} | null>(null)

const isInWatchlist = computed(() => {
  if (!movie.value || !authStore.user?.watchlist) return false
  return authStore.user.watchlist.some((item) => item.content?._id === movie.value?._id)
})

onMounted(async () => {
  // Scroll to top when component mounts
  contentStore.scrollToTop()

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
      // Fetch related content
      await fetchRelatedContent(movieId)
      loading.value = false
      return
    }

    // If not in store, fetch from API
    const response = await contentAPI.getContentById(movieId)
    movie.value = response.data.data

    // Fetch related content
    await fetchRelatedContent(movieId)
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
    // Parse the previous page URL to determine the source
    const url = new URL(previousPage, window.location.origin)
    const pathname = url.pathname

    if (pathname === '/movies') {
      // Coming from movies page - handle pagination
      const page = url.searchParams.get('page') || '1'
      const scrollKey = `movies-page-${page}`
      const restored = contentStore.restoreScrollPosition(scrollKey)

      router.push({ path: '/movies', query: { page } })

      if (!restored) {
        nextTick(() => {
          contentStore.scrollToTop()
        })
      }
    } else if (pathname === '/tv-shows') {
      // Coming from TV shows page - handle pagination
      const page = url.searchParams.get('page') || '1'
      const scrollKey = `tv-shows-page-${page}`
      const restored = contentStore.restoreScrollPosition(scrollKey)

      router.push({ path: '/tv-shows', query: { page } })

      if (!restored) {
        nextTick(() => {
          contentStore.scrollToTop()
        })
      }
    } else if (pathname === '/search') {
      // Coming from search page - handle pagination
      const page = url.searchParams.get('page') || '1'
      const scrollKey = `search-page-${page}`
      const restored = contentStore.restoreScrollPosition(scrollKey)

      router.push({ path: '/search', query: { page } })

      if (!restored) {
        nextTick(() => {
          contentStore.scrollToTop()
        })
      }
    } else if (pathname === '/') {
      // Coming from home page
      const scrollKey = 'home-page'
      const restored = contentStore.restoreScrollPosition(scrollKey)

      router.push('/')

      if (!restored) {
        nextTick(() => {
          contentStore.scrollToTop()
        })
      }
    } else {
      // Unknown source - go to home page
      router.push('/')
      nextTick(() => {
        contentStore.scrollToTop()
      })
    }
  } else {
    // Default fallback to home page
    router.push('/')
    nextTick(() => {
      contentStore.scrollToTop()
    })
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

const fetchRelatedContent = async (contentId: string) => {
  try {
    const response = await contentAPI.getRelatedContent(contentId)
    relatedContent.value = response.data.data
  } catch (err) {
    console.error('Failed to fetch related content:', err)
    // Don't show error to user, just log it
  }
}

const viewContentDetails = async (content: UnifiedContent, event?: Event) => {
  console.log(
    'Navigating to content:',
    content.title,
    'Type:',
    content.contentType,
    'ID:',
    content._id,
  )

  // Add visual feedback
  const clickedElement = event?.target as HTMLElement
  const card = clickedElement?.closest('.content-card') as HTMLElement
  if (card) {
    card.style.opacity = '0.7'
    card.style.transform = 'scale(0.95)'
  }

  try {
    if (content.contentType === 'movie') {
      console.log('Navigating to MovieDetails with ID:', content._id)
      await router.push({
        name: 'MovieDetails',
        params: { id: content._id },
        query: { from: route.fullPath },
      })
    } else {
      console.log('Navigating to TVShowDetails with ID:', content._id)
      await router.push({
        name: 'TVShowDetails',
        params: { id: content._id },
        query: { from: route.fullPath },
      })
    }
    console.log('Navigation completed successfully')
  } catch (err) {
    console.error('Navigation error:', err)
    // Reset visual feedback on error
    if (card) {
      card.style.opacity = '1'
      card.style.transform = 'scale(1)'
    }
  }
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
  background: var(--blend-color);
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
  background: var(--blend-color);
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

/* Related Content Styles */
.related-content {
  margin-top: 2rem;
  padding: 1.5rem;
  background: var(--bg-card);
  border-radius: 12px;
  border: 1px solid var(--border-color);
}

.related-content h3 {
  font-size: 1.5rem;
  margin-bottom: 1rem;
  color: var(--text-primary);
}

.franchise-info {
  margin-bottom: 1.5rem;
  padding: 1rem;
  background: linear-gradient(90deg, var(--coral-light), var(--teal-light));
  border-radius: 8px;
}

.franchise-info h4 {
  margin: 0;
  color: white;
  font-size: 1.1rem;
}

.relationship-section {
  margin-bottom: 2rem;
}

.relationship-section h4 {
  font-size: 1.2rem;
  margin-bottom: 1rem;
  color: var(--text-primary);
}

.content-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1rem;
}

.content-card {
  background: var(--bg-hover);
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.3s ease;
  border: 1px solid var(--border-color);
}

.content-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
  border-color: var(--coral-primary);
}

.content-card img {
  width: 100%;
  height: 250px;
  object-fit: cover;
}

.content-card .no-poster {
  width: 100%;
  height: 250px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-card);
  color: var(--text-muted);
  font-size: 2rem;
}

.content-info {
  padding: 1rem;
}

.content-info h5 {
  margin: 0 0 0.5rem 0;
  font-size: 1rem;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.content-type {
  margin: 0 0 0.5rem 0;
  font-size: 0.8rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.content-info .rating {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.9rem;
  color: var(--text-primary);
}

.content-info .rating i {
  color: #ffd700;
}

/* Fix text readability issues */
.movie-description p,
.movie-description h2,
.movie-description h3,
.movie-description h4 {
  color: #ffffff; /* White text for better readability */
}

.movie-description p {
  color: #ffd4a3; /* Lighter orange for paragraph text */
}

.original-title {
  color: #ffd4a3 !important; /* Lighter orange */
}

.vote-count {
  color: #ffffff !important; /* White */
}

.movie-meta span {
  color: #ffffff !important; /* White */
}

.genre-tag {
  color: #ffffff !important; /* White text */
}

.company-tag,
.country-tag {
  color: #ffffff !important; /* White text */
}

.content-type {
  color: #ffd4a3 !important; /* Lighter orange for better readability */
}
</style>
