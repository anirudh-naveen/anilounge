<!--
  WatchlistCardTag.vue — the signed-in user's own state on a poster card (component).

  A tag on the poster's bottom-left corner with the title's watchlist status
  (Completed, Watching, …; a series tracked season by season sums up its seasons) and a
  heart when it is a favorite. Reads the content and favorites stores, so changes made
  anywhere (the watchlist page, a title page, the hover card) show on every card right
  away, and on phones, where there is no hover card.
-->
<template>
  <div v-if="status || favorited" class="watchlist-card-tag" :data-testid="`card-tag-${contentId}`">
    <span v-if="status" class="tag-status" :class="`status-${status.replace(/_/g, '-')}`">
      {{ getWatchlistStatusLabel(status) }}
    </span>
    <span v-if="favorited" class="tag-heart" aria-label="Favorite">
      <ForumIcon name="heart" filled />
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { getActivePinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import { useContentStore } from '@/stores/content'
import { useFavoritesStore } from '@/stores/favorites'
import { getWatchlistStatusLabel } from '@/utils/watchlist'
import ForumIcon from '@/components/ForumIcon.vue'

const props = defineProps<{ contentId: string }>()

// Without Pinia (isolated component tests) cards simply go untagged.
const hasPinia = !!getActivePinia()
const authStore = hasPinia ? useAuthStore() : null
const contentStore = hasPinia ? useContentStore() : null
const favoritesStore = hasPinia ? useFavoritesStore() : null

const status = computed(() =>
  authStore?.isAuthenticated ? contentStore!.getWatchlistStatus(props.contentId) : undefined,
)
const favorited = computed(
  () => !!authStore?.isAuthenticated && favoritesStore!.isFavorite(props.contentId),
)

onMounted(() => {
  if (authStore?.isAuthenticated) {
    favoritesStore!.load().catch((err) => console.error('Failed to load favorites:', err))
  }
})
</script>

<style scoped>
.watchlist-card-tag {
  position: absolute;
  left: 4px;
  bottom: 4px;
  z-index: 3;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  pointer-events: none;
}

.tag-status,
.tag-heart {
  display: inline-flex;
  align-items: center;
  height: 1.125rem;
  padding: 0 5px;
  border-radius: 3px;
  color: #fff;
  font-size: 0.55rem;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.3px;
  text-transform: uppercase;
  white-space: nowrap;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.status-plan-to-watch {
  background: rgba(20, 20, 24, 0.78);
}

.status-watching {
  background: var(--highlight-color);
}

.status-completed {
  background: var(--success-color);
}

.status-on-hold {
  background: var(--warning-color);
}

.status-dropped {
  background: var(--error-color);
}

.tag-heart {
  padding: 0 4px;
  background: rgba(20, 20, 24, 0.78);
  color: var(--coral-primary);
  font-size: 0.7rem;
}
</style>
