<!--
  TVShowDetails.vue — series detail view.

  Loads one series by route id and shows poster, titles, season/episode meta,
  watchlist actions, overview, an expandable episode row, studios, and related
  sequels/prequels. Picking a season shows that season's own details: the
  catalog title for that season when one exists (the route id switches to it),
  otherwise the show with TMDB's season poster/overview (`?season=N`).
-->
<template>
  <div class="tv-details">
    <!-- Navigation -->
    <div class="back-button" @click="goBack">
      <i class="fas fa-arrow-left"></i>
      Back
    </div>

    <!-- Status -->
    <!-- Title: Loading State -->
    <div v-if="loading" class="loading">
      <div class="spinner"></div>
      <p>Loading series details...</p>
    </div>

    <!-- Title: Error State -->
    <div v-else-if="error" class="error">
      <h2>Error loading series</h2>
      <p>{{ error }}</p>
      <button @click="goBack" class="btn-primary">Go Back</button>
    </div>

    <div v-else-if="show" class="show-content">
      <!-- Header -->
      <div class="show-header">
        <!-- Title: Poster -->
        <div class="show-poster">
          <img
            v-if="show.posterPath"
            :src="getPosterUrl(show.posterPath)"
            :alt="getDisplayTitle(show)"
            @error="hideBrokenImage"
          />
          <div v-else class="no-poster">
            <i class="fas fa-tv"></i>
            <p>No poster available</p>
          </div>
        </div>

        <div class="show-info">
          <!-- Title: Titles -->
          <h1 class="show-title">{{ getDisplayTitle(show) }}</h1>
          <p v-if="seasonLabel" class="season-label" data-testid="season-label">
            {{ seasonLabel }}
          </p>
          <p v-if="getNativeTitle(show)" class="original-title">
            Native Title: {{ getNativeTitle(show) }}
          </p>

          <!-- Title: Meta -->
          <div class="show-meta">
            <div class="rating">
              <i class="fas fa-star"></i>
              <span>{{ getDisplayScore(show) }}</span>
              <span v-if="getDisplayVoteCount(show)" class="vote-count">
                ({{ getDisplayVoteCount(show).toLocaleString() }} votes)
              </span>
            </div>

            <div class="first-air-date">
              <i class="fas fa-calendar"></i>
              <span>{{ show.releaseDate ? formatDate(show.releaseDate) : 'N/A' }}</span>
            </div>

            <div v-if="show.seasonCount" class="seasons">
              <i class="fas fa-layer-group"></i>
              <span>{{ show.seasonCount }} season{{ show.seasonCount > 1 ? 's' : '' }}</span>
            </div>

            <div v-if="show.episodeCount || show.malEpisodes" class="episodes">
              <i class="fas fa-play-circle"></i>
              <span
                >{{ show.episodeCount || show.malEpisodes }} episode{{
                  (show.episodeCount || show.malEpisodes || 0) > 1 ? 's' : ''
                }}</span
              >
            </div>

            <div v-if="isCurrentlyAiring(show) || isUpcoming(show)" class="status airing-status">
              <AiringBadge :content="show" variant="detail" />
            </div>
            <div v-else-if="show.malStatus" class="status">
              <i class="fas fa-info-circle"></i>
              <span>{{ formatAiringStatus(show.malStatus) }}</span>
            </div>
          </div>

          <div class="genres">
            <span
              v-for="genre in show.genres"
              :key="typeof genre === 'string' ? genre : genre.name || genre.id"
              class="genre-tag"
            >
              {{ typeof genre === 'string' ? genre : genre.name }}
            </span>
          </div>

          <!-- Title: Actions -->
          <div class="show-actions">
            <button @click="shareShow" class="btn-outline">Share</button>
          </div>
        </div>
      </div>

      <!-- Title: Watchlist -->
      <WatchlistPanel
        :content-id="show._id"
        content-type="tv"
        :total-episodes="show.episodeCount || show.malEpisodes || 0"
        :total-seasons="show.seasonCount || 1"
      />

      <!-- Body -->
      <!-- Title: Overview -->
      <div class="show-description">
        <h2>Overview</h2>
        <p>{{ show.overview || 'No overview available.' }}</p>
      </div>

      <!-- Title: Forum -->
      <ForumHighlights :content-id="show._id" :name="getDisplayTitle(show)" reviewable />

      <!-- Title: Episodes -->
      <EpisodeRow
        :episodes="episodes"
        :loading="episodesLoading"
        :characters="characters"
        :content-id="show._id"
        :show="show"
        :selected-season="selectedSeason"
        @select-season="selectSeason"
      />

      <!-- Title: Related Loading -->
      <div v-if="relatedContentLoading" class="related-content-loading">
        <h3>Loading Related Content...</h3>
        <div class="loading-spinner">
          <div class="spinner"></div>
          <p>Finding sequels, prequels, and related content...</p>
        </div>
      </div>

      <!-- Title: Related Content -->
      <div
        v-else-if="
          relatedContent &&
          (relatedContent.sequels.length > 0 ||
            relatedContent.prequels.length > 0 ||
            relatedContent.related.length > 0)
        "
        class="related-content"
      >
        <h3>Related Content</h3>

        <!-- Title: Franchise -->
        <div v-if="show.franchise" class="franchise-info">
          <h4>
            Part of the
            <router-link
              v-if="show.franchiseId"
              :to="{ name: 'FranchiseDetails', params: { id: show.franchiseId } }"
              class="franchise-link"
              data-testid="franchise-link"
              >{{ show.franchise }}</router-link
            ><template v-else>{{ show.franchise }}</template>
            franchise
          </h4>
          <router-link
            v-if="show.franchiseId"
            :to="{ name: 'FranchiseDetails', params: { id: show.franchiseId } }"
            class="franchise-order-link"
          >
            See every title in watch order <i class="fas fa-arrow-right"></i>
          </router-link>
          <p v-if="show.franchiseRating" class="franchise-rating" data-testid="franchise-rating">
            <i class="fas fa-star"></i> {{ show.franchiseRating.toFixed(1) }} across the franchise
          </p>
        </div>

        <!-- Title: Sequels -->
        <div v-if="relatedContent.sequels.length > 0" class="relationship-section">
          <h4>Sequels</h4>
          <div class="content-grid">
            <div
              v-for="sequel in relatedContent.sequels"
              :key="`sequel-${sequel._id}`"
              class="content-card"
              @click="viewContentDetails(sequel)"
            >
              <FavoriteHeart :content-id="sequel._id" />
              <img
                v-if="sequel.posterPath"
                :src="getPosterUrl(sequel.posterPath)"
                :alt="getDisplayTitle(sequel)"
                @error="hideBrokenImage"
              />
              <div v-else class="no-poster">
                <i class="fas fa-film"></i>
              </div>
              <div class="content-info">
                <h5>{{ getDisplayTitle(sequel) }}</h5>
                <p class="content-type">
                  {{ getCardContentTypeDisplay(sequel.contentType) }}
                  <AiringBadge :content="sequel" variant="inline" />
                </p>
                <div class="rating">
                  <i class="fas fa-star"></i>
                  <span>{{ getDisplayScore(sequel) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Title: Prequels -->
        <div v-if="relatedContent.prequels.length > 0" class="relationship-section">
          <h4>Prequels</h4>
          <div class="content-grid">
            <div
              v-for="prequel in relatedContent.prequels"
              :key="`prequel-${prequel._id}`"
              class="content-card"
              @click="viewContentDetails(prequel)"
            >
              <FavoriteHeart :content-id="prequel._id" />
              <img
                v-if="prequel.posterPath"
                :src="getPosterUrl(prequel.posterPath)"
                :alt="getDisplayTitle(prequel)"
                @error="hideBrokenImage"
              />
              <div v-else class="no-poster">
                <i class="fas fa-film"></i>
              </div>
              <div class="content-info">
                <h5>{{ getDisplayTitle(prequel) }}</h5>
                <p class="content-type">
                  {{ getCardContentTypeDisplay(prequel.contentType) }}
                  <AiringBadge :content="prequel" variant="inline" />
                </p>
                <div class="rating">
                  <i class="fas fa-star"></i>
                  <span>{{ getDisplayScore(prequel) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Title: Related -->
        <div v-if="relatedContent.related.length > 0" class="relationship-section">
          <h4>Related</h4>
          <div class="content-grid">
            <div
              v-for="related in relatedContent.related"
              :key="`related-${related._id}`"
              class="content-card"
              @click="viewContentDetails(related)"
            >
              <FavoriteHeart :content-id="related._id" />
              <img
                v-if="related.posterPath"
                :src="getPosterUrl(related.posterPath)"
                :alt="getDisplayTitle(related)"
                @error="hideBrokenImage"
              />
              <div v-else class="no-poster">
                <i class="fas fa-film"></i>
              </div>
              <div class="content-info">
                <h5>{{ getDisplayTitle(related) }}</h5>
                <p class="content-type">
                  {{ getCardContentTypeDisplay(related.contentType) }}
                  <AiringBadge :content="related" variant="inline" />
                </p>
                <div class="rating">
                  <i class="fas fa-star"></i>
                  <span>{{ getDisplayScore(related) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <EntityCastRow :items="characters" :content-id="show._id" :loading="charactersLoading" />

      <StudioLinks :content="show" />
    </div>

    <JoinPrompt
      title="Track this series"
      message="Sign up free to follow new episodes, log your progress, and rate every season."
    />
  </div>
</template>

<script setup lang="ts">
import { goBackOr, returnToListing } from '@/utils/navigation'
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useContentStore } from '@/stores/content'
import { useAuthStore } from '@/stores/auth'
import {
  contentAPI,
  getPosterUrl,
  getCardContentTypeDisplay,
  getDetailsRouteName,
} from '@/services/api'
import WatchlistPanel from '@/components/WatchlistPanel.vue'
import AiringBadge from '@/components/AiringBadge.vue'
import EpisodeRow from '@/components/EpisodeRow.vue'
import EntityCastRow from '@/components/EntityCastRow.vue'
import ForumHighlights from '@/components/ForumHighlights.vue'
import StudioLinks from '@/components/StudioLinks.vue'
import type {
  CatalogEntity,
  Episode,
  SeasonGuide,
  SeasonSummary,
  UnifiedContent,
} from '@/types/content'
import { useEntityStore } from '@/stores/entities'
import { getTotalVoteCount, getWeightedAverage } from '@/utils/ratings'
import { getDisplayTitle, getNativeTitle } from '@/utils/titles'
import { formatAiringStatus, isCurrentlyAiring, isUpcoming } from '@/utils/airing'
import { findRouteSeason, formatSeasonLabel, seasonContent } from '@/utils/episodes'
import { hideBrokenImage } from '@/utils/posters'
import FavoriteHeart from '@/components/FavoriteHeart.vue'
import JoinPrompt from '@/components/JoinPrompt.vue'
import { usePageMeta } from '@/composables/usePageMeta'
import { useCanonicalSlug } from '@/composables/useCanonicalSlug'
import { detailPath } from '@/utils/slug'
import { titlePageMeta } from '@/utils/pageMeta'

const route = useRoute()
const router = useRouter()
const contentStore = useContentStore()
const authStore = useAuthStore()
const entityStore = useEntityStore()

const show = ref<UnifiedContent | null>(null)
const loading = ref(true)
const error = ref('')
const relatedContent = ref<{
  sequels: UnifiedContent[]
  prequels: UnifiedContent[]
  related: UnifiedContent[]
} | null>(null)
const relatedContentLoading = ref(false)
const episodes = ref<Episode[]>([])
const episodesLoading = ref(false)
const characters = ref<CatalogEntity[]>([])
const charactersLoading = ref(false)
/** Details fetched on this page, by id (the route title, its show, and its seasons). */
const loaded = ref<Record<string, UnifiedContent>>({})
const seasons = ref<SeasonSummary[]>([])
/** Title the episodes and seasons belong to (differs from the route when it is one season). */
const seriesId = ref('')
const selectedSeason = ref<number | null>(null)
let detailsRequestId = 0
let relatedRequestId = 0
let episodesRequestId = 0
let charactersRequestId = 0
let detailsForId = ''

const selectedSeasonInfo = computed(
  () => seasons.value.find((season) => season.seasonNumber === selectedSeason.value) || null,
)
/** Title whose details are on screen: the selected season's own title, else its show. */
const displayId = computed(() => {
  const season = selectedSeasonInfo.value
  if (!season) return route.params.id as string
  return season.contentId || seriesId.value
})
const seasonLabel = computed(() =>
  seasons.value.length > 1 && selectedSeasonInfo.value
    ? formatSeasonLabel(selectedSeasonInfo.value)
    : '',
)

const getDisplayScore = (content: UnifiedContent) => {
  const average = getWeightedAverage(content)
  return average != null ? average.toFixed(1) : 'N/A'
}

const getDisplayVoteCount = (content: UnifiedContent) => getTotalVoteCount(content)

const remember = (content: UnifiedContent) => {
  loaded.value = { ...loaded.value, [content._id]: content }
}

/**
 * Put a title's details in `loaded`: cached copy first, then the fresh API copy.
 * @returns False when the API failed and nothing was cached.
 */
const loadDetails = async (contentId: string) => {
  if (!contentId) return false
  const cached = loaded.value[contentId] || contentStore.findContentById(contentId)
  if (cached) remember(cached)
  try {
    const response = await contentAPI.getContentById(contentId)
    const fresh = response.data.data as UnifiedContent
    contentStore.cacheContent(fresh)
    remember(fresh)
    return true
  } catch (err) {
    if (!cached) throw err
    return true
  }
}

/**
 * Show the details for the selected season. Until that title's details
 * arrive, the previous ones stay on screen.
 */
const renderShow = () => {
  const base = loaded.value[displayId.value]
  if (!base) return
  const season = selectedSeasonInfo.value
  const latest = seasons.value[seasons.value.length - 1]
  show.value = season && !season.contentId ? seasonContent(base, season, season === latest) : base
  contentStore.cacheContent(base, true)
}

watch([loaded, displayId, selectedSeasonInfo], renderShow)

let seasonPillClicked = false

const loadShow = async (showId: string) => {
  if (!showId) {
    error.value = 'No series ID provided'
    loading.value = false
    return
  }

  const fromPill = seasonPillClicked
  seasonPillClicked = false
  const season = findRouteSeason(seasons.value, showId, route.query.season)
  if (season) {
    selectedSeason.value = season.seasonNumber
    if (!fromPill) contentStore.scrollToTop()
    loadDetails(displayId.value).catch((err) => console.error('Failed to load season:', err))
    return
  }

  const requestId = ++detailsRequestId
  error.value = ''
  show.value = null
  seasons.value = []
  seriesId.value = showId
  selectedSeason.value = null
  episodes.value = []
  renderShow()
  contentStore.scrollToTop()
  fetchEpisodes(showId)

  loading.value = !loaded.value[showId] && !contentStore.findContentById(showId)
  try {
    await loadDetails(showId)
  } catch (err) {
    if (requestId !== detailsRequestId) return
    error.value = err instanceof Error ? err.message : 'Failed to load series'
  } finally {
    if (requestId === detailsRequestId) loading.value = false
  }
}

/**
 * Season pill click. A season with its own catalog title opens that title;
 * otherwise the show stays and `?season=N` picks the season.
 */
const selectSeason = (seasonNumber: number) => {
  const season = seasons.value.find((item) => item.seasonNumber === seasonNumber)
  if (!season) {
    selectedSeason.value = seasonNumber
    return
  }
  const id = season.contentId || seriesId.value
  const query = { ...route.query }
  delete query.season
  if (!season.contentId) query.season = String(seasonNumber)
  if (id === route.params.id && query.season === route.query.season) {
    selectedSeason.value = seasonNumber
    return
  }
  seasonPillClicked = true
  void router.replace({ name: 'TVShowDetails', params: { id }, query })
}

const goBack = () =>
  goBackOr(router, () => returnToListing(router, route.query.from as string, contentStore))

const shareShow = () => {
  if (navigator.share && show.value) {
    navigator.share({
      title: getDisplayTitle(show.value),
      text: show.value.overview,
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

const fetchEpisodes = async (contentId: string) => {
  const requestId = ++episodesRequestId
  episodesLoading.value = true
  try {
    const response = await contentAPI.getContentEpisodes(contentId)
    if (requestId !== episodesRequestId) return
    const guide = (response.data as { data: SeasonGuide }).data
    episodes.value = guide.episodes || []
    seasons.value = guide.seasons || []
    seriesId.value = guide.seriesId || contentId
    const season =
      findRouteSeason(seasons.value, contentId, route.query.season) ||
      seasons.value.find((item) => item.seasonNumber === guide.currentSeason)
    selectedSeason.value = season?.seasonNumber ?? null
    if (seasons.value.length > 1) {
      const ids = new Set(seasons.value.map((item) => item.contentId || seriesId.value))
      for (const id of ids) {
        loadDetails(id).catch((err) => console.error('Failed to load season details:', err))
      }
    }
  } catch (err) {
    if (requestId !== episodesRequestId) return
    console.error('Failed to fetch episodes:', err)
    episodes.value = []
    seasons.value = []
  } finally {
    if (requestId === episodesRequestId) {
      episodesLoading.value = false
    }
  }
}

const fetchCharacters = async (contentId: string) => {
  const requestId = ++charactersRequestId
  charactersLoading.value = true
  try {
    const data = await entityStore.getContentCharacters(contentId)
    if (requestId !== charactersRequestId) return
    characters.value = data
  } catch (err) {
    if (requestId !== charactersRequestId) return
    console.error('Failed to fetch characters:', err)
    characters.value = []
  } finally {
    if (requestId === charactersRequestId) {
      charactersLoading.value = false
    }
  }
}

const fetchRelatedContent = async (contentId: string) => {
  const requestId = ++relatedRequestId
  relatedContentLoading.value = true
  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Related content request timeout')), 2000),
    )

    const response = await Promise.race([contentAPI.getRelatedContent(contentId), timeoutPromise])
    if (requestId !== relatedRequestId) return

    relatedContent.value = (
      response as {
        data: {
          data: { sequels: UnifiedContent[]; prequels: UnifiedContent[]; related: UnifiedContent[] }
        }
      }
    ).data.data
    relatedContent.value?.sequels?.forEach((item) => contentStore.cacheContent(item))
    relatedContent.value?.prequels?.forEach((item) => contentStore.cacheContent(item))
    relatedContent.value?.related?.forEach((item) => contentStore.cacheContent(item))
  } catch (err) {
    if (requestId !== relatedRequestId) return
    console.error('Failed to fetch related content:', err)
    relatedContent.value = { sequels: [], prequels: [], related: [] }
  } finally {
    if (requestId === relatedRequestId) {
      relatedContentLoading.value = false
    }
  }
}

const viewContentDetails = async (content: UnifiedContent) => {
  contentStore.cacheContent(content, true)

  try {
    await router.push({
      name: getDetailsRouteName(content),
      params: { id: content._id },
      query: { from: route.fullPath },
    })
  } catch (err) {
    console.error('Navigation error:', err)
  }
}

// Characters and related titles follow the title on screen (a season's own title, or its show).
watch(
  displayId,
  (contentId) => {
    if (!contentId || contentId === detailsForId) return
    detailsForId = contentId
    characters.value = []
    relatedContent.value = null
    fetchCharacters(contentId)
    fetchRelatedContent(contentId)
  },
  { immediate: true },
)

watch(
  () => [route.params.id as string, route.query.season] as const,
  ([showId]) => {
    void loadShow(showId)
  },
  { immediate: true },
)

watch(
  () => authStore.isAuthenticated,
  (isAuthenticated) => {
    if (isAuthenticated) {
      void contentStore.loadWatchlist()
    }
  },
  { immediate: true },
)

/** Name of the title the URL points at (its slug), loaded or on screen. */
const routeTitle = computed(() => {
  const content = loaded.value[String(route.params.id)] || show.value
  return content ? getDisplayTitle(content) : null
})

usePageMeta(() =>
  show.value
    ? titlePageMeta(show.value, {
        path: detailPath('/tv-show', String(route.params.id), routeTitle.value),
        image: show.value.posterPath ? getPosterUrl(show.value.posterPath) : null,
        seasonLabel: seasonLabel.value,
      })
    : null,
)

useCanonicalSlug(routeTitle, () => (routeTitle.value ? String(route.params.id) : null))
</script>

<style scoped>
.tv-details {
  min-height: 100vh;
  background: var(--bg-primary);
  color: var(--text-primary);
  padding: 2rem;
}

.back-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  line-height: 1.15;
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

.show-content {
  max-width: 1200px;
  margin: 0 auto;
}

.show-header {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 2rem;
  margin-bottom: 3rem;
}

.show-poster {
  position: relative;
}

.show-poster img {
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

.show-info {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.show-title {
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

.season-label {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 600;
  color: var(--coral-deep);
}

.show-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 1.5rem;
  margin: 1rem 0;
}

.show-meta > div {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1rem;
}

.airing-status {
  padding: 0;
}

.show-meta i {
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

.show-actions {
  display: flex;
  align-items: center;
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
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  line-height: 1;
  gap: 0.5rem;
  box-sizing: border-box;
  border: 2px solid transparent;
}

.btn-primary {
  background: var(--blend-color);
  color: white;
}

.btn-primary:hover {
  background: var(--purple-accent);
  transform: translateY(-2px);
}

.btn-secondary {
  background: var(--success-color);
  color: white;
}

.btn-secondary:hover {
  background: var(--success-color);
  opacity: 0.9;
}

.btn-outline {
  background: transparent;
  color: var(--text-primary);
  border-color: var(--border-color);
}

.btn-outline:hover {
  background: var(--bg-hover);
  border-color: var(--highlight-color);
}

.show-description {
  margin-bottom: 2rem;
}

.show-description h2 {
  font-size: 1.5rem;
  margin-bottom: 1rem;
  color: var(--text-primary);
}

.show-description p {
  font-size: 1.1rem;
  line-height: 1.6;
  color: var(--text-muted);
}

@media (max-width: 768px) {
  .tv-details {
    padding: 1rem;
  }

  .show-header {
    grid-template-columns: 1fr;
    gap: 1.5rem;
  }

  .show-title {
    font-size: 2rem;
  }

  .show-meta {
    flex-direction: column;
    gap: 0.5rem;
  }

  .show-actions {
    flex-direction: column;
  }
}

/* Related Content Loading Styles */
.related-content-loading {
  margin-top: 2rem;
  padding: 1.5rem;
  background: var(--bg-card);
  border-radius: 12px;
  border: 1px solid var(--border-color);
  text-align: center;
}

.related-content-loading h3 {
  margin-bottom: 1rem;
  color: var(--text-primary);
}

.loading-spinner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.loading-spinner .spinner {
  width: 40px;
  height: 40px;
  border: 4px solid var(--border-color);
  border-top: 4px solid var(--highlight-color);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.loading-spinner p {
  color: var(--text-muted);
  margin: 0;
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
  background: linear-gradient(90deg, var(--coral-light), var(--tan-primary));
  border-radius: 8px;
}

.franchise-info h4 {
  margin: 0;
  color: white;
  font-size: 1.1rem;
}

.franchise-link {
  color: white;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.franchise-order-link {
  display: inline-block;
  margin-top: 0.4rem;
  color: white;
  font-size: 0.9rem;
  font-weight: 600;
}

.franchise-order-link:hover {
  text-decoration: underline;
}

.franchise-rating {
  margin: 0.35rem 0 0;
  color: white;
  font-size: 0.95rem;
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
  color: var(--coral-deep);
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
.show-description p,
.show-description h2,
.show-description h3,
.show-description h4 {
  color: var(--text-primary);
}

.show-description p {
  color: var(--text-secondary);
}

.original-title {
  color: var(--text-muted) !important;
}

.vote-count {
  color: var(--text-muted) !important;
}

.show-meta span {
  color: var(--text-primary) !important;
}

.genre-tag {
  color: var(--text-on-accent) !important;
}
</style>
