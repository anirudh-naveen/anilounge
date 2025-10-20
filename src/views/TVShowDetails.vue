<template>
  <div class="tv-details">
    <div class="back-button" @click="goBack">
      <i class="fas fa-arrow-left"></i>
      Back
    </div>

    <div v-if="loading" class="loading">
      <div class="spinner"></div>
      <p>Loading TV show details...</p>
    </div>

    <div v-else-if="error" class="error">
      <h2>Error loading TV show</h2>
      <p>{{ error }}</p>
      <button @click="goBack" class="btn-primary">Go Back</button>
    </div>

    <div v-else-if="show" class="show-content">
      <div class="show-header">
        <div class="show-poster">
          <img
            v-if="show.posterPath"
            :src="getPosterUrl(show.posterPath)"
            :alt="show.title"
            @error="handleImageError"
          />
          <div v-else class="no-poster">
            <i class="fas fa-tv"></i>
            <p>No poster available</p>
          </div>
        </div>

        <div class="show-info">
          <h1 class="show-title">{{ show.title }}</h1>
          <p v-if="show.originalTitle && show.originalTitle !== show.title" class="original-title">
            Original Title: {{ show.originalTitle }}
          </p>

          <div class="show-meta">
            <div class="rating">
              <i class="fas fa-star"></i>
              <span>{{ show.unifiedScore?.toFixed(1) || 'N/A' }}</span>
              <span class="vote-count">({{ show.voteCount || 0 }} votes)</span>
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

            <div v-if="show.malStatus" class="status">
              <i class="fas fa-info-circle"></i>
              <span>{{ show.malStatus }}</span>
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

          <div class="show-actions">
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

            <button @click="shareShow" class="btn-outline">
              <i class="fas fa-share"></i>
              Share
            </button>
          </div>
        </div>
      </div>

      <div class="show-description">
        <h2>Overview</h2>
        <p>{{ show.overview || 'No overview available.' }}</p>
      </div>

      <div v-if="show.studios?.length" class="network-info">
        <h3>Studios</h3>
        <div class="networks">
          <span v-for="studio in show.studios" :key="`studio-${studio}`" class="network-tag">
            {{ studio }}
          </span>
        </div>
      </div>

      <div v-if="show.productionCompanies?.length" class="production-info">
        <h3>Production Companies</h3>
        <div class="companies">
          <span v-for="company in show.productionCompanies" :key="company" class="company-tag">
            {{ company }}
          </span>
        </div>
      </div>

      <div v-if="show.alternativeTitles?.length" class="alternative-titles">
        <h3>Alternative Titles</h3>
        <div class="titles">
          <span v-for="title in show.alternativeTitles" :key="title" class="title-tag">
            {{ title }}
          </span>
        </div>
      </div>
    </div>

    <!-- Status Dropdown -->
    <StatusDropdown
      v-if="showStatusDropdown"
      :show-dropdown="showStatusDropdown"
      :content-id="show?._id || ''"
      :content-type="'tv'"
      @close="showStatusDropdown = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
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

const show = ref<UnifiedContent | null>(null)
const loading = ref(true)
const error = ref('')
const showStatusDropdown = ref(false)

const isInWatchlist = computed(() => {
  if (!show.value || !authStore.user?.watchlist) return false
  return authStore.user.watchlist.some((item) => item.content?._id === show.value?._id)
})

onMounted(async () => {
  const showId = route.params.id as string
  if (!showId) {
    error.value = 'No TV show ID provided'
    loading.value = false
    return
  }

  try {
    // Try to get show from store first
    const existingShow = contentStore.tvShows.find((s) => s._id === showId)
    if (existingShow) {
      show.value = existingShow
      loading.value = false
      return
    }

    // If not in store, fetch from API
    const response = await contentAPI.getContentById(showId)
    show.value = response.data.data
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load TV show'
  } finally {
    loading.value = false
  }
})

const goBack = () => {
  // Check if we have a previous page in the route state
  const previousPage = route.query.from as string
  if (previousPage) {
    // Extract the page number from the query string
    const url = new URL(previousPage, window.location.origin)
    const page = url.searchParams.get('page') || '1'
    router.push({ path: '/tv', query: { page } })
  } else {
    // Default fallback to TV shows page
    router.push('/tv')
  }
}

const removeFromWatchlist = async () => {
  if (!show.value) return

  try {
    await contentStore.removeFromWatchlist(show.value._id)
  } catch (err) {
    console.error('Failed to remove from watchlist:', err)
  }
}

const shareShow = () => {
  if (navigator.share && show.value) {
    navigator.share({
      title: show.value.title,
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

const handleImageError = (event: Event) => {
  const img = event.target as HTMLImageElement
  img.style.display = 'none'
}
</script>

<style scoped>
.tv-details {
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
  background: var(--highlight-color);
  color: white;
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
  font-size: 0.9rem;
  font-weight: 500;
}

.show-actions {
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
  background: var(--highlight-color);
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

.network-info,
.production-info,
.creator-info {
  margin-bottom: 2rem;
}

.network-info h3,
.production-info h3,
.creator-info h3 {
  font-size: 1.2rem;
  margin-bottom: 0.5rem;
  color: var(--text-primary);
}

.networks,
.companies,
.countries,
.creators {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.network-tag,
.company-tag,
.country-tag,
.creator-tag {
  background: var(--bg-card);
  color: var(--text-primary);
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
  font-size: 0.9rem;
  border: 1px solid var(--border-color);
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
</style>
