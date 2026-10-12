<!--
  FavoriteHeart.vue — title favorite toggle (component).

  Adds or removes a title from the signed-in user's favorites. Only offered where
  someone is looking at a title on purpose, not while browsing (search, rails,
  catalog lists, and profiles have none): `variant="button"` is the labeled button
  in a title page's header actions, `variant="inline"` the heart on each row of
  the personal watchlist, and `variant="poster"` a heart pinned to a poster's
  corner on franchise, studio, and character pages (shown while the card is
  hovered; always on touch screens).
-->
<template>
  <!-- Title: Heart -->
  <button
    v-if="authStore.isAuthenticated"
    type="button"
    class="favorite-heart"
    :class="[`variant-${variant}`, { 'is-favorited': favorited }]"
    :aria-pressed="favorited"
    :aria-label="favorited ? 'Remove from favorites' : 'Add to favorites'"
    :title="favorited ? 'Remove from favorites' : 'Add to favorites'"
    data-testid="favorite-heart"
    @click.stop.prevent="toggle"
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 20.5s-7.5-4.6-9.3-9.4C1.5 7.9 3.6 4.5 7 4.5c2 0 3.6 1.1 5 2.9 1.4-1.8 3-2.9 5-2.9 3.4 0 5.5 3.4 4.3 6.6-1.8 4.8-9.3 9.4-9.3 9.4z"
        :fill="favorited ? 'currentColor' : 'none'"
        stroke="currentColor"
        stroke-width="2"
        stroke-linejoin="round"
      />
    </svg>
    <span v-if="variant === 'button'">{{ favorited ? 'Favorited' : 'Favorite' }}</span>
  </button>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useToast } from 'vue-toastification'
import { useAuthStore } from '@/stores/auth'
import { useFavoritesStore } from '@/stores/favorites'
import { apiErrorMessage } from '@/utils/social'
import { haptic } from '@/utils/nativeApp'

const props = withDefaults(
  defineProps<{ contentId: string; variant?: 'poster' | 'button' | 'inline' }>(),
  { variant: 'poster' },
)

const authStore = useAuthStore()
const favoritesStore = useFavoritesStore()
const toast = useToast()

const favorited = computed(() => favoritesStore.isFavorite(props.contentId))

const toggle = async () => {
  try {
    const added = await favoritesStore.toggle(props.contentId)
    haptic()
    toast.success(added ? 'Added to favorites' : 'Removed from favorites')
  } catch (err) {
    console.error('Failed to update favorite:', err)
    toast.error(apiErrorMessage(err, 'Could not update favorites'))
  }
}

onMounted(() => {
  if (authStore.isAuthenticated) {
    favoritesStore.load().catch((err) => console.error('Failed to load favorites:', err))
  }
})
</script>

<style scoped>
.favorite-heart {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  cursor: pointer;
  transition:
    color 0.15s ease,
    border-color 0.15s ease,
    background 0.15s ease;
}

.favorite-heart svg {
  width: 17px;
  height: 17px;
}

.favorite-heart.is-favorited {
  color: var(--coral-primary);
}

.favorite-heart:focus-visible {
  outline: 2px solid var(--coral-primary);
  outline-offset: 2px;
}

/* Poster: pinned to the poster's bottom-right, shown on hover. */
.favorite-heart.variant-poster {
  position: absolute;
  right: 6px;
  bottom: 6px;
  z-index: 5;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(21, 34, 56, 0.72);
  color: #fff;
  opacity: 0;
  transform: scale(0.85);
  transition:
    opacity 0.15s ease,
    transform 0.15s ease,
    background 0.15s ease;
}

.favorite-heart.variant-poster:hover {
  background: rgba(21, 34, 56, 0.9);
  transform: scale(1.08);
}

.favorite-heart.variant-poster.is-favorited {
  color: var(--coral-primary);
}

.favorite-heart.variant-poster:focus-visible {
  opacity: 1;
  transform: scale(1);
}

.favorite-heart.variant-inline {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: transparent;
  color: var(--text-secondary);
}

.favorite-heart.variant-inline:hover {
  background: var(--bg-hover, rgba(255, 255, 255, 0.06));
  color: var(--coral-primary);
}

.favorite-heart.variant-button {
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  border: 2px solid var(--border-color);
  border-radius: 8px;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  font-weight: 600;
  line-height: 1;
}

.favorite-heart.variant-button:hover {
  border-color: var(--coral-primary);
}

.favorite-heart.variant-button.is-favorited {
  border-color: var(--coral-primary);
  background: rgba(224, 122, 95, 0.12);
  color: var(--coral-primary);
}
</style>

<style>
/* Studio and character cards: anchor to the card's top-right, clear of the info text. */
.content-card:has(> .favorite-heart) {
  position: relative;
}

.content-card > .favorite-heart.variant-poster {
  top: 6px;
  bottom: auto;
}

/* Poster hearts appear while their card is hovered. */
.poster-frame:hover .favorite-heart.variant-poster,
.content-card:hover .favorite-heart.variant-poster,
.timeline-card:hover .favorite-heart.variant-poster,
.favorite-title-card:hover .favorite-heart.variant-poster {
  opacity: 1;
  transform: scale(1);
}

@media (hover: none) {
  .favorite-heart.variant-poster {
    opacity: 1 !important;
    transform: none !important;
  }
}
</style>
