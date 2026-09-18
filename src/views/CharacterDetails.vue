<!--
  CharacterDetails.vue — character detail view.

  Own screen for a catalog character: picture, about, favorite toggle, and
  every title they appear in with a role. Not a Movies/TV tab.
-->
<template>
  <div class="character-details">
    <div class="back-button" @click="goBack">
      <i class="fas fa-arrow-left"></i>
      Back
    </div>

    <div v-if="loading" class="loading">
      <div class="spinner"></div>
      <p>Loading character...</p>
    </div>

    <div v-else-if="error" class="error">
      <h2>Error loading character</h2>
      <p>{{ error }}</p>
      <button @click="goBack" class="btn-primary">Go Back</button>
    </div>

    <div v-else-if="character" class="character-content">
      <div class="character-header">
        <div class="character-poster">
          <img
            v-if="character.imagePath"
            :src="getPosterUrl(character.imagePath)"
            :alt="character.name"
            referrerpolicy="no-referrer"
            @error="handleImageError"
          />
          <div v-else class="no-poster">
            <i class="fas fa-user"></i>
            <p>No image available</p>
          </div>
        </div>

        <div class="character-info">
          <p class="entity-kicker">Character</p>
          <h1 class="character-title">{{ cleanCharacterName(character.name) || character.name }}</h1>
          <p v-if="character.nativeName" class="original-title">
            Native Name: {{ character.nativeName }}
          </p>

          <div class="character-actions">
            <button
              v-if="authStore.isAuthenticated"
              type="button"
              data-testid="favorite-action"
              :class="character.isFavorited ? 'btn-secondary' : 'btn-primary'"
              @click="onToggleFavorite"
            >
              <i :class="character.isFavorited ? 'fas fa-heart' : 'far fa-heart'"></i>
              {{ character.isFavorited ? 'Favorited' : 'Add to Favorites' }}
            </button>
            <button v-else type="button" class="btn-outline" @click="router.push('/login')">
              Sign in to favorite
            </button>
          </div>
        </div>
      </div>

      <div v-if="voiceActors.length" class="voice-actors" data-testid="voice-actor-row">
        <h2>Voice actors</h2>
        <div class="voice-actor-list">
          <button
            v-for="credit in voiceActors"
            :key="`${credit.entity || credit.name}-${credit.language || ''}`"
            type="button"
            class="voice-actor-card"
            data-testid="voice-actor-card"
            :disabled="!credit.entity"
            @click="openVoiceActor(credit)"
          >
            <img
              v-if="credit.imagePath"
              :src="getPosterUrl(credit.imagePath)"
              :alt="displayPersonName(credit.name)"
              referrerpolicy="no-referrer"
              @error="handleImageError"
            />
            <div v-else class="no-poster small">
              <i class="fas fa-microphone"></i>
            </div>
            <p class="voice-actor-name">{{ displayPersonName(credit.name) }}</p>
            <p v-if="credit.language" class="voice-actor-language">{{ credit.language }}</p>
          </button>
        </div>
      </div>

      <div class="character-description">
        <h2>About</h2>
        <p class="about-text">{{ character.about || 'No biography available.' }}</p>
      </div>

      <div v-if="appearanceTitles.length" class="appearances">
        <h2>Appears in</h2>
        <div class="content-grid">
          <div
            v-for="row in appearanceTitles"
            :key="row.id"
            class="content-card"
            :data-testid="`appearance-${row.id}`"
            @click="openTitle(row)"
          >
            <img
              v-if="row.posterPath"
              :src="getPosterUrl(row.posterPath)"
              :alt="row.title"
              @error="handleImageError"
            />
            <div v-else class="no-poster small">
              <i class="fas fa-film"></i>
            </div>
            <div class="content-info">
              <h5>{{ row.title }}</h5>
              <p v-if="row.role" class="content-type">{{ row.role }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useEntityStore } from '@/stores/entities'
import { getDetailsRouteName, getPosterUrl } from '@/services/api'
import { getDisplayTitle } from '@/utils/titles'
import { cleanCharacterName, collectVoiceActors, displayPersonName } from '@/utils/entities'
import type { CatalogEntity, EntityVoiceCredit } from '@/types/content'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const entityStore = useEntityStore()

const character = ref<CatalogEntity | null>(null)
const loading = ref(true)
const error = ref('')

const appearanceTitles = computed(() => {
  return (character.value?.appearances || [])
    .map((row) => {
      const content = row.content
      if (!content || typeof content !== 'object') return null
      return {
        id: content._id,
        title: getDisplayTitle(content),
        posterPath: content.posterPath || '',
        contentType: content.contentType,
        role: row.role || '',
      }
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
})

const voiceActors = computed(() => collectVoiceActors(character.value))

const loadCharacter = async (id: string) => {
  if (!id) {
    error.value = 'No character ID provided'
    loading.value = false
    return
  }
  loading.value = true
  error.value = ''
  try {
    character.value = await entityStore.getEntityDetails(id)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load character'
    character.value = null
  } finally {
    loading.value = false
  }
}

const onToggleFavorite = async () => {
  if (!character.value) return
  try {
    character.value = await entityStore.toggleFavorite(character.value)
  } catch (err) {
    console.error('Favorite update failed:', err)
  }
}

const openVoiceActor = (credit: EntityVoiceCredit) => {
  if (!credit.entity) return
  router.push({
    name: 'VoiceActorDetails',
    params: { id: credit.entity },
    query: { from: route.fullPath },
  })
}

const openTitle = (row: { id: string; contentType?: string }) => {
  router.push({
    name: getDetailsRouteName({ contentType: row.contentType }),
    params: { id: row.id },
    query: { from: route.fullPath },
  })
}

const goBack = () => {
  const previous = route.query.from as string
  if (previous) {
    router.push(previous)
    return
  }
  router.push('/search')
}

const handleImageError = (event: Event) => {
  const img = event.target as HTMLImageElement
  img.style.display = 'none'
}

watch(
  () => route.params.id,
  (id) => {
    if (typeof id === 'string') loadCharacter(id)
  },
  { immediate: true },
)
</script>

<style scoped>
.character-details {
  max-width: 1100px;
  margin: 0 auto;
  padding: 1.5rem;
}

.back-button {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 1.25rem;
  cursor: pointer;
  color: var(--text-secondary);
}

.loading,
.error {
  text-align: center;
  padding: 3rem 1rem;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid var(--border-color);
  border-top: 4px solid var(--highlight-color);
  border-radius: 50%;
  margin: 0 auto 1rem;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.character-header {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 2rem;
  margin-bottom: 2rem;
}

.character-poster img,
.no-poster {
  width: 220px;
  height: 300px;
  object-fit: cover;
  border-radius: 12px;
  background: var(--bg-hover);
}

.no-poster {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  gap: 0.5rem;
}

.no-poster.small {
  width: 100%;
  height: 180px;
}

.entity-kicker {
  margin: 0 0 0.35rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 0.8rem;
  color: var(--text-muted);
}

.character-title {
  margin: 0 0 0.5rem;
  font-size: 2.2rem;
  color: var(--text-primary);
}

.original-title {
  color: var(--text-secondary);
  margin-bottom: 1.25rem;
}

.character-actions {
  display: flex;
  gap: 0.75rem;
}

.btn-primary,
.btn-secondary,
.btn-outline {
  border-radius: 8px;
  padding: 0.65rem 1.1rem;
  font-weight: 600;
  cursor: pointer;
}

.btn-primary {
  background: var(--coral-primary);
  color: white;
  border: 0;
}

.btn-secondary,
.btn-outline {
  background: var(--bg-card);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
}

.character-description,
.appearances,
.voice-actors {
  margin-bottom: 2rem;
}

.voice-actor-list {
  display: flex;
  gap: 0.75rem;
  overflow-x: auto;
  padding-bottom: 0.5rem;
}

.voice-actor-card {
  flex: 0 0 110px;
  text-align: center;
  background: transparent;
  border: 0;
  padding: 0;
  color: inherit;
  cursor: pointer;
}

.voice-actor-card:disabled {
  cursor: default;
}

.voice-actor-card img,
.voice-actor-card .no-poster.small {
  width: 110px;
  height: 140px;
  object-fit: cover;
  border-radius: 8px;
  background: var(--bg-hover);
}

.voice-actor-name,
.voice-actor-language {
  margin: 0.35rem 0 0;
  font-size: 0.8rem;
}

.voice-actor-name {
  font-weight: 600;
  color: var(--text-primary);
}

.voice-actor-language {
  color: var(--text-muted);
}

.about-text {
  white-space: pre-wrap;
  line-height: 1.6;
  color: var(--text-secondary);
}

.content-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 1rem;
}

.content-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  overflow: hidden;
  cursor: pointer;
}

.content-card img {
  width: 100%;
  height: 220px;
  object-fit: cover;
}

.content-info {
  padding: 0.65rem 0.75rem 0.9rem;
}

.content-info h5 {
  margin: 0 0 0.25rem;
  color: var(--text-primary);
}

.content-type {
  margin: 0;
  font-size: 0.85rem;
  color: var(--text-muted);
}

@media (max-width: 768px) {
  .character-header {
    grid-template-columns: 1fr;
  }
}
</style>
