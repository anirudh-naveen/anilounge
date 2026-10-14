<!--
  EntityCastRow.vue — horizontal character cards (component).

  Used on movie/series detail pages so characters appear on every title they are
  in, with their role. The `aside` slot goes at the right of the section heading.
-->
<template>
  <DetailSection
    v-if="loading || items.length"
    :name="title.toLowerCase()"
    :title="title"
    class="entity-cast-row"
    data-testid="entity-cast-row"
  >
    <template v-if="$slots.aside" #aside><slot name="aside" /></template>
    <div v-if="loading" class="cast-loading">
      <div class="spinner"></div>
      <p>Loading {{ title.toLowerCase() }}...</p>
    </div>
    <div v-else class="cast-list">
      <button
        v-for="entity in highlighted"
        :key="entity._id"
        type="button"
        class="cast-card"
        :data-testid="cardTestId(entity)"
        @click="openEntity(entity)"
      >
        <img
          v-if="entity.imagePath"
          :src="getPosterUrl(entity.imagePath)"
          :alt="displayName(entity)"
          referrerpolicy="no-referrer"
          @error="handleImageError"
        />
        <div v-else class="no-profile">
          <i :class="entity.entityType === 'voice_actor' ? 'fas fa-microphone' : 'fas fa-user'"></i>
        </div>
        <p class="cast-name">{{ displayName(entity) }}</p>
        <p v-if="roleFor(entity)" class="cast-role">{{ roleFor(entity) }}</p>
      </button>
      <p v-if="overflowCount" class="cast-overflow">+{{ overflowCount }} more</p>
    </div>
  </DetailSection>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import type { CatalogEntity } from '@/types/content'
import DetailSection from '@/components/DetailSection.vue'
import { getDetailsRouteName, getPosterUrl } from '@/services/api'
import {
  appearanceForContent,
  canonicalCharacterName,
  displayPersonName,
  highlightedCharacters,
} from '@/utils/entities'

const props = withDefaults(
  defineProps<{
    items: CatalogEntity[]
    contentId?: string
    title?: string
    loading?: boolean
    showRole?: boolean
  }>(),
  {
    items: () => [],
    title: 'Characters',
    loading: false,
    showRole: false,
  },
)

const highlighted = computed(() => highlightedCharacters(props.items))
const overflowCount = computed(() => Math.max(0, props.items.length - highlighted.value.length))

const displayName = (entity: CatalogEntity) =>
  entity.entityType === 'voice_actor'
    ? displayPersonName(entity.name)
    : canonicalCharacterName(entity.name) || entity.name

const roleFor = (entity: CatalogEntity) => {
  if (!props.showRole) return ''
  const appearance = appearanceForContent(entity, props.contentId)
  return appearance?.characterName || appearance?.role || ''
}

const cardTestId = (entity: CatalogEntity) =>
  entity.entityType === 'voice_actor'
    ? `voice-actor-card-${entity._id}`
    : `character-card-${entity._id}`

const router = useRouter()
const route = useRoute()

const openEntity = (entity: CatalogEntity) => {
  router.push({
    name: getDetailsRouteName(entity),
    params: { id: entity._id },
    query: { from: route.fullPath },
  })
}

const handleImageError = (event: Event) => {
  const img = event.target as HTMLImageElement
  img.style.display = 'none'
}
</script>

<style scoped>
.cast-loading {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  color: var(--text-secondary);
}

.spinner {
  width: 24px;
  height: 24px;
  border: 3px solid var(--border-color);
  border-top: 3px solid var(--highlight-color);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.cast-list {
  display: flex;
  gap: 0.75rem;
  overflow-x: auto;
  padding-bottom: 0.5rem;
}

/* A button (inline-flex row site-wide): stack the picture, name, and role. */
.cast-card {
  flex: 0 0 110px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  line-height: 1.3;
  text-align: center;
  background: transparent;
  border: 0;
  padding: 0;
  color: inherit;
  cursor: pointer;
}

.cast-card img,
.cast-card .no-profile {
  width: 110px;
  height: 140px;
  object-fit: cover;
  border-radius: 8px;
  background: var(--bg-hover);
}

.no-profile {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}

.no-profile i {
  font-size: 1.5rem;
}

.cast-name {
  margin: 0.35rem 0 0;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-primary);
}

.cast-role {
  margin: 0.15rem 0 0;
  font-size: 0.75rem;
  color: var(--text-muted);
}

.cast-overflow {
  flex: 0 0 auto;
  align-self: center;
  margin: 0;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted);
  white-space: nowrap;
}

/* Phones: smaller portraits, so more of the cast fits on screen. */
@media (max-width: 600px) {
  .cast-list {
    gap: 0.6rem;
  }

  .cast-card {
    flex-basis: 84px;
  }

  .cast-card img,
  .cast-card .no-profile {
    width: 84px;
    height: 108px;
  }

  .cast-name {
    font-size: 0.74rem;
  }

  .cast-role {
    font-size: 0.68rem;
  }
}
</style>
