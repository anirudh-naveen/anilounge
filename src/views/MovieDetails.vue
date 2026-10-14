<!--
  MovieDetails.vue — movie detail view.

  Loads one movie by route id and shows poster, titles, franchise, meta, watchlist
  actions, then overview, characters, tags, where to watch and trailer, the
  forum, and credits.
-->
<template>
  <div class="movie-details">
    <!-- Navigation -->
    <div class="back-button" @click="goBack">
      <i class="fas fa-arrow-left"></i>
      Back
    </div>

    <!-- Status -->
    <!-- Title: Loading State -->
    <div v-if="loading" class="loading">
      <div class="spinner"></div>
      <p>Loading movie details...</p>
    </div>

    <!-- Title: Error State -->
    <div v-else-if="error" class="error">
      <h2>Error Loading Movie</h2>
      <p>{{ error }}</p>
      <button @click="goBack" class="btn-primary">Go Back</button>
    </div>

    <div v-else-if="movie" class="movie-content">
      <!-- Header -->
      <div class="movie-header title-header">
        <!-- Title: Poster -->
        <div class="movie-poster title-poster">
          <img
            v-if="movie.posterPath"
            :src="getPosterUrl(movie.posterPath)"
            :alt="getDisplayTitle(movie)"
            @error="hideBrokenImage"
          />
          <div v-else class="no-poster">
            <i class="fas fa-film"></i>
            <p>No poster available</p>
          </div>
        </div>

        <div class="movie-info title-info">
          <!-- Title: Titles -->
          <h1 class="movie-title title-heading">{{ getDisplayTitle(movie) }}</h1>
          <p v-if="getNativeTitle(movie)" class="original-title" lang="ja">
            {{ getNativeTitle(movie) }}
          </p>

          <!-- Title: Facts -->
          <ul class="title-facts">
            <li class="fact-rating">
              <ForumIcon name="star" filled class="fact-star" />
              <strong>{{ getDisplayScore(movie) }}</strong>
              <span v-if="getDisplayVoteCount(movie)" class="fact-muted">
                {{ formatVotes(getDisplayVoteCount(movie)) }} votes
              </span>
            </li>
            <li v-if="movie.releaseDate">{{ formatDate(movie.releaseDate) }}</li>
            <li v-if="movie.runtime">{{ movie.runtime }} min</li>
            <li v-if="isUpcoming(movie)" class="fact-badge">
              <AiringBadge :content="movie" variant="detail" />
            </li>
          </ul>

          <div v-if="movie.genres?.length" class="genres">
            <span
              v-for="genre in movie.genres"
              :key="typeof genre === 'string' ? genre : genre.name || genre.id"
              class="genre-tag"
            >
              {{ typeof genre === 'string' ? genre : genre.name }}
            </span>
          </div>

          <div class="title-pills">
            <FranchiseLink :content="movie" />
            <MainStudio :content="movie" />
          </div>

          <!-- Title: Actions -->
          <div class="movie-actions title-actions">
            <FavoriteHeart :content-id="movie._id" variant="button" />
            <button @click="shareMovie" class="btn-outline">
              <svg
                class="action-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M12 3.5v11M8 7.5l4-4 4 4" />
                <path
                  d="M7 10.5H6A1.5 1.5 0 0 0 4.5 12v7A1.5 1.5 0 0 0 6 20.5h12a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5h-1"
                />
              </svg>
              Share
            </button>
          </div>
        </div>
      </div>

      <!-- Title: Watchlist -->
      <WatchlistPanel :content-id="movie._id" content-type="movie" />

      <!-- Body -->
      <!-- Title: Overview -->
      <DetailSection
        name="overview"
        title="Overview"
        :collapsible="false"
        class="movie-description"
      >
        <p>{{ movie.overview || 'No overview available.' }}</p>
      </DetailSection>

      <!-- Title: Characters -->
      <EntityCastRow :items="characters" :content-id="movie._id" :loading="charactersLoading" />

      <!-- Title: Tags -->
      <TitleExtras :content="movie" :sections="['tags']" />

      <!-- Title: Where to Watch -->
      <WhereToWatch :content-id="movie._id" />
      <TitleExtras :content="movie" :sections="['trailer']" />

      <!-- Title: Credits -->
      <StudioLinks :content="movie" />
      <TitleExtras :content="movie" :sections="['staff']" />
    </div>

    <JoinPrompt
      list-sync
      title="Track This Movie"
      message="Sign up free to add it to your watchlist, rate it, and see what other fans think."
    />
  </div>
</template>

<script setup lang="ts">
import { goBackOr, returnToListing } from '@/utils/navigation'
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useContentStore } from '@/stores/content'
import { useAuthStore } from '@/stores/auth'
import { contentAPI, getPosterUrl } from '@/services/api'
import WatchlistPanel from '@/components/WatchlistPanel.vue'
import AiringBadge from '@/components/AiringBadge.vue'
import EntityCastRow from '@/components/EntityCastRow.vue'
import StudioLinks from '@/components/StudioLinks.vue'
import type { CatalogEntity, UnifiedContent } from '@/types/content'
import { useEntityStore } from '@/stores/entities'
import { getTotalVoteCount, getWeightedAverage } from '@/utils/ratings'
import { getDisplayTitle, getNativeTitle } from '@/utils/titles'
import { isUpcoming } from '@/utils/airing'
import { hideBrokenImage } from '@/utils/posters'
import JoinPrompt from '@/components/JoinPrompt.vue'
import { usePageMeta } from '@/composables/usePageMeta'
import { useCanonicalSlug } from '@/composables/useCanonicalSlug'
import { detailPath } from '@/utils/slug'
import { titlePageMeta } from '@/utils/pageMeta'
import { shareLink } from '@/utils/nativeApp'
import WhereToWatch from '@/components/WhereToWatch.vue'
import TitleExtras from '@/components/TitleExtras.vue'
import FranchiseLink from '@/components/FranchiseLink.vue'
import MainStudio from '@/components/MainStudio.vue'
import FavoriteHeart from '@/components/FavoriteHeart.vue'
import DetailSection from '@/components/DetailSection.vue'
import ForumIcon from '@/components/ForumIcon.vue'
import { useToast } from 'vue-toastification'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const contentStore = useContentStore()
const authStore = useAuthStore()
const entityStore = useEntityStore()

const movie = ref<UnifiedContent | null>(null)
const loading = ref(true)
const error = ref('')
const characters = ref<CatalogEntity[]>([])
const charactersLoading = ref(false)
let detailsRequestId = 0
let charactersRequestId = 0

const getDisplayScore = (content: UnifiedContent) => {
  const average = getWeightedAverage(content)
  return average != null ? average.toFixed(1) : 'N/A'
}

const getDisplayVoteCount = (content: UnifiedContent) => getTotalVoteCount(content)

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

const loadMovie = async (movieId: string) => {
  const requestId = ++detailsRequestId

  if (!movieId) {
    error.value = 'No movie ID provided'
    loading.value = false
    return
  }

  error.value = ''
  characters.value = []
  contentStore.scrollToTop()
  fetchCharacters(movieId)

  const cached = contentStore.findContentById(movieId)
  if (cached) {
    movie.value = cached
    contentStore.cacheContent(cached, true)
    loading.value = false
    return
  }

  loading.value = true
  movie.value = null

  try {
    const response = await contentAPI.getContentById(movieId)
    if (requestId !== detailsRequestId) return
    movie.value = response.data.data
    contentStore.cacheContent(movie.value, true)
    loading.value = false
  } catch (err) {
    if (requestId !== detailsRequestId) return
    error.value = err instanceof Error ? err.message : 'Failed to load movie'
    loading.value = false
  }
}

const goBack = () =>
  goBackOr(router, () => returnToListing(router, route.query.from as string, contentStore))

const shareMovie = async () => {
  if (!movie.value) return
  const result = await shareLink({
    title: getDisplayTitle(movie.value),
    text: movie.value.overview,
    url: window.location.href,
  })
  if (result === 'copied') toast.success('Link copied!')
  if (result === 'failed') toast.error("Couldn't share this page.")
}

const formatVotes = (count: number) =>
  new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(count)

const formatDate = (date: string | Date) => {
  if (!date) return 'N/A'
  const dateObj = typeof date === 'string' ? new Date(date) : date
  return dateObj.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

watch(
  () => route.params.id as string,
  (movieId) => {
    void loadMovie(movieId)
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

usePageMeta(() =>
  movie.value
    ? titlePageMeta(movie.value, {
        path: detailPath('/movie', movie.value._id, getDisplayTitle(movie.value)),
        image: movie.value.posterPath ? getPosterUrl(movie.value.posterPath) : null,
      })
    : null,
)

useCanonicalSlug(
  () => (movie.value ? getDisplayTitle(movie.value) : null),
  () => movie.value?._id,
)
</script>

<style scoped src="@/assets/styles/titleHeader.css"></style>

<style scoped>
.movie-details {
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

.movie-description p {
  margin: 0;
  font-size: 1.1rem;
  line-height: 1.6;
  color: var(--text-secondary);
}

@media (max-width: 768px) {
  .movie-details {
    padding: 1rem;
  }

  .movie-header {
    grid-template-columns: 1fr;
    gap: 1.5rem;
  }
}

/* Phones: overview at a reading size. */
@media (max-width: 600px) {
  .movie-description p {
    font-size: 0.92rem;
    line-height: 1.55;
  }
}
</style>
