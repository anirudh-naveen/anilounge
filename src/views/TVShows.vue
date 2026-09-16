<!-- eslint-disable vue/multi-word-component-names -->
<!--
  TVShows.vue — TV catalog view.

  Tabbed, paginated series lists (popular, currently airing, upcoming) from the
  content store as poster cards. Popular Right Now is a single page; other tabs paginate.
-->
<template>
  <div class="tvshows-page">
    <div class="container">
      <!-- Page Header -->
      <div class="page-header">
        <h1 class="page-title">Animated TV Shows</h1>
        <p class="page-subtitle">{{ activeTabMeta.subtitle }}</p>
      </div>

      <!-- Tabs -->
      <!-- Title: Catalog Tabs -->
      <div class="catalog-tabs" role="tablist" aria-label="TV show lists">
        <button
          v-for="tab in TV_CATALOG_TABS"
          :key="tab.id"
          type="button"
          role="tab"
          class="tab-btn"
          :class="{ active: activeTab === tab.id }"
          :aria-selected="activeTab === tab.id"
          :data-testid="`tv-tab-${tab.id}`"
          @click="selectTab(tab.id)"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- Catalog -->
      <!-- Title: Loading State -->
      <div v-if="contentStore.tvShowsLoading" class="loading-container">
        <div class="spinner"></div>
        <p>Loading amazing TV shows...</p>
      </div>

      <!-- Title: Error State -->
      <div v-else-if="contentStore.error" class="error-state">
        <div class="error-icon">⚠️</div>
        <h3>Failed to load TV shows</h3>
        <p>{{ contentStore.error }}</p>
        <button @click="reloadCurrent" class="btn btn-primary">Try Again</button>
      </div>

      <!-- Title: Content Card -->
      <div v-else-if="tvShows.length > 0" class="tvshows-grid">
        <div
          v-for="show in tvShows"
          :key="show._id"
          class="show-card"
          @click="viewShowDetails(show)"
        >
          <div class="show-poster">
            <img
              :src="getPosterUrl(show.posterPath || '')"
              :alt="getDisplayTitle(show)"
              @error="handleImageError"
            />
            <div class="content-type-badge tv-badge poster-corner-tag poster-corner-tag-right">
              TV Show
            </div>
            <AiringBadge :content="show" variant="card" />
          </div>
          <div class="show-info">
            <h3 class="show-title">{{ getDisplayTitle(show) }}</h3>
            <p class="show-overview">{{ truncateText(show.overview, 120) }}</p>
            <div class="show-genres">
              <span
                v-for="genre in getDisplayGenres(show.genres)?.slice(0, 3)"
                :key="genre"
                class="genre-tag"
              >
                {{ genre }}
              </span>
            </div>
            <div class="show-meta">
              <span v-if="show.releaseDate" class="release-year">
                {{ getReleaseYear(show.releaseDate) }}
              </span>
              <span v-if="show.episodeCount || show.malEpisodes" class="episodes">
                {{ show.episodeCount || show.malEpisodes }} episodes
              </span>
              <span v-if="show.seasonCount" class="seasons"> {{ show.seasonCount }} seasons </span>
            </div>
          </div>
          <ContentHoverPreview
            :item="show"
            :is-authenticated="authStore.isAuthenticated"
            :in-watchlist="contentStore.isInWatchlist(show._id)"
          />
        </div>
      </div>

      <!-- Title: Empty State -->
      <div v-else class="empty-state">
        <div class="empty-icon">📺</div>
        <h3>{{ activeTabMeta.emptyTitle }}</h3>
        <p>{{ activeTabMeta.emptyBody }}</p>
        <button @click="reloadCurrent" class="btn btn-primary">Refresh</button>
      </div>

      <!-- Pagination -->
      <PaginationNav
        v-if="catalogTabHasPagination(activeTab)"
        :current-page="contentStore.tvShowsPagination.currentPage"
        :total-pages="contentStore.tvShowsPagination.totalPages"
        @change="loadTVShows"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useContentStore } from '@/stores/content'
import { useAuthStore } from '@/stores/auth'
import { getPosterUrl, formatGenres } from '@/services/api'
import { useToast } from 'vue-toastification'
import PaginationNav from '@/components/PaginationNav.vue'
import ContentHoverPreview from '@/components/ContentHoverPreview.vue'
import AiringBadge from '@/components/AiringBadge.vue'
import type { UnifiedContent } from '@/types/content'
import { getDisplayTitle } from '@/utils/titles'
import {
  TV_CATALOG_TABS,
  catalogTabHasPagination,
  getTvCatalogTab,
  normalizeTvCatalogTab,
  parseTvCatalogPage,
  tvCatalogPath,
  tvCatalogRouteQuery,
  tvCatalogScrollKey,
  type TvCatalogTab,
} from '@/utils/catalogTabs'

const router = useRouter()
const route = useRoute()
const contentStore = useContentStore()
const authStore = useAuthStore()
const toast = useToast()
const skipScroll = ref(true)

const activeTab = computed(() => normalizeTvCatalogTab(route.query.tab))
const activeTabMeta = computed(() => getTvCatalogTab(activeTab.value))
const catalogPage = computed(() => parseTvCatalogPage(route.query.page, activeTab.value))

// Get TV shows from unified store
const tvShows = computed(() => {
  return contentStore.tvShows
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

const viewShowDetails = (show: UnifiedContent) => {
  const tab = activeTab.value
  const page = contentStore.tvShowsPagination.currentPage
  contentStore.saveScrollPosition(tvCatalogScrollKey(tab, page))

  router.push({
    name: 'TVShowDetails',
    params: { id: show._id },
    query: { from: tvCatalogPath(tab, page) },
  })
}

const selectTab = (tab: TvCatalogTab) => {
  if (tab === activeTab.value) return
  router.replace({ query: tvCatalogRouteQuery(tab, 1) })
}

const loadTVShows = (page: number) => {
  router.replace({ query: tvCatalogRouteQuery(activeTab.value, page) })
}

const reloadCurrent = () => {
  void fetchCatalog(activeTab.value, catalogPage.value)
}

const fetchCatalog = async (tab: TvCatalogTab, page: number) => {
  try {
    await contentStore.getContent(page, 'tv', 20, tab)
    if (skipScroll.value) {
      skipScroll.value = false
      return
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  } catch (error) {
    console.error('Error loading TV shows:', error)
    toast.error('Failed to load TV shows. Please try again.')
  }
}

watch(
  () => [activeTab.value, catalogPage.value] as const,
  ([tab, page]) => {
    void fetchCatalog(tab, page)
  },
  { immediate: true },
)

onMounted(async () => {
  try {
    if (authStore.isAuthenticated) {
      await contentStore.loadWatchlist()
    }
  } catch (error) {
    console.error('Error in TVShows component:', error)
    toast.error('Failed to load TV shows. Please try again.')
  }
})
</script>

<style scoped>
.tvshows-page {
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
  margin-bottom: 1.5rem;
  color: white;
}

.catalog-tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 2rem;
  flex-wrap: wrap;
  justify-content: center;
}

.tab-btn {
  padding: 0.75rem 1.5rem;
  border: 1px solid rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.15);
  color: white;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-weight: 600;
}

.tab-btn:hover {
  background: rgba(255, 255, 255, 0.25);
  transform: translateY(-1px);
}

.tab-btn.active {
  background: linear-gradient(90deg, var(--coral-light), var(--teal-light));
  border-color: transparent;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
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

.tvshows-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 1rem;
  margin-bottom: 3rem;
}

.show-card {
  position: relative;
  background: white;
  border-radius: 8px;
  overflow: visible;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
  cursor: pointer;
  z-index: 1;
}

.show-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  z-index: 20;
}

.show-poster {
  position: relative;
  aspect-ratio: 2/3;
  overflow: hidden;
  border-radius: 8px 8px 0 0;
}

.show-poster img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s ease;
}

.show-card:hover .show-poster img {
  transform: scale(1.05);
}

.show-info {
  padding: 0.6rem 0.7rem 0.75rem;
  border-radius: 0 0 8px 8px;
}

.show-title {
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

.show-overview {
  display: none;
}

.show-genres {
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

.show-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  font-size: 0.7rem;
  color: #999;
}

.release-year,
.episodes,
.seasons {
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
  z-index: 2;
}

@media (max-width: 768px) {
  .page-title {
    font-size: 2rem;
  }

  .tab-btn {
    padding: 0.6rem 0.9rem;
    font-size: 0.85rem;
  }

  .tvshows-grid {
    grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
    gap: 0.75rem;
  }
}
</style>
