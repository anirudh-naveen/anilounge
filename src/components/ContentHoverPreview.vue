<template>
  <div
    ref="rootEl"
    class="hover-preview"
    :class="{ 'open-left': openLeft, 'is-adding': showForm }"
    @click.stop
  >
    <div class="hover-preview-poster">
      <img :src="getPosterUrl(item.posterPath || '')" :alt="item.title" @error="handleImageError" />
    </div>
    <div class="hover-preview-body">
      <div class="hover-preview-header">
        <h3 class="hover-preview-title">{{ item.title }}</h3>
        <div class="hover-preview-rating" :style="getRatingTextStyle(item.unifiedScore)">
          {{ displayRating }}
        </div>
      </div>

      <template v-if="!showForm">
        <p v-if="overview" class="hover-preview-overview">{{ overview }}</p>
        <div class="hover-preview-meta">
          <span v-if="releaseYear" class="meta-chip">{{ releaseYear }}</span>
          <span v-if="item.contentType === 'movie' && item.runtime" class="meta-chip">
            {{ item.runtime }} min
          </span>
          <span
            v-if="item.contentType === 'tv' && (item.episodeCount || item.malEpisodes)"
            class="meta-chip"
          >
            {{ item.episodeCount || item.malEpisodes }} episodes
          </span>
          <span class="meta-chip type-chip">
            {{ getContentTypeDisplay(item.contentType) }}
          </span>
        </div>
        <div v-if="displayGenres.length" class="hover-preview-genres">
          <span v-for="genre in displayGenres" :key="genre" class="genre-tag">{{ genre }}</span>
        </div>
        <button
          v-if="isAuthenticated && showWatchlist"
          type="button"
          class="hover-watchlist-btn"
          :class="{ added: inWatchlist }"
          :disabled="inWatchlist"
          @click.stop="openForm"
        >
          {{ inWatchlist ? 'In Watchlist' : 'Add to Watchlist' }}
        </button>
      </template>

      <form v-else class="hover-watchlist-form" @submit.prevent="submitWatchlist">
        <label class="form-field">
          <span>Status</span>
          <select v-model="selectedStatus" class="form-control">
            <option value="plan_to_watch">Plan to Watch</option>
            <option value="watching">Watching</option>
            <option value="completed">Completed</option>
            <option value="dropped">Dropped</option>
          </select>
        </label>
        <label class="form-field">
          <span>Rating (1-10)</span>
          <input
            v-model.number="selectedRating"
            type="number"
            min="1"
            max="10"
            class="form-control"
            placeholder="Optional"
          />
        </label>
        <label v-if="item.contentType === 'tv'" class="form-field">
          <span>Episodes watched</span>
          <input
            v-model.number="selectedEpisodes"
            type="number"
            min="0"
            :max="maxEpisodes || undefined"
            class="form-control"
            placeholder="0"
          />
        </label>
        <label class="form-field">
          <span>Notes</span>
          <textarea
            v-model="selectedNotes"
            class="form-control form-notes"
            placeholder="Add your thoughts..."
            rows="2"
          ></textarea>
        </label>
        <div class="form-actions">
          <button type="button" class="form-cancel" @click.stop="closeForm">Cancel</button>
          <button type="submit" class="hover-watchlist-btn form-submit" :disabled="isSaving">
            {{ isSaving ? 'Adding...' : 'Add to Watchlist' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { getPosterUrl, formatGenres, getContentTypeDisplay } from '@/services/api'
import { getRatingTextStyle } from '@/utils/ratingColors'
import { useContentStore } from '@/stores/content'
import { useAuthStore } from '@/stores/auth'
import { useToast } from 'vue-toastification'
import type { UnifiedContent } from '@/types/content'

const PREVIEW_WIDTH = 420

const props = withDefaults(
  defineProps<{
    item: UnifiedContent
    isAuthenticated?: boolean
    inWatchlist?: boolean
    showWatchlist?: boolean
  }>(),
  {
    isAuthenticated: false,
    inWatchlist: false,
    showWatchlist: true,
  },
)

const contentStore = useContentStore()
const authStore = useAuthStore()
const toast = useToast()

const rootEl = ref<HTMLElement | null>(null)
const openLeft = ref(false)
const showForm = ref(false)
const isSaving = ref(false)
const selectedStatus = ref<'plan_to_watch' | 'watching' | 'completed' | 'dropped'>('plan_to_watch')
const selectedRating = ref<number | undefined>(undefined)
const selectedEpisodes = ref<number>(0)
const selectedNotes = ref('')

const displayRating = computed(() =>
  props.item.unifiedScore ? props.item.unifiedScore.toFixed(1) : 'N/A',
)

const overview = computed(() => {
  const text = props.item.overview || ''
  return text.length > 180 ? `${text.slice(0, 180)}...` : text
})

const releaseYear = computed(() => {
  if (!props.item.releaseDate) return ''
  return new Date(props.item.releaseDate).getFullYear()
})

const displayGenres = computed(() => formatGenres(props.item.genres)?.slice(0, 3) || [])

const maxEpisodes = computed(() => props.item.episodeCount || props.item.malEpisodes || undefined)

const handleImageError = (event: Event) => {
  const img = event.target as HTMLImageElement
  img.src = '/placeholder-movie.jpg'
}

const resetForm = () => {
  selectedStatus.value = 'plan_to_watch'
  selectedRating.value = undefined
  selectedEpisodes.value = 0
  selectedNotes.value = ''
}

const closeForm = () => {
  showForm.value = false
  resetForm()
}

const openForm = () => {
  if (!authStore.isAuthenticated) {
    toast.error('Please log in to add items to your watchlist')
    return
  }
  if (props.inWatchlist) {
    toast.info('Already in your watchlist!')
    return
  }
  showForm.value = true
}

const submitWatchlist = async () => {
  if (!authStore.isAuthenticated) {
    toast.error('Please log in to add items to your watchlist')
    return
  }

  isSaving.value = true
  try {
    await contentStore.addToWatchlist(
      props.item._id,
      selectedStatus.value,
      selectedRating.value,
      props.item.contentType === 'tv' ? selectedEpisodes.value : undefined,
      undefined,
      selectedNotes.value || undefined,
    )
    toast.success('Added to watchlist!')
    closeForm()
  } catch (error) {
    console.error('Error adding to watchlist:', error)
    toast.error('Failed to add to watchlist')
  } finally {
    isSaving.value = false
  }
}

const updateAlignment = () => {
  const card = rootEl.value?.parentElement
  if (!card) return
  const rect = card.getBoundingClientRect()
  openLeft.value = window.innerWidth - rect.right < PREVIEW_WIDTH + 24
}

const handleCardLeave = () => {
  const active = document.activeElement
  if (active && rootEl.value?.contains(active)) return
  closeForm()
}

onMounted(() => {
  const card = rootEl.value?.parentElement
  card?.addEventListener('mouseenter', updateAlignment)
  card?.addEventListener('mouseleave', handleCardLeave)
  window.addEventListener('resize', updateAlignment)
})

onBeforeUnmount(() => {
  const card = rootEl.value?.parentElement
  card?.removeEventListener('mouseenter', updateAlignment)
  card?.removeEventListener('mouseleave', handleCardLeave)
  window.removeEventListener('resize', updateAlignment)
})
</script>

<style scoped>
.hover-preview {
  position: absolute;
  top: 0;
  left: calc(100% + 10px);
  width: 400px;
  display: none;
  flex-direction: row;
  align-items: stretch;
  background: white;
  border-radius: 10px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.28);
  overflow: visible;
  z-index: 40;
  text-align: left;
  cursor: default;
  color-scheme: light;
}

.hover-preview.is-adding {
  z-index: 50;
}

.hover-preview::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  width: 14px;
  left: -14px;
}

.hover-preview.open-left {
  left: auto;
  right: calc(100% + 10px);
}

.hover-preview.open-left::before {
  left: auto;
  right: -14px;
}

.hover-preview-poster {
  flex: 0 0 140px;
  width: 140px;
  min-height: 210px;
  background: #eee;
  overflow: hidden;
  border-radius: 10px 0 0 10px;
}

.hover-preview-poster img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.hover-preview-body {
  flex: 1;
  padding: 0.85rem 0.9rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  min-width: 0;
  background: white;
  border-radius: 0 10px 10px 0;
}

.hover-preview-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
}

.hover-preview-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  color: #222;
  line-height: 1.25;
}

.hover-preview-rating {
  flex-shrink: 0;
  font-weight: 700;
  font-size: 0.9rem;
}

.hover-preview-overview {
  margin: 0;
  color: #555;
  font-size: 0.8rem;
  line-height: 1.4;
}

.hover-preview-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.meta-chip {
  background: #f4f4f4;
  color: #555;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 0.7rem;
}

.type-chip {
  text-transform: uppercase;
  letter-spacing: 0.3px;
  font-weight: 600;
}

.hover-preview-genres {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.genre-tag {
  background: #f0f0f0;
  color: #666;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 0.7rem;
  font-weight: 500;
}

.hover-watchlist-btn {
  margin-top: auto;
  align-self: stretch;
  border: none;
  border-radius: 6px;
  padding: 0.45rem 0.75rem;
  font-weight: 600;
  font-size: 0.8rem;
  cursor: pointer;
  color: white;
  background: linear-gradient(90deg, var(--coral-light), var(--teal-light));
}

.hover-watchlist-btn.added {
  background: #4ecdc4;
  cursor: default;
}

.hover-watchlist-form {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  min-width: 0;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  font-size: 0.72rem;
  font-weight: 600;
  color: #555;
}

.form-control {
  width: 100%;
  border: 1px solid #e4e4e4;
  border-radius: 6px;
  background: #f7f7f7;
  color: #222;
  font-size: 0.8rem;
  font-weight: 500;
  padding: 0.4rem 0.5rem;
  font-family: inherit;
}

.form-control:focus {
  outline: none;
  border-color: #c8c8c8;
  background: #fff;
}

.form-notes {
  resize: vertical;
  min-height: 48px;
}

.form-actions {
  display: flex;
  gap: 0.4rem;
  margin-top: 0.15rem;
}

.form-cancel {
  flex: 0 0 auto;
  border: 1px solid #e0e0e0;
  background: #f4f4f4;
  color: #555;
  border-radius: 6px;
  padding: 0.45rem 0.7rem;
  font-weight: 600;
  font-size: 0.8rem;
  cursor: pointer;
}

.form-cancel:hover {
  background: #ececec;
}

.form-submit {
  flex: 1;
  margin-top: 0;
}

.form-submit:disabled {
  opacity: 0.7;
  cursor: wait;
}
</style>

<style>
.movie-card:hover > .hover-preview,
.show-card:hover > .hover-preview,
.result-card:hover > .hover-preview,
.content-card:hover > .hover-preview,
.movie-card:has(.hover-preview.is-adding) > .hover-preview,
.show-card:has(.hover-preview.is-adding) > .hover-preview,
.result-card:has(.hover-preview.is-adding) > .hover-preview,
.content-card:has(.hover-preview.is-adding) > .hover-preview {
  display: flex;
  flex-direction: row;
}

@media (hover: none) {
  .hover-preview {
    display: none !important;
  }
}
</style>
