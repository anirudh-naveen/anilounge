<!--
  EntityCastRow.vue — horizontal character cards (component).

  Used on movie/series detail pages and under every expanded episode so
  characters appear on every title they are in, with their role.
-->
<template>
  <section v-if="loading || items.length" class="entity-cast-row" data-testid="entity-cast-row">
    <h3>{{ title }}</h3>
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
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import type { CatalogEntity } from '@/types/content'
import { getDetailsRouteName, getPosterUrl } from '@/services/api'
import {
  appearanceForContent,
  cleanCharacterName,
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
    : cleanCharacterName(entity.name) || entity.name

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
.entity-cast-row {
  margin-bottom: 2rem;
}

.entity-cast-row h3 {
  font-size: 1.2rem;
  margin: 0 0 0.75rem;
  color: var(--text-primary);
}

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

.cast-card {
  flex: 0 0 110px;
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
</style>
