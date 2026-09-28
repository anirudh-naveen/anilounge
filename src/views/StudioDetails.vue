<!--
  StudioDetails.vue — animation-studio detail view.

  Own screen for a catalog studio: logo, about, favorite toggle, and every
  series and movie it worked on (never episodes). Not a Movies/TV tab.
-->
<template>
  <div class="studio-details">
    <div class="back-button" @click="goBack">
      <i class="fas fa-arrow-left"></i>
      Back
    </div>

    <div v-if="loading" class="loading">
      <div class="spinner"></div>
      <p>Loading studio...</p>
    </div>

    <div v-else-if="error" class="error">
      <h2>Error loading studio</h2>
      <p>{{ error }}</p>
      <button @click="goBack" class="btn-primary">Go Back</button>
    </div>

    <div v-else-if="studio" class="studio-content">
      <div class="studio-header">
        <div class="studio-logo">
          <img
            v-if="studio.imagePath && !logoFailed"
            :src="getPosterUrl(studio.imagePath)"
            :alt="studio.name"
            referrerpolicy="no-referrer"
            @error="logoFailed = true"
          />
          <div v-else class="no-logo">
            <i class="fas fa-building"></i>
            <p>No logo available</p>
          </div>
        </div>

        <div class="studio-info">
          <p class="entity-kicker">Animation studio</p>
          <h1 class="studio-title">{{ studio.name }}</h1>
          <p v-if="studio.nativeName" class="native-name">
            Native Name: {{ studio.nativeName }}
          </p>
          <p class="studio-counts" data-testid="studio-counts">{{ countsLabel }}</p>

          <div class="studio-actions">
            <button
              v-if="authStore.isAuthenticated"
              type="button"
              data-testid="favorite-action"
              :class="studio.isFavorited ? 'btn-secondary' : 'btn-primary'"
              @click="onToggleFavorite"
            >
              <i :class="studio.isFavorited ? 'fas fa-heart' : 'far fa-heart'"></i>
              {{ studio.isFavorited ? 'Favorited' : 'Add to Favorites' }}
            </button>
            <button v-else type="button" class="btn-outline" @click="router.push('/login')">
              Sign in to favorite
            </button>
          </div>
        </div>
      </div>

      <div class="studio-description">
        <h2>About</h2>
        <p class="about-text">{{ studio.about || 'No description available.' }}</p>
      </div>

      <div
        v-for="section in workSections"
        :key="section.key"
        class="studio-works"
        :data-testid="`studio-${section.key}`"
      >
        <h2>{{ section.title }} <span class="section-count">{{ section.works.length }}</span></h2>
        <div class="content-grid">
          <div
            v-for="work in section.works"
            :key="work._id"
            class="content-card"
            :data-testid="`studio-work-${work._id}`"
            @click="openWork(work)"
          >
            <FavoriteHeart :content-id="work._id" />
            <img
              v-if="work.posterPath"
              :src="getPosterUrl(work.posterPath)"
              :alt="getDisplayTitle(work)"
              @error="handleImageError"
            />
            <div v-else class="no-poster">
              <i :class="work.contentType === 'tv' ? 'fas fa-tv' : 'fas fa-film'"></i>
            </div>
            <div class="content-info">
              <h5>{{ getDisplayTitle(work) }}</h5>
              <p class="content-type">
                {{ getCardContentTypeDisplay(work.contentType || 'movie') }}
                <span v-if="workYear(work)"> · {{ workYear(work) }}</span>
              </p>
              <div v-if="work.unifiedScore" class="rating">
                <i class="fas fa-star"></i>
                <span>{{ Number(work.unifiedScore).toFixed(1) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <p v-if="!workSections.length" class="no-works">
        No catalog movies or series are linked to this studio yet.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useEntityStore } from '@/stores/entities'
import { getCardContentTypeDisplay, getDetailsRouteName, getPosterUrl } from '@/services/api'
import { getDisplayTitle } from '@/utils/titles'
import { collectStudioWorks, studioWorkYear, type StudioWork } from '@/utils/entities'
import type { CatalogEntity } from '@/types/content'
import FavoriteHeart from '@/components/FavoriteHeart.vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const entityStore = useEntityStore()

const studio = ref<CatalogEntity | null>(null)
const loading = ref(true)
const error = ref('')
const logoFailed = ref(false)

const works = computed(() => collectStudioWorks(studio.value))

const workSections = computed(() =>
  [
    { key: 'series', title: 'Series', works: works.value.series },
    { key: 'movies', title: 'Movies', works: works.value.movies },
  ].filter((section) => section.works.length),
)

const countsLabel = computed(() => {
  const series = works.value.series.length
  const movies = works.value.movies.length
  const parts = []
  if (series) parts.push(`${series} series`)
  if (movies) parts.push(`${movies} ${movies === 1 ? 'movie' : 'movies'}`)
  return parts.length ? parts.join(' · ') : 'No catalog titles yet'
})

const workYear = (work: StudioWork) => studioWorkYear(work) || null

const loadStudio = async (id: string) => {
  if (!id) {
    error.value = 'No studio ID provided'
    loading.value = false
    return
  }
  loading.value = true
  error.value = ''
  logoFailed.value = false
  try {
    studio.value = await entityStore.getEntityDetails(id)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load studio'
    studio.value = null
  } finally {
    loading.value = false
  }
}

const onToggleFavorite = async () => {
  if (!studio.value) return
  try {
    studio.value = await entityStore.toggleFavorite(studio.value)
  } catch (err) {
    console.error('Favorite update failed:', err)
  }
}

const openWork = (work: StudioWork) => {
  router.push({
    name: getDetailsRouteName({ contentType: work.contentType }),
    params: { id: work._id },
    query: { from: route.fullPath },
  })
}

const goBack = () => {
  const previous = route.query.from as string
  if (previous) {
    router.push(previous)
    return
  }
  router.push('/search')
}

const handleImageError = (event: Event) => {
  const img = event.target as HTMLImageElement
  img.style.display = 'none'
}

watch(
  () => route.params.id,
  (id) => {
    if (typeof id === 'string') loadStudio(id)
  },
  { immediate: true },
)
</script>

<style scoped>
.studio-details {
  max-width: 1100px;
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

.studio-header {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 2rem;
  margin-bottom: 2rem;
}

.studio-logo img,
.no-logo {
  width: 220px;
  height: 220px;
  border-radius: 12px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
}

.studio-logo img {
  object-fit: contain;
  padding: 1.25rem;
}

.no-logo {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  gap: 0.5rem;
}

.no-logo i {
  font-size: 2.5rem;
}

.entity-kicker {
  margin: 0 0 0.35rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 0.8rem;
  color: var(--text-muted);
}

.studio-title {
  margin: 0 0 0.5rem;
  font-size: 2.2rem;
  color: var(--text-primary);
}

.native-name {
  color: var(--text-secondary);
  margin-bottom: 0.5rem;
}

.studio-counts {
  color: var(--text-secondary);
  margin-bottom: 1.25rem;
}

.studio-actions {
  display: flex;
  gap: 0.75rem;
}

.btn-primary,
.btn-secondary,
.btn-outline {
  border-radius: 8px;
  padding: 0.65rem 1.1rem;
  font-weight: 600;
  cursor: pointer;
}

.btn-primary {
  background: var(--coral-primary);
  color: white;
  border: 0;
}

.btn-secondary,
.btn-outline {
  background: var(--bg-card);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
}

.studio-description,
.studio-works {
  margin-bottom: 2rem;
}

.studio-works h2 {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.section-count {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-muted);
  background: var(--bg-hover);
  border-radius: 999px;
  padding: 0.1rem 0.6rem;
}

.about-text {
  white-space: pre-wrap;
  line-height: 1.6;
  color: var(--text-secondary);
}

.no-works {
  color: var(--text-muted);
}

.content-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 1rem;
}

.content-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  overflow: hidden;
  cursor: pointer;
  transition:
    transform 0.2s ease,
    border-color 0.2s ease;
}

.content-card:hover {
  transform: translateY(-3px);
  border-color: var(--coral-primary);
}

.content-card img,
.no-poster {
  width: 100%;
  height: 220px;
  object-fit: cover;
}

.no-poster {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  background: var(--bg-hover);
  font-size: 1.5rem;
}

.content-info {
  padding: 0.65rem 0.75rem 0.9rem;
}

.content-info h5 {
  margin: 0 0 0.25rem;
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

@media (max-width: 768px) {
  .studio-header {
    grid-template-columns: 1fr;
  }
}
</style>
