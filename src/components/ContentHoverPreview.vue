<template>
  <div ref="rootEl" class="hover-preview" :class="{ 'open-left': openLeft }" @click.stop>
    <div class="hover-preview-poster">
      <img
        :src="getPosterUrl(item.posterPath || '')"
        :alt="item.title"
        @error="handleImageError"
      />
    </div>
    <div class="hover-preview-body">
      <div class="hover-preview-header">
        <h3 class="hover-preview-title">{{ item.title }}</h3>
        <div class="hover-preview-rating" :style="getRatingTextStyle(item.unifiedScore)">
          {{ displayRating }}
        </div>
      </div>
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
        @click.stop="$emit('watchlist')"
      >
        {{ inWatchlist ? 'In Watchlist' : 'Add to Watchlist' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { getPosterUrl, formatGenres, getContentTypeDisplay } from '@/services/api'
import { getRatingTextStyle } from '@/utils/ratingColors'
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

defineEmits<{
  watchlist: []
}>()

const rootEl = ref<HTMLElement | null>(null)
const openLeft = ref(false)

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

const handleImageError = (event: Event) => {
  const img = event.target as HTMLImageElement
  img.src = '/placeholder-movie.jpg'
}

const updateAlignment = () => {
  const card = rootEl.value?.parentElement
  if (!card) return
  const rect = card.getBoundingClientRect()
  openLeft.value = window.innerWidth - rect.right < PREVIEW_WIDTH + 24
}

onMounted(() => {
  const card = rootEl.value?.parentElement
  card?.addEventListener('mouseenter', updateAlignment)
  window.addEventListener('resize', updateAlignment)
})

onBeforeUnmount(() => {
  const card = rootEl.value?.parentElement
  card?.removeEventListener('mouseenter', updateAlignment)
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
  background: white;
  border-radius: 10px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.28);
  overflow: visible;
  z-index: 40;
  text-align: left;
  cursor: default;
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
  aspect-ratio: 2 / 3;
  background: #eee;
  overflow: hidden;
  border-radius: 10px 0 0 10px;
}

.hover-preview-poster img {
  width: 100%;
  height: 100%;
  object-fit: cover;
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
  align-self: flex-start;
  border: none;
  border-radius: 6px;
  padding: 0.4rem 0.75rem;
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
</style>

<style>
.movie-card:hover > .hover-preview,
.show-card:hover > .hover-preview,
.result-card:hover > .hover-preview,
.content-card:hover > .hover-preview {
  display: flex;
  flex-direction: row;
}

@media (hover: none) {
  .hover-preview {
    display: none !important;
  }
}
</style>
