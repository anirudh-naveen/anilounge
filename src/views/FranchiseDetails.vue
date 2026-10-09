<!--
  FranchiseDetails.vue — franchise detail view.

  Own screen for a catalog franchise: its name, nicknames, rating across the
  franchise, and every movie, series, and special in it as a numbered watch-order
  timeline (release order, with each title after its prequels).
-->
<template>
  <div class="franchise-details">
    <div class="back-button" @click="goBack">
      <i class="fas fa-arrow-left"></i>
      Back
    </div>

    <div v-if="loading" class="loading">
      <div class="spinner"></div>
      <p>Loading franchise...</p>
    </div>

    <div v-else-if="error" class="error">
      <h2>Error loading franchise</h2>
      <p>{{ error }}</p>
      <button @click="goBack" class="btn-primary">Go Back</button>
    </div>

    <div v-else-if="franchise" class="franchise-content">
      <div class="franchise-header">
        <p class="entity-kicker">Franchise</p>
        <h1 class="franchise-title">{{ franchise.name }}</h1>
        <p v-if="franchise.nicknames.length" class="nicknames">
          Also known as {{ franchise.nicknames.join(', ') }}
        </p>
        <p class="franchise-counts" data-testid="franchise-counts">
          {{ countsLabel }}
          <span v-if="franchise.rating" class="franchise-rating">
            · <i class="fas fa-star"></i> {{ franchise.rating.toFixed(1) }} across the franchise
          </span>
        </p>
        <p v-if="franchise.about" class="about-text">{{ franchise.about }}</p>
      </div>

      <h2 class="timeline-heading">Watch order</h2>
      <p class="timeline-note">Release order, with each title placed after the story it follows.</p>

      <ol v-if="franchise.works.length" class="timeline" data-testid="franchise-timeline">
        <li
          v-for="(work, index) in franchise.works"
          :key="work._id"
          class="timeline-item"
          :data-testid="`franchise-work-${work._id}`"
          @click="openWork(work)"
        >
          <span class="timeline-step">{{ index + 1 }}</span>
          <div class="timeline-card">
            <FavoriteHeart :content-id="work._id" />
            <img
              v-if="work.posterPath"
              class="timeline-poster"
              :src="getPosterUrl(work.posterPath)"
              :alt="getDisplayTitle(work)"
              @error="hideBrokenImage"
            />
            <div v-else class="timeline-poster no-poster">
              <i :class="work.contentType === 'tv' ? 'fas fa-tv' : 'fas fa-film'"></i>
            </div>
            <div class="timeline-info">
              <h3>{{ getDisplayTitle(work) }}</h3>
              <p class="content-type">
                {{ getCardContentTypeDisplay(work.contentType || 'movie') }}
                <span v-if="workYear(work)"> · {{ workYear(work) }}</span>
                <span v-if="work.contentType === 'tv' && work.episodeCount">
                  · {{ work.episodeCount }} {{ work.episodeCount === 1 ? 'episode' : 'episodes' }}
                </span>
              </p>
              <div v-if="work.unifiedScore" class="rating">
                <i class="fas fa-star"></i>
                <span>{{ Number(work.unifiedScore).toFixed(1) }}</span>
              </div>
            </div>
          </div>
        </li>
      </ol>

      <p v-else class="no-works">No catalog titles are linked to this franchise yet.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { goBackOr } from '@/utils/navigation'
import { hideBrokenImage } from '@/utils/posters'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  contentAPI,
  getCardContentTypeDisplay,
  getDetailsRouteName,
  getPosterUrl,
} from '@/services/api'
import { getDisplayTitle } from '@/utils/titles'
import type { FranchiseDetails, UnifiedContent } from '@/types/content'
import FavoriteHeart from '@/components/FavoriteHeart.vue'
import { usePageMeta } from '@/composables/usePageMeta'
import { entityPageMeta } from '@/utils/pageMeta'

const route = useRoute()
const router = useRouter()

const franchise = ref<FranchiseDetails | null>(null)
const loading = ref(true)
const error = ref('')

const countsLabel = computed(() => {
  const works = franchise.value?.works || []
  const series = works.filter((work) => work.contentType === 'tv').length
  const movies = works.filter((work) => work.contentType === 'movie').length
  const specials = works.length - series - movies
  const parts = []
  if (series) parts.push(`${series} series`)
  if (movies) parts.push(`${movies} ${movies === 1 ? 'movie' : 'movies'}`)
  if (specials) parts.push(`${specials} ${specials === 1 ? 'special' : 'specials'}`)
  return parts.length ? parts.join(' · ') : 'No catalog titles yet'
})

const workYear = (work: UnifiedContent) => {
  const date = work.releaseDate ? new Date(work.releaseDate) : null
  const year = date && !Number.isNaN(date.getTime()) ? date.getFullYear() : 0
  return year || work.startSeasonYear || null
}

const loadFranchise = async (id: string) => {
  loading.value = true
  error.value = ''
  try {
    const response = await contentAPI.getFranchise(id)
    franchise.value = response.data.data
    window.scrollTo(0, 0)
  } catch (err) {
    const status = (err as { response?: { status?: number } })?.response?.status
    error.value =
      status === 404
        ? 'Franchise not found'
        : err instanceof Error
          ? err.message
          : 'Failed to load franchise'
    franchise.value = null
  } finally {
    loading.value = false
  }
}

const openWork = (work: UnifiedContent) => {
  router.push({
    name: getDetailsRouteName({ contentType: work.contentType }),
    params: { id: work._id },
    query: { from: route.fullPath },
  })
}

/** Back to the previous page, or the `from` page (else Search) when opened directly. */
const goBack = () => goBackOr(router, () => router.push((route.query.from as string) || '/search'))

watch(
  () => route.params.id,
  (id) => {
    if (typeof id === 'string') loadFranchise(id)
  },
  { immediate: true },
)

usePageMeta(() => {
  const value = franchise.value
  if (!value) return null
  return entityPageMeta('franchise', value, {
    path: `/franchise/${route.params.id}`,
    image: value.imagePath ? getPosterUrl(value.imagePath) : null,
    works: value.works.map((work) => getDisplayTitle(work)),
  })
})
</script>

<style scoped>
.franchise-details {
  max-width: 900px;
  margin: 0 auto;
  padding: 1.5rem;
}

.back-button {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 1.25rem;
  cursor: pointer;
  color: var(--text-secondary);
}

.loading,
.error {
  text-align: center;
  padding: 3rem 1rem;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid var(--border-color);
  border-top: 4px solid var(--highlight-color);
  border-radius: 50%;
  margin: 0 auto 1rem;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.btn-primary {
  border-radius: 8px;
  padding: 0.65rem 1.1rem;
  font-weight: 600;
  cursor: pointer;
  background: var(--coral-primary);
  color: white;
  border: 0;
}

.franchise-header {
  margin-bottom: 2rem;
  padding: 1.5rem;
  border-radius: 12px;
  background: linear-gradient(90deg, var(--coral-light), var(--tan-primary));
  color: white;
}

.entity-kicker {
  margin: 0 0 0.35rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 0.8rem;
  opacity: 0.85;
}

.franchise-title {
  margin: 0 0 0.5rem;
  font-size: 2.2rem;
}

.nicknames,
.franchise-counts {
  margin: 0 0 0.35rem;
}

.about-text {
  white-space: pre-wrap;
  line-height: 1.6;
  margin: 0.75rem 0 0;
}

.timeline-heading {
  margin: 0 0 0.25rem;
  color: var(--text-primary);
}

.timeline-note {
  margin: 0 0 1.25rem;
  color: var(--text-muted);
  font-size: 0.9rem;
}

.timeline {
  list-style: none;
  margin: 0;
  padding: 0;
  position: relative;
}

/* The line joining the step numbers. */
.timeline::before {
  content: '';
  position: absolute;
  left: 17px;
  top: 18px;
  bottom: 18px;
  width: 2px;
  background: var(--border-color);
}

.timeline-item {
  position: relative;
  display: flex;
  gap: 1rem;
  align-items: center;
  margin-bottom: 1rem;
  cursor: pointer;
}

.timeline-step {
  position: relative;
  flex: 0 0 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  color: white;
  background: var(--coral-primary);
}

.timeline-card {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  gap: 1rem;
  align-items: center;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  overflow: hidden;
  transition:
    transform 0.2s ease,
    border-color 0.2s ease;
}

.timeline-item:hover .timeline-card {
  transform: translateX(3px);
  border-color: var(--coral-primary);
}

.timeline-poster {
  width: 70px;
  height: 100px;
  object-fit: cover;
  flex-shrink: 0;
}

.no-poster {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  background: var(--bg-hover);
  font-size: 1.3rem;
}

.timeline-info {
  min-width: 0;
  padding: 0.5rem 2.5rem 0.5rem 0;
}

.timeline-info h3 {
  margin: 0 0 0.25rem;
  font-size: 1.05rem;
  color: var(--text-primary);
}

.content-type {
  margin: 0;
  font-size: 0.85rem;
  color: var(--text-muted);
}

.rating {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  margin-top: 0.3rem;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.rating i {
  color: var(--gold-accent);
}

.no-works {
  color: var(--text-muted);
}

@media (max-width: 600px) {
  .franchise-details {
    padding: 1rem;
  }

  .franchise-title {
    font-size: 1.7rem;
  }
}
</style>
