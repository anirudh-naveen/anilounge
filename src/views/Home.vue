<!-- eslint-disable vue/multi-word-component-names -->
<!--
  Home.vue — catalog landing view.

  Renders the marketing hero and a trending grid of movies and series from the
  content store. No search or filter chrome; discovery only.
-->
<template>
  <div class="home-page">
    <!-- Hero -->
    <section class="hero">
      <div class="container">
        <div class="hero-content fade-in">
          <!-- Title: Headline -->
          <h1 class="hero-title">
            Welcome to the
            <br />
            <span class="gradient-text">Animation Lounge.</span>
          </h1>
          <p class="hero-subtitle">
            AniLounge is a space filled with passion for animated media - find new favorites, record
            all you've watched, and connect with people across the globe.
          </p>
          <!-- Title: Primary CTA -->
          <div class="hero-actions">
            <router-link to="/search" class="btn btn-primary btn-large">
              Browse the space
            </router-link>
          </div>
        </div>
      </div>
    </section>

    <!-- Catalog -->
    <section class="featured-section">
      <div class="container">
        <h2 class="section-title">Spotlight</h2>
        <!-- Title: Loading State -->
        <div v-if="contentStore.isLoading" class="loading-container">
          <div class="spinner"></div>
          <p>Loading amazing content...</p>
        </div>
        <!-- Title: Content Card -->
        <div v-else-if="featuredContent.length > 0" class="content-grid">
          <div
            v-for="item in featuredContent.slice(0, 8)"
            :key="item._id"
            class="content-card poster-frame"
            @click="viewContentDetails(item)"
          >
            <div class="content-poster">
              <img
                :src="getPosterUrl(item.posterPath || '')"
                :alt="getDisplayTitle(item)"
                @error="handleImageError"
              />
              <div
                class="content-type-badge poster-corner-tag poster-corner-tag-right"
                :class="getContentTypeBadgeClass(item.contentType)"
              >
                {{ getCardContentTypeDisplay(item.contentType) }}
              </div>
              <AiringBadge :content="item" variant="card" />
            </div>
            <div class="content-info">
              <h3 class="content-title">{{ getDisplayTitle(item) }}</h3>
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
            <ContentHoverPreview
              :item="item"
              :is-authenticated="authStore.isAuthenticated"
              :in-watchlist="contentStore.isInWatchlist(item._id)"
            />
          </div>
        </div>
        <!-- Title: Empty State -->
        <div v-else class="error-state">
          <p>No content found. Please try again later.</p>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted, computed, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useContentStore } from '@/stores/content'
import { useAuthStore } from '@/stores/auth'
import {
  getPosterUrl,
  formatGenres,
  getCardContentTypeDisplay,
  getContentTypeBadgeClass,
  getDetailsRouteName,
} from '@/services/api'
import { useToast } from 'vue-toastification'
import ContentHoverPreview from '@/components/ContentHoverPreview.vue'
import AiringBadge from '@/components/AiringBadge.vue'
import type { UnifiedContent } from '@/types/content'
import { getDisplayTitle } from '@/utils/titles'

const router = useRouter()
const route = useRoute()
const contentStore = useContentStore()
const authStore = useAuthStore()
const toast = useToast()

// Get trending content from unified store
const featuredContent = computed(() => {
  // Create a trending score that combines multiple factors
  const sorted = [...contentStore.allContent].sort((a, b) => {
    // Calculate trending score: unified score + vote count influence + recency bonus
    const aScore = (a.unifiedScore || 0) * 0.6 // Base rating weight
    const aVoteWeight = Math.log10((a.voteCount || 1) + 1) * 0.3 // Vote count influence
    const aRecencyBonus = getRecencyBonus(a.releaseDate) * 0.1 // Recent content bonus
    const aTrendingScore = aScore + aVoteWeight + aRecencyBonus

    const bScore = (b.unifiedScore || 0) * 0.6
    const bVoteWeight = Math.log10((b.voteCount || 1) + 1) * 0.3
    const bRecencyBonus = getRecencyBonus(b.releaseDate) * 0.1
    const bTrendingScore = bScore + bVoteWeight + bRecencyBonus

    return bTrendingScore - aTrendingScore
  })
  return sorted.slice(0, 8) // Show only 8 trending items
})

// Helper functions
const getRecencyBonus = (releaseDate: string | Date | undefined) => {
  if (!releaseDate) return 0

  const release = typeof releaseDate === 'string' ? new Date(releaseDate) : releaseDate
  const now = new Date()
  const yearsDiff = now.getFullYear() - release.getFullYear()

  // Give bonus for content released in the last 3 years
  if (yearsDiff <= 3) {
    return Math.max(0, 3 - yearsDiff) // 3 points for this year, 2 for last year, 1 for 2 years ago
  }

  return 0
}

const getDisplayGenres = (genres: Array<{ id?: number; name?: string }> | string[]) => {
  return formatGenres(genres)
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
  // Save current scroll position for home page
  const scrollKey = 'home-page'
  contentStore.saveScrollPosition(scrollKey)

  const routeName = getDetailsRouteName(item)
  router.push({
    name: routeName,
    params: { id: item._id },
    query: { from: route.fullPath },
  })
}

onMounted(async () => {
  try {
    // Handle scroll position restoration when returning from detail pages
    const previousPage = route.query.from as string
    if (previousPage && previousPage.includes('/')) {
      // We're returning from a detail page, restore scroll position
      const scrollKey = 'home-page'
      const restored = contentStore.restoreScrollPosition(scrollKey)

      if (!restored) {
        nextTick(() => {
          contentStore.scrollToTop()
        })
      }
    } else {
      // Normal page load, scroll to top
      contentStore.scrollToTop()
    }

    // Load popular content (which includes both movies and series)
    await contentStore.getPopularContent('all', 20)

    // Load watchlist if user is authenticated (now optimized to skip if already loaded)
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
}

.hero {
  padding: 120px 0 80px;
  text-align: center;
  color: var(--text-primary);
  background: transparent;
}

.hero-content {
  max-width: 800px;
  margin: 0 auto;
}

.hero-title {
  font-family: var(--font-display);
  font-size: 3.5rem;
  font-weight: 650;
  margin-bottom: 1.5rem;
  line-height: 1.15;
  letter-spacing: -0.03em;
}

.gradient-text {
  background: linear-gradient(90deg, var(--coral-primary), var(--gold-accent), var(--teal-primary));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.hero-subtitle {
  font-size: 1.25rem;
  margin-bottom: 2rem;
  color: var(--text-secondary);
  line-height: 1.6;
}

.hero-actions {
  margin-top: 2rem;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  line-height: 1.15;
  padding: 12px 24px;
  border-radius: 8px;
  text-decoration: none;
  font-weight: 600;
  transition: all 0.3s ease;
  border: none;
  cursor: pointer;
}

.btn-primary {
  background: linear-gradient(135deg, var(--coral-light), var(--coral-primary));
  color: var(--text-on-accent);
  box-shadow: 0 8px 20px rgba(224, 122, 95, 0.24);
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
  background: transparent;
  position: relative;
}

.featured-section::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: radial-gradient(ellipse at top, rgba(255, 252, 240, 0.85), transparent 62%);
  z-index: 1;
}

.featured-section .container {
  position: relative;
  z-index: 2;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 20px;
}

.section-title {
  font-family: var(--font-display);
  font-size: 2.5rem;
  font-weight: 650;
  text-align: center;
  margin-bottom: 3rem;
  color: var(--text-primary);
  letter-spacing: -0.03em;
}

.content-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1.5rem;
  margin-bottom: 3rem;
}

.content-card {
  position: relative;
  background: #fff;
  border-radius: 16px;
  overflow: visible;
  box-shadow: var(--shadow-md);
  transition: all 0.3s ease;
  cursor: pointer;
  border: 1px solid var(--border-color);
  z-index: 1;
}

.content-card:hover {
  transform: translateY(-8px);
  box-shadow: var(--shadow-spot), var(--shadow-lg);
  border-color: var(--coral-primary);
  z-index: 20;
}

.content-poster {
  position: relative;
  aspect-ratio: 2/3;
  overflow: hidden;
  border-radius: 12px 12px 0 0;
}

.content-poster img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s ease;
}

.content-type-badge {
  z-index: 2;
}

.content-card:hover .content-poster img {
  transform: scale(1.05);
}

.content-info {
  padding: 1.5rem;
  border-radius: 0 0 12px 12px;
}

.content-title {
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: var(--text-ink);
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
  background: rgba(224, 122, 95, 0.14);
  color: var(--coral-deep);
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 600;
}

.loading-container {
  text-align: center;
  padding: 4rem 0;
}

.loading-container p {
  color: var(--text-secondary);
  font-size: 1.1rem;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid var(--border-color);
  border-top: 4px solid var(--coral-primary);
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
