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
              Search Content
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
                :src="getPosterUrl(item.posterPath || '')"
                :alt="item.title"
                @error="handleImageError"
              />
              <div class="content-overlay">
                <div class="content-rating">{{ getDisplayRating(item) }}</div>
                <div class="content-type">
                  {{ getContentTypeDisplay(item.contentType) }}
                </div>
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
                <span
                  v-for="genre in getDisplayGenres(item.genres)?.slice(0, 2)"
                  :key="genre"
                  class="genre-tag"
                >
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
import { getPosterUrl, formatGenres, getContentTypeDisplay } from '@/services/api'
import { useToast } from 'vue-toastification'
import StatusDropdown from '@/components/StatusDropdown.vue'
import type { UnifiedContent } from '@/types/content'

const router = useRouter()
const contentStore = useContentStore()
const authStore = useAuthStore()
const toast = useToast()

const showStatusDropdown = ref(false)
const selectedContentId = ref('')

// Get featured content from unified store
const featuredContent = computed(() => {
  // Use allContent from the unified store, sorted by unified score
  const sorted = [...contentStore.allContent].sort((a, b) => {
    const aRating = a.unifiedScore || 0
    const bRating = b.unifiedScore || 0
    return bRating - aRating
  })
  return sorted.slice(0, 8) // Show only 8 items
})

// Helper functions
const getDisplayRating = (item: UnifiedContent) => {
  const rating = item.unifiedScore
  return rating ? rating.toFixed(1) : 'N/A'
}

const getDisplayGenres = (genres: Array<{ id?: number; name?: string }> | string[]) => {
  return formatGenres(genres)
}

const getContentType = (contentId: string) => {
  const content = contentStore.allContent.find((item: UnifiedContent) => item._id === contentId)
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

onMounted(async () => {
  try {
    // Load popular content (which includes both movies and TV shows)
    await contentStore.getPopularContent('all', 20)

    // Load watchlist if user is authenticated
    if (authStore.isAuthenticated) {
      await contentStore.loadWatchlist()
    }
  } catch (error) {
    console.error('Error loading home page data:', error)
    toast.error('Failed to load content. Please try again.')
  }
})
</script>

<style scoped>
.home-page {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.hero {
  padding: 120px 0 80px;
  text-align: center;
  color: white;
}

.hero-content {
  max-width: 800px;
  margin: 0 auto;
}

.hero-title {
  font-size: 3.5rem;
  font-weight: 700;
  margin-bottom: 1.5rem;
  line-height: 1.2;
}

.gradient-text {
  background: linear-gradient(45deg, #ff6b6b, #4ecdc4);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.hero-subtitle {
  font-size: 1.25rem;
  margin-bottom: 2rem;
  opacity: 0.9;
  line-height: 1.6;
}

.hero-actions {
  margin-top: 2rem;
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
  background: linear-gradient(45deg, #ff6b6b, #4ecdc4);
  color: white;
}

.btn-large {
  padding: 16px 32px;
  font-size: 1.1rem;
}

.btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.2);
}

.featured-section {
  padding: 80px 0;
  background: rgba(255, 255, 255, 0.95);
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 20px;
}

.section-title {
  font-size: 2.5rem;
  font-weight: 700;
  text-align: center;
  margin-bottom: 3rem;
  color: #333;
}

.content-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1.5rem;
  margin-bottom: 3rem;
}

.content-card {
  background: white;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
  cursor: pointer;
}

.content-card:hover {
  transform: translateY(-8px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
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

.content-card:hover .content-overlay {
  opacity: 1;
}

.content-rating {
  background: rgba(255, 255, 255, 0.9);
  color: #333;
  padding: 4px 8px;
  border-radius: 4px;
  font-weight: 600;
  font-size: 0.9rem;
  align-self: flex-start;
}

.content-type {
  background: rgba(102, 126, 234, 0.9);
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-weight: 600;
  font-size: 0.8rem;
  align-self: flex-start;
}

.content-actions {
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

.content-info {
  padding: 1.5rem;
}

.content-title {
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: #333;
  line-height: 1.3;
}

.content-overview {
  color: #666;
  font-size: 0.9rem;
  line-height: 1.5;
  margin-bottom: 1rem;
}

.content-genres {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.genre-tag {
  background: #f0f0f0;
  color: #666;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.8rem;
  font-weight: 500;
}

.loading-container {
  text-align: center;
  padding: 4rem 0;
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

.error-state {
  text-align: center;
  padding: 4rem 0;
  color: #666;
}

.fade-in {
  animation: fadeIn 1s ease-in;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 1200px) {
  .content-grid {
    grid-template-columns: repeat(3, 1fr);
    gap: 1.25rem;
  }
}

@media (max-width: 768px) {
  .hero-title {
    font-size: 2.5rem;
  }

  .content-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem;
  }

  .stats-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 480px) {
  .content-grid {
    grid-template-columns: 1fr;
    gap: 1rem;
  }
}
</style>
