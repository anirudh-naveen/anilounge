<!--
  CatalogPage.vue — the movie and series catalogs (`/movies`, `/tv`).

  Tabbed lists for one catalog (movies: popular, now in theatres, upcoming; series:
  popular, currently airing, upcoming) from the content store as poster cards.
  Popular Right Now is a single page; other tabs paginate.
-->
<template>
  <div class="catalog-page">
    <div class="container">
      <!-- Page Header -->
      <div class="page-header">
        <h1 class="page-title">{{ copy.title }}</h1>
        <p class="page-subtitle">{{ activeTabMeta.subtitle }}</p>
      </div>

      <!-- Tabs -->
      <!-- Title: Catalog Tabs -->
      <div class="catalog-tabs" role="tablist" :aria-label="copy.tabsLabel">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          type="button"
          role="tab"
          class="tab-btn"
          :class="{ active: activeTab === tab.id }"
          :aria-selected="activeTab === tab.id"
          :data-testid="`${kind}-tab-${tab.id}`"
          @click="selectTab(tab.id)"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- Catalog -->
      <!-- Title: Loading State -->
      <div v-if="loading" class="loading-container">
        <div class="spinner"></div>
        <p>{{ copy.loading }}</p>
      </div>

      <!-- Title: Error State -->
      <div v-else-if="contentStore.error" class="error-state">
        <div class="error-icon">⚠️</div>
        <h3>Failed to load {{ copy.noun }}</h3>
        <p>{{ contentStore.error }}</p>
        <button @click="reloadCurrent" class="btn btn-primary">Try Again</button>
      </div>

      <!-- Title: Content Card -->
      <div v-else-if="items.length > 0" class="catalog-grid">
        <div
          v-for="item in items"
          :key="item._id"
          class="content-card poster-frame"
          @click="viewDetails(item)"
        >
          <div class="card-poster">
            <img
              :src="getPosterUrl(item.posterPath || '')"
              :alt="getDisplayTitle(item)"
              @error="showPosterPlaceholder"
            />
            <div
              class="content-type-badge poster-corner-tag poster-corner-tag-right"
              :class="getContentTypeBadgeClass(item.contentType)"
            >
              {{ getCardContentTypeDisplay(item.contentType) }}
            </div>
            <AiringBadge :content="item" variant="card" />
            <FavoriteHeart :content-id="item._id" />
          </div>
          <div class="card-info">
            <h3 class="card-title">{{ getDisplayTitle(item) }}</h3>
            <div class="card-genres">
              <span
                v-for="genre in formatGenres(item.genres).slice(0, 1)"
                :key="genre"
                class="genre-tag"
              >
                {{ genre }}
              </span>
            </div>
            <div class="card-meta">
              <span v-if="item.releaseDate" class="meta-chip">
                {{ new Date(item.releaseDate).getFullYear() }}
              </span>
              <template v-if="kind === 'movie'">
                <span v-if="item.runtime" class="meta-chip">{{ item.runtime }} min</span>
              </template>
              <template v-else>
                <span v-if="item.episodeCount || item.malEpisodes" class="meta-chip">
                  {{ item.episodeCount || item.malEpisodes }} episodes
                </span>
                <span v-if="item.seasonCount" class="meta-chip"
                  >{{ item.seasonCount }} seasons</span
                >
              </template>
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
      <div v-else class="empty-state">
        <div class="empty-icon">{{ copy.emptyIcon }}</div>
        <h3>{{ activeTabMeta.emptyTitle }}</h3>
        <p>{{ activeTabMeta.emptyBody }}</p>
        <button @click="reloadCurrent" class="btn btn-primary">Refresh</button>
      </div>

      <!-- Pagination -->
      <PaginationNav
        v-if="catalogTabHasPagination(activeTab)"
        :current-page="pagination.currentPage"
        :total-pages="pagination.totalPages"
        @change="loadPage"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { showPosterPlaceholder } from '@/utils/posters'
import { onMounted, computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useContentStore } from '@/stores/content'
import { useAuthStore } from '@/stores/auth'
import {
  getPosterUrl,
  formatGenres,
  getCardContentTypeDisplay,
  getContentTypeBadgeClass,
} from '@/services/api'
import { useToast } from 'vue-toastification'
import PaginationNav from '@/components/PaginationNav.vue'
import ContentHoverPreview from '@/components/ContentHoverPreview.vue'
import AiringBadge from '@/components/AiringBadge.vue'
import FavoriteHeart from '@/components/FavoriteHeart.vue'
import type { UnifiedContent } from '@/types/content'
import { getDisplayTitle } from '@/utils/titles'
import {
  MOVIE_CATALOG_TABS,
  TV_CATALOG_TABS,
  catalogPath,
  catalogRouteQuery,
  catalogScrollKey,
  catalogTabHasPagination,
  getCatalogTab,
  normalizeCatalogTab,
  parseCatalogPage,
  type BrowseContentType,
} from '@/utils/catalogTabs'

const props = defineProps<{ kind: BrowseContentType }>()

const COPY = {
  movie: {
    title: 'Animated Movies',
    tabsLabel: 'Movie lists',
    loading: 'Loading amazing movies...',
    noun: 'movies',
    emptyIcon: '🎬',
    detailsRoute: 'MovieDetails',
  },
  tv: {
    title: 'Animated Series',
    tabsLabel: 'Series lists',
    loading: 'Loading series...',
    noun: 'series',
    emptyIcon: '📺',
    detailsRoute: 'TVShowDetails',
  },
} as const

const router = useRouter()
const route = useRoute()
const contentStore = useContentStore()
const authStore = useAuthStore()
const toast = useToast()
const skipScroll = ref(true)

const copy = computed(() => COPY[props.kind])
const tabs = computed(() => (props.kind === 'movie' ? MOVIE_CATALOG_TABS : TV_CATALOG_TABS))
const activeTab = computed(() => normalizeCatalogTab(props.kind, route.query.tab))
const activeTabMeta = computed(() => getCatalogTab(props.kind, activeTab.value))
const catalogPage = computed(() => parseCatalogPage(route.query.page, activeTab.value))

const items = computed(() => (props.kind === 'movie' ? contentStore.movies : contentStore.tvShows))
const loading = computed(() =>
  props.kind === 'movie' ? contentStore.moviesLoading : contentStore.tvShowsLoading,
)
const pagination = computed(() =>
  props.kind === 'movie' ? contentStore.moviesPagination : contentStore.tvShowsPagination,
)

const viewDetails = (item: UnifiedContent) => {
  const tab = activeTab.value
  const page = pagination.value.currentPage
  contentStore.saveScrollPosition(catalogScrollKey(props.kind, tab, page))

  router.push({
    name: copy.value.detailsRoute,
    params: { id: item._id },
    query: { from: catalogPath(props.kind, tab, page) },
  })
}

const selectTab = (tab: string) => {
  if (tab === activeTab.value) return
  router.replace({ query: catalogRouteQuery(tab, 1) })
}

const loadPage = (page: number) => {
  router.replace({ query: catalogRouteQuery(activeTab.value, page) })
}

const reloadCurrent = () => {
  void fetchCatalog(activeTab.value, catalogPage.value)
}

const fetchCatalog = async (tab: typeof activeTab.value, page: number) => {
  try {
    await contentStore.getContent(page, props.kind, 20, tab)
    if (skipScroll.value) {
      skipScroll.value = false
      return
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  } catch (error) {
    console.error(`Error loading ${copy.value.noun}:`, error)
    toast.error(`Failed to load ${copy.value.noun}. Please try again.`)
  }
}

watch(
  () => [props.kind, activeTab.value, catalogPage.value] as const,
  ([, tab, page]) => {
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
    console.error('Error loading the watchlist:', error)
    toast.error(`Failed to load ${copy.value.noun}. Please try again.`)
  }
})
</script>

<style scoped>
.catalog-page {
  min-height: 100vh;
  background: transparent;
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
  color: var(--text-primary);
}

.catalog-tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 2rem;
  flex-wrap: wrap;
  justify-content: center;
}

.tab-btn {
  padding: 0.7rem 1.35rem;
  border: 1px solid var(--border-color);
  background: var(--bg-parchment);
  color: var(--text-secondary);
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-weight: 600;
  font-family: inherit;
  line-height: 1.15;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.tab-btn:hover {
  background: var(--navbar-accent);
  color: var(--text-primary);
  transform: translateY(-1px);
}

.tab-btn.active {
  background: linear-gradient(135deg, var(--coral-light), var(--coral-primary));
  color: var(--text-on-accent);
  border-color: transparent;
  box-shadow: 0 8px 18px rgba(224, 122, 95, 0.22);
}

.page-title {
  font-family: var(--font-display);
  font-size: 3rem;
  font-weight: 650;
  margin-bottom: 1rem;
  letter-spacing: -0.03em;
}

.page-subtitle {
  font-size: 1.25rem;
  opacity: 0.9;
}

.catalog-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 1rem;
  margin-bottom: 3rem;
}

.content-card {
  position: relative;
  background: var(--bg-card);
  border-radius: 14px;
  overflow: visible;
  box-shadow: var(--shadow-sm);
  transition: all 0.3s ease;
  cursor: pointer;
  z-index: 1;
  border: 1px solid var(--border-color);
}

.content-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-spot), var(--shadow-md);
  border-color: var(--coral-primary);
  z-index: 20;
}

.card-poster {
  position: relative;
  aspect-ratio: 2/3;
  overflow: hidden;
  border-radius: 8px 8px 0 0;
}

.card-poster img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s ease;
}

.content-card:hover .card-poster img {
  transform: scale(1.05);
}

.card-info {
  padding: 0.6rem 0.7rem 0.75rem;
  border-radius: 0 0 8px 8px;
}

.card-title {
  font-size: 0.85rem;
  font-weight: 600;
  margin-bottom: 0.35rem;
  color: var(--text-ink);
  line-height: 1.25;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-genres {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin-bottom: 0.4rem;
}

.genre-tag {
  background: rgba(224, 122, 95, 0.14);
  color: var(--coral-deep);
  padding: 2px 5px;
  border-radius: 999px;
  font-size: 0.65rem;
  font-weight: 600;
}

.card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  font-size: 0.7rem;
  color: var(--text-faint);
}

.meta-chip {
  background: var(--bg-muted);
  padding: 2px 6px;
  border-radius: 3px;
}

.loading-container,
.error-state,
.empty-state {
  text-align: center;
  padding: 4rem 0;
  color: var(--text-primary);
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

.error-icon,
.empty-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
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
  box-shadow: 0 8px 18px rgba(224, 122, 95, 0.22);
}

.btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.2);
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

  .catalog-grid {
    grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
    gap: 0.75rem;
  }
}
</style>
