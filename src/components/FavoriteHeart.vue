<!--
  FavoriteHeart.vue — poster favorite toggle (component).

  Heart button pinned to the bottom-right of a title poster. It appears while
  the surrounding card is hovered (always on touch screens) and adds or
  removes the title from the signed-in user's favorites.
-->
<template>
  <!-- Title: Heart -->
  <button
    v-if="authStore.isAuthenticated"
    type="button"
    class="favorite-heart"
    :class="{ 'is-favorited': favorited }"
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
  </button>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useToast } from 'vue-toastification'
import { useAuthStore } from '@/stores/auth'
import { useFavoritesStore } from '@/stores/favorites'

const props = defineProps<{ contentId: string }>()

const authStore = useAuthStore()
const favoritesStore = useFavoritesStore()
const toast = useToast()

const favorited = computed(() => favoritesStore.isFavorite(props.contentId))

const toggle = async () => {
  try {
    const added = await favoritesStore.toggle(props.contentId)
    toast.success(added ? 'Added to favorites' : 'Removed from favorites')
  } catch (err) {
    console.error('Failed to update favorite:', err)
    toast.error('Could not update favorites')
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
  position: absolute;
  right: 6px;
  bottom: 6px;
  z-index: 5;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: rgba(21, 34, 56, 0.72);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  transform: scale(0.85);
  transition:
    opacity 0.15s ease,
    transform 0.15s ease,
    background 0.15s ease;
}

.favorite-heart svg {
  width: 17px;
  height: 17px;
}

.favorite-heart:hover {
  background: rgba(21, 34, 56, 0.9);
  transform: scale(1.08);
}

.favorite-heart.is-favorited {
  color: var(--coral-primary);
}

.favorite-heart:focus-visible {
  opacity: 1;
  transform: scale(1);
  outline: 2px solid var(--coral-primary);
  outline-offset: 2px;
}
</style>

<style>
/* Detail-page related cards: anchor to the card's top-right, clear of the info text. */
.content-card:has(> .favorite-heart) {
  position: relative;
}

.content-card > .favorite-heart {
  top: 6px;
  bottom: auto;
}

.poster-frame:hover .favorite-heart,
.content-card:hover .favorite-heart,
.favorite-title-card:hover .favorite-heart {
  opacity: 1;
  transform: scale(1);
}

@media (hover: none) {
  .favorite-heart {
    opacity: 1 !important;
    transform: none !important;
  }
}
</style>
