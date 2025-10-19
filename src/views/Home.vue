<!-- eslint-disable vue/multi-word-component-names -->
<template>
  <div class="home-page">
    <!-- Hero Section -->
    <section class="hero">
      <div class="container">
        <div class="hero-content fade-in">
          <h1 class="hero-title">
            Discover Amazing
            <span class="gradient-text">Animated Content</span>
          </h1>
          <p class="hero-subtitle">
            Find your next favorite animated movie or TV show. Rate, track, and get personalized
            recommendations.
          </p>
          <div class="hero-actions">
            <router-link to="/search" class="btn btn-primary btn-large">
              🔍 Search Content
            </router-link>
          </div>
        </div>
      </div>
    </section>

    <!-- Featured Content -->
    <section class="featured-section">
      <div class="container">
        <h2 class="section-title">Featured Content</h2>
        <div v-if="contentStore.isLoading" class="loading-container">
          <div class="spinner"></div>
          <p>Loading amazing content...</p>
        </div>
        <div v-else-if="featuredContent.length > 0" class="content-grid">
          <div
            v-for="item in featuredContent.slice(0, 8)"
            :key="item._id"
            class="content-card"
            @click="viewContentDetails(item)"
          >
            <div class="content-poster">
              <img
                :src="getPosterUrl(item.posterPath)"
                :alt="item.title"
                @error="handleImageError"
              />
              <div class="content-overlay">
                <div class="content-rating">⭐ {{ item.voteAverage?.toFixed(1) || 'N/A' }}</div>
                <div class="content-type">{{ item.contentType === 'movie' ? '🎬' : '📺' }}</div>
                <div class="content-actions">
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
            <div class="content-info">
              <h3 class="content-title">{{ item.title }}</h3>
              <p class="content-overview">{{ truncateText(item.overview, 100) }}</p>
              <div class="content-genres">
                <span v-for="genre in item.genres?.slice(0, 2)" :key="genre" class="genre-tag">
                  {{ genre }}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div v-else class="error-state">
          <p>No content found. Please try again later.</p>
        </div>
      </div>
    </section>

    <!-- Quick Stats -->
    <section class="stats-section">
      <div class="container">
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-icon">🎬</div>
            <div class="stat-number">{{ contentStore.pagination.totalResults || '1000+' }}</div>
            <div class="stat-label">Animated Movies</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon">🎯</div>
            <div class="stat-number">AI</div>
            <div class="stat-label">Recommendations</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon">📺</div>
            <div class="stat-number">500+</div>
            <div class="stat-label">Animated TV Shows</div>
          </div>
        </div>
      </div>
    </section>

    <!-- Status Dropdown -->
    <StatusDropdown
      :show-dropdown="showStatusDropdown"
      :content-id="selectedContentId"
      :content-type="getContentType(selectedContentId)"
      @close="closeStatusDropdown"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useContentStore } from '@/stores/content'
import { useAuthStore } from '@/stores/auth'
import { getPosterUrl } from '@/services/api'
import { useToast } from 'vue-toastification'
import type { Content } from '@/types'
import StatusDropdown from '@/components/StatusDropdown.vue'

const router = useRouter()
const contentStore = useContentStore()
const authStore = useAuthStore()
const toast = useToast()

const showStatusDropdown = ref(false)
const selectedContentId = ref('')

// Combine movies and TV shows for featured content
const featuredContent = computed(() => {
  const movies = contentStore.movies.map((movie) => ({ ...movie, contentType: 'movie' as const }))
  const tvShows = contentStore.tvShows.map((show) => ({ ...show, contentType: 'tv' as const }))

  // Mix movies and TV shows, prioritizing higher-rated content
  const allContent = [...movies, ...tvShows]
  return allContent.sort((a, b) => (b.voteAverage || 0) - (a.voteAverage || 0))
})

onMounted(async () => {
  try {
    // Load both movies and TV shows if not already loaded
    if (contentStore.movies.length === 0) {
      await contentStore.getMovies(1)
    }
    if (contentStore.tvShows.length === 0) {
      await contentStore.getTVShows(1)
    }
  } catch (error) {
    console.error('Error loading content:', error)
  }
})

const viewContentDetails = (content: Content) => {
  const route =
    content.contentType === 'movie' ? `/movie/${content.tmdbId}` : `/tv/${content.tmdbId}`
  router.push(route)
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
    console.error('Failed to update watchlist:', error)
    toast.error('Failed to update watchlist')
  }
}

const truncateText = (text: string, maxLength: number) => {
  if (!text) return ''
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text
}

const handleImageError = (event: Event) => {
  const img = event.target as HTMLImageElement
  img.src = '/placeholder-movie.jpg'
}

const getContentType = (contentId: string) => {
  const movie = contentStore.movies.find((m) => m._id === contentId)
  return movie ? 'movie' : 'tv'
}
</script>

<style scoped>
.home-page {
  min-height: 100vh;
}

.hero {
  background: linear-gradient(
    135deg,
    var(--primary-color) 0%,
    var(--secondary-color) 50%,
    var(--accent-color) 100%
  );
  padding: 4rem 0;
  text-align: center;
  position: relative;
  overflow: hidden;
}

.hero::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><pattern id="stars" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="10" cy="10" r="1" fill="white" opacity="0.1"/></pattern></defs><rect width="100" height="100" fill="url(%23stars)"/></svg>');
  animation: twinkle 3s ease-in-out infinite;
}

@keyframes twinkle {
  0%,
  100% {
    opacity: 0.3;
  }
  50% {
    opacity: 0.8;
  }
}

.hero-content {
  position: relative;
  z-index: 1;
}

.hero-title {
  font-size: 3.5rem;
  font-weight: 800;
  margin-bottom: 1rem;
  line-height: 1.2;
}

.gradient-text {
  background: linear-gradient(135deg, var(--highlight-color), var(--purple-accent));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.hero-subtitle {
  font-size: 1.25rem;
  color: var(--text-secondary);
  margin-bottom: 2rem;
  max-width: 600px;
  margin-left: auto;
  margin-right: auto;
}

.hero-actions {
  display: flex;
  gap: 1rem;
  justify-content: center;
  flex-wrap: wrap;
}

.btn-large {
  padding: 1rem 2rem;
  font-size: 1.1rem;
}

.featured-section {
  padding: 4rem 0;
}

.section-title {
  font-size: 2.5rem;
  font-weight: 700;
  text-align: center;
  margin-bottom: 3rem;
  color: var(--text-primary);
}

.loading-container {
  text-align: center;
  padding: 4rem 0;
}

.loading-container p {
  margin-top: 1rem;
  color: var(--text-secondary);
}

.content-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.5rem;
  max-width: 1400px;
  margin: 0 auto;
}

.content-card {
  background: var(--bg-card);
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.3s ease;
  cursor: pointer;
  border: 1px solid var(--border-color);
}

.content-card:hover {
  transform: translateY(-8px);
  box-shadow: var(--shadow-lg);
  border-color: var(--border-hover);
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
  transition: transform 0.3s ease;
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
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.3) 0%, rgba(0, 0, 0, 0.7) 100%);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 1rem;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.content-card:hover .content-overlay {
  opacity: 1;
}

.content-rating {
  background: var(--highlight-color);
  color: white;
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
  font-weight: 600;
  font-size: 0.9rem;
  align-self: flex-start;
}

.content-type {
  position: absolute;
  top: 1rem;
  right: 1rem;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 0.25rem 0.5rem;
  border-radius: 8px;
  font-size: 0.8rem;
}

.content-actions {
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

.content-info {
  padding: 1.5rem;
}

.content-title {
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: var(--text-primary);
}

.content-overview {
  color: var(--text-secondary);
  font-size: 0.9rem;
  line-height: 1.5;
  margin-bottom: 1rem;
}

.content-genres {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.genre-tag {
  background: var(--bg-hover);
  color: var(--text-primary);
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: 500;
}

.stats-section {
  background: var(--bg-secondary);
  padding: 4rem 0;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 2rem;
}

.stat-card {
  text-align: center;
  padding: 2rem;
  background: var(--bg-card);
  border-radius: 12px;
  border: 1px solid var(--border-color);
  transition: all 0.3s ease;
}

.stat-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-md);
}

.stat-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.stat-number {
  font-size: 2.5rem;
  font-weight: 700;
  color: var(--highlight-color);
  margin-bottom: 0.5rem;
}

.stat-label {
  color: var(--text-secondary);
  font-weight: 500;
}

.error-state {
  text-align: center;
  padding: 4rem 0;
  color: var(--text-secondary);
}

@media (max-width: 768px) {
  .hero-title {
    font-size: 2.5rem;
  }

  .hero-subtitle {
    font-size: 1.1rem;
  }

  .hero-actions {
    flex-direction: column;
    align-items: center;
  }

  .content-grid {
    grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
    gap: 1rem;
  }

  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
