<!--
  ContentRail.vue — horizontal catalog strip (component).

  Scrollable poster row used by Search browse (trending, in theatres / airing,
  upcoming). View All links to the full Movies or Series catalog page.
-->
<template>
  <section class="content-rail" :data-testid="`browse-rail-${railId}`">
    <div class="rail-header">
      <h2 class="rail-title">{{ title }}</h2>
      <router-link v-if="viewAll" :to="viewAll" class="rail-view-all">View All</router-link>
    </div>

    <div v-if="loading" class="rail-status">
      <div class="spinner"></div>
      <p>Loading titles...</p>
    </div>

    <div v-else-if="items.length === 0" class="rail-status">
      <p>{{ emptyText }}</p>
    </div>

    <div v-else class="rail-strip">
      <div
        v-for="item in items"
        :key="item._id"
        class="rail-card poster-frame"
        @click="emit('select', item)"
      >
        <div class="rail-poster">
          <img
            :src="getPosterUrl(item.posterPath || '')"
            :alt="getDisplayTitle(item)"
            @error="handleImageError"
          />
          <div
            class="content-type-badge poster-corner-tag poster-corner-tag-right"
            :class="getContentTypeBadgeClass(item.contentType)"
          >
            {{ getCardContentTypeDisplay(item.contentType) }}
          </div>
          <AiringBadge :content="item" variant="card" />
        </div>
        <div class="rail-info">
          <h3 class="rail-card-title">{{ getDisplayTitle(item) }}</h3>
        </div>
        <ContentHoverPreview
          :item="item"
          :is-authenticated="isAuthenticated"
          :in-watchlist="inWatchlist(item._id)"
        />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { getPosterUrl, getCardContentTypeDisplay, getContentTypeBadgeClass } from '@/services/api'
import ContentHoverPreview from '@/components/ContentHoverPreview.vue'
import AiringBadge from '@/components/AiringBadge.vue'
import type { UnifiedContent } from '@/types/content'
import { getDisplayTitle } from '@/utils/titles'

withDefaults(
  defineProps<{
    railId: string
    title: string
    items: UnifiedContent[]
    loading?: boolean
    viewAll?: string
    emptyText?: string
    isAuthenticated?: boolean
    inWatchlist?: (id: string) => boolean
  }>(),
  {
    loading: false,
    emptyText: 'Nothing to show here yet.',
    isAuthenticated: false,
    inWatchlist: () => () => false,
  },
)

const emit = defineEmits<{
  select: [item: UnifiedContent]
}>()

const handleImageError = (event: Event) => {
  const img = event.target as HTMLImageElement
  img.src = '/placeholder-movie.jpg'
}
</script>

<style scoped>
.content-rail {
  margin-bottom: 2rem;
}

.rail-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.85rem;
}

.rail-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.15rem;
  font-weight: 650;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-primary);
}

.rail-view-all {
  color: var(--text-secondary);
  font-size: 0.9rem;
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
}

.rail-view-all:hover {
  color: var(--coral-primary);
}

.rail-strip {
  display: flex;
  gap: 0.85rem;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 0.35rem 0.15rem 0.9rem;
  scroll-snap-type: x proximity;
  -webkit-overflow-scrolling: touch;
}

.rail-strip::-webkit-scrollbar {
  height: 8px;
}

.rail-strip::-webkit-scrollbar-thumb {
  background: var(--coral-primary);
  border-radius: 4px;
}

.rail-card {
  position: relative;
  flex: 0 0 148px;
  background: #fff;
  border-radius: 14px;
  overflow: visible;
  box-shadow: var(--shadow-sm);
  transition: all 0.3s ease;
  cursor: pointer;
  z-index: 1;
  border: 1px solid var(--border-color);
  scroll-snap-align: start;
}

.rail-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-spot), var(--shadow-md);
  border-color: var(--coral-primary);
  z-index: 20;
}

.rail-poster {
  position: relative;
  aspect-ratio: 2/3;
  overflow: hidden;
  border-radius: 8px 8px 0 0;
}

.rail-poster img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s ease;
}

.rail-card:hover .rail-poster img {
  transform: scale(1.05);
}

.rail-info {
  padding: 0.55rem 0.65rem 0.7rem;
}

.rail-card-title {
  margin: 0;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-ink);
  line-height: 1.25;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.rail-status {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-height: 8rem;
  color: var(--text-secondary);
}

.spinner {
  width: 28px;
  height: 28px;
  border: 3px solid var(--border-color);
  border-top: 3px solid var(--coral-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.content-type-badge {
  z-index: 2;
}

@media (max-width: 768px) {
  .rail-card {
    flex-basis: 118px;
  }
}
</style>
