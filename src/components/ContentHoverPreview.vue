<!--
  ContentHoverPreview.vue — catalog hover card (component).

  Shows titles, rating, overview, and watchlist add controls when a
  content card is hovered. The card poster is not repeated here.
-->
<template>
  <!-- The open form floats on <body> so scrolling rails cannot clip it. -->
  <Teleport to="body" :disabled="!showForm">
    <div
      ref="rootEl"
      class="hover-preview"
      :class="{ 'open-left': openLeft, 'is-adding': showForm }"
      :style="showForm ? floatStyle : undefined"
      @click.stop
      @mouseleave="handlePreviewLeave"
    >
      <!-- Body -->
      <div class="hover-preview-body">
        <div class="hover-preview-header">
          <!-- Title: Titles -->
          <div class="hover-preview-titles">
            <h3 class="hover-preview-title">{{ displayTitle }}</h3>
            <p v-if="nativeTitle" class="hover-preview-native">{{ nativeTitle }}</p>
          </div>
          <!-- Title: Rating -->
          <div class="hover-preview-rating" :style="getRatingTextStyle(averageRating)">
            {{ displayRating }}
          </div>
        </div>

        <template v-if="!showForm">
          <!-- Title: Overview -->
          <p v-if="overview" class="hover-preview-overview">{{ overview }}</p>
          <!-- Title: Meta -->
          <div class="hover-preview-meta">
            <span v-if="releaseYear" class="meta-chip">{{ releaseYear }}</span>
            <span v-if="isMovieLike(item.contentType) && item.runtime" class="meta-chip">
              {{ item.runtime }} min
            </span>
            <span
              v-if="tracksEpisodes(item) && (item.episodeCount || item.malEpisodes)"
              class="meta-chip"
            >
              {{ item.episodeCount || item.malEpisodes }} episodes
            </span>
            <span class="meta-chip type-chip">
              {{ getContentTypeDisplay(item.contentType) }}
            </span>
            <AiringBadge :content="item" variant="chip" />
          </div>
          <!-- Title: Genres -->
          <div v-if="displayGenres.length" class="hover-preview-genres">
            <span v-for="genre in displayGenres" :key="genre" class="genre-tag">{{ genre }}</span>
          </div>
          <!-- Watchlist -->
          <!-- Title: Button -->
          <button
            v-if="isAuthenticated && showWatchlist"
            type="button"
            class="hover-watchlist-btn"
            :class="{ added: isOnWatchlist }"
            data-testid="hover-watchlist-btn"
            @click.stop="openForm"
          >
            {{ isOnWatchlist ? watchlistStatusLabel : 'Add to Watchlist' }}
          </button>
        </template>

        <!-- Watchlist -->
        <!-- Title: Form fields -->
        <form v-else class="hover-watchlist-form" @submit.prevent="submitWatchlist">
          <label class="form-field">
            <span>Status</span>
            <select v-model="selectedStatus" class="form-control">
              <option
                v-for="option in WATCHLIST_STATUS_OPTIONS"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
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
          <label v-if="tracksEpisodes(item)" class="form-field">
            <span>Episodes watched</span>
            <input
              v-model.number="selectedEpisodes"
              type="number"
              min="0"
              :max="maxEpisodes || undefined"
              :disabled="episodesLocked"
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
              {{ submitLabel }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { formatGenres, getContentTypeDisplay, isMovieLike, tracksEpisodes } from '@/services/api'
import { getRatingTextStyle } from '@/utils/ratingColors'
import { getWeightedAverage } from '@/utils/ratings'
import { useContentStore } from '@/stores/content'
import { useAuthStore } from '@/stores/auth'
import { useToast } from 'vue-toastification'
import type { UnifiedContent } from '@/types/content'
import { getDisplayTitle, getNativeTitle } from '@/utils/titles'
import {
  getWatchlistStatusLabel,
  watchedEpisodes,
  WATCHLIST_STATUS_OPTIONS,
  type WatchlistStatus,
} from '@/utils/watchlist'
import AiringBadge from '@/components/AiringBadge.vue'

const PREVIEW_WIDTH = 300
/** Gap between the card and the preview, and between the preview and the viewport edge. */
const GAP = 10

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
// The hovered card; kept because rootEl moves to <body> while the form is open.
let cardEl: HTMLElement | null = null
const floatStyle = ref<Record<string, string>>({})
const openLeft = ref(false)
const showForm = ref(false)
const isSaving = ref(false)
const selectedStatus = ref<WatchlistStatus>('plan_to_watch')
const selectedRating = ref<number | undefined>(undefined)
const selectedEpisodes = ref<number>(0)
const selectedNotes = ref('')

const watchlistItem = computed(() => contentStore.getWatchlistItem(props.item._id))
const isOnWatchlist = computed(() => Boolean(watchlistItem.value) || props.inWatchlist)
const watchlistStatusLabel = computed(() => getWatchlistStatusLabel(watchlistItem.value?.status))
const submitLabel = computed(() => {
  if (isSaving.value) return isOnWatchlist.value ? 'Saving...' : 'Adding...'
  return isOnWatchlist.value ? 'Save' : 'Add to Watchlist'
})

const averageRating = computed(() => getWeightedAverage(props.item))
const displayRating = computed(() =>
  averageRating.value != null ? averageRating.value.toFixed(1) : 'N/A',
)
const displayTitle = computed(() => getDisplayTitle(props.item))
const nativeTitle = computed(() => getNativeTitle(props.item))

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

/** Completed titles sit on their last episode (the server enforces the same rule). */
const episodesLocked = computed(() => selectedStatus.value === 'completed' && !!maxEpisodes.value)
watch(episodesLocked, (locked) => {
  if (locked && maxEpisodes.value) selectedEpisodes.value = maxEpisodes.value
})

const resetForm = () => {
  selectedStatus.value = 'plan_to_watch'
  selectedRating.value = undefined
  selectedEpisodes.value = 0
  selectedNotes.value = ''
}

const populateForm = () => {
  const item = watchlistItem.value
  if (!item) {
    resetForm()
    return
  }

  selectedStatus.value = item.status
  selectedRating.value = item.rating
  selectedEpisodes.value = watchedEpisodes(item.status, item.currentEpisode, maxEpisodes.value)
  selectedNotes.value = item.notes ?? ''
}

/** Pin the open form beside the card, kept inside the viewport. */
const positionForm = () => {
  if (!showForm.value || !cardEl || !rootEl.value) return
  const rect = cardEl.getBoundingClientRect()
  const height = rootEl.value.offsetHeight
  const top = Math.max(GAP, Math.min(rect.top, window.innerHeight - height - GAP))
  floatStyle.value = openLeft.value
    ? { top: `${top}px`, right: `${window.innerWidth - rect.left + GAP}px` }
    : { top: `${top}px`, left: `${rect.right + GAP}px` }
}

const closeForm = () => {
  showForm.value = false
  resetForm()
  window.removeEventListener('scroll', positionForm, true)
}

const openForm = () => {
  if (!authStore.isAuthenticated) {
    toast.error('Please log in to add items to your watchlist')
    return
  }
  populateForm()
  showForm.value = true
  // Rails scroll sideways, so follow scrolling of any container, not just the window.
  window.addEventListener('scroll', positionForm, true)
  nextTick(positionForm)
}

const submitWatchlist = async () => {
  if (!authStore.isAuthenticated) {
    toast.error('Please log in to add items to your watchlist')
    return
  }

  isSaving.value = true
  try {
    if (isOnWatchlist.value) {
      await contentStore.updateWatchlistItem(props.item._id, {
        status: selectedStatus.value,
        rating: selectedRating.value,
        currentEpisode: tracksEpisodes(props.item) ? selectedEpisodes.value : undefined,
        notes: selectedNotes.value || undefined,
      })
      toast.success('Watchlist updated!')
    } else {
      await contentStore.addToWatchlist(
        props.item._id,
        selectedStatus.value,
        selectedRating.value,
        tracksEpisodes(props.item) ? selectedEpisodes.value : undefined,
        undefined,
        selectedNotes.value || undefined,
      )
      toast.success('Added to watchlist!')
    }
    closeForm()
  } catch (error) {
    console.error('Error saving watchlist item:', error)
    toast.error(isOnWatchlist.value ? 'Failed to update watchlist' : 'Failed to add to watchlist')
  } finally {
    isSaving.value = false
  }
}

const updateAlignment = () => {
  if (!cardEl) return
  const rect = cardEl.getBoundingClientRect()
  openLeft.value = window.innerWidth - rect.right < PREVIEW_WIDTH + 24
  positionForm()
}

/** Close the form once the pointer leaves both the card and the floating preview. */
const handleLeave = (event: MouseEvent, other: HTMLElement | null) => {
  if (other && event.relatedTarget instanceof Node && other.contains(event.relatedTarget)) return
  const active = document.activeElement
  if (active && rootEl.value?.contains(active)) return
  closeForm()
}

const handleCardLeave = (event: MouseEvent) => handleLeave(event, rootEl.value)

const handlePreviewLeave = (event: MouseEvent) => {
  if (showForm.value) handleLeave(event, cardEl)
}

onMounted(() => {
  cardEl = rootEl.value?.parentElement ?? null
  cardEl?.addEventListener('mouseenter', updateAlignment)
  cardEl?.addEventListener('mouseleave', handleCardLeave)
  window.addEventListener('resize', updateAlignment)
})

onBeforeUnmount(() => {
  cardEl?.removeEventListener('mouseenter', updateAlignment)
  cardEl?.removeEventListener('mouseleave', handleCardLeave)
  window.removeEventListener('resize', updateAlignment)
  window.removeEventListener('scroll', positionForm, true)
})
</script>

<style scoped>
.hover-preview {
  position: absolute;
  top: 0;
  left: calc(100% + 10px);
  width: 280px;
  display: none;
  flex-direction: column;
  align-items: stretch;
  background: var(--bg-card);
  border-radius: 10px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.28);
  overflow: visible;
  z-index: 40;
  text-align: left;
  cursor: default;
}

.hover-preview.is-adding {
  position: fixed;
  display: flex;
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

.hover-preview-body {
  flex: 1;
  padding: 0.85rem 0.9rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  min-width: 0;
  background: var(--bg-card);
  border-radius: 10px;
}

.hover-preview-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
}

.hover-preview-titles {
  min-width: 0;
}

.hover-preview-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-strong);
  line-height: 1.25;
}

.hover-preview-native {
  margin: 0.15rem 0 0;
  font-size: 0.8rem;
  color: var(--text-body);
  font-style: italic;
  line-height: 1.2;
}

.hover-preview-rating {
  flex-shrink: 0;
  font-weight: 700;
  font-size: 0.9rem;
}

.hover-preview-overview {
  margin: 0;
  color: var(--text-body);
  font-size: 0.8rem;
  line-height: 1.4;
}

.hover-preview-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.meta-chip {
  background: var(--bg-muted);
  color: var(--text-body);
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
  background: var(--bg-muted);
  color: var(--text-body);
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
  line-height: 1.15;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  cursor: pointer;
  color: var(--text-on-accent);
  background: linear-gradient(135deg, var(--coral-light), var(--coral-primary));
}

.hover-watchlist-btn.added {
  background: var(--teal-primary);
  color: var(--text-on-accent);
  cursor: pointer;
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
  color: var(--text-body);
}

.form-control {
  width: 100%;
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  background: var(--bg-muted);
  color: var(--text-strong);
  font-size: 0.8rem;
  font-weight: 500;
  padding: 0.4rem 0.5rem;
  font-family: inherit;
}

.form-control:focus {
  outline: none;
  border-color: var(--text-faint);
  background: var(--bg-card);
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
  border: 1px solid var(--border-subtle);
  background: var(--bg-muted);
  color: var(--text-body);
  border-radius: 6px;
  padding: 0.45rem 0.7rem;
  font-weight: 600;
  font-size: 0.8rem;
  line-height: 1.15;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  cursor: pointer;
}

.form-cancel:hover {
  background: var(--bg-muted-hover);
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
.result-card:hover > .hover-preview,
.content-card:hover > .hover-preview,
.rail-card:hover > .hover-preview {
  display: flex;
  flex-direction: column;
}

@media (hover: none) {
  .hover-preview {
    display: none !important;
  }
}
</style>
