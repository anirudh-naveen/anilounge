<!--
  VoiceActorDetails.vue — voice-actor detail view.

  Own screen for a catalog voice actor: picture, about, favorite toggle, and
  every character they have voiced. Not a Movies/TV tab.
-->
<template>
  <div class="character-details">
    <div class="back-button" @click="goBack">
      <i class="fas fa-arrow-left"></i>
      Back
    </div>

    <div v-if="loading" class="loading">
      <div class="spinner"></div>
      <p>Loading voice actor...</p>
    </div>

    <div v-else-if="error" class="error">
      <h2>Error loading voice actor</h2>
      <p>{{ error }}</p>
      <button @click="goBack" class="btn-primary">Go Back</button>
    </div>

    <div v-else-if="voiceActor" class="character-content">
      <div class="character-header">
        <div class="character-poster">
          <img
            v-if="voiceActor.imagePath"
            :src="getPosterUrl(voiceActor.imagePath)"
            :alt="displayPersonName(voiceActor.name)"
            referrerpolicy="no-referrer"
            @error="handleImageError"
          />
          <div v-else class="no-poster">
            <i class="fas fa-microphone"></i>
            <p>No image available</p>
          </div>
        </div>

        <div class="character-info">
          <p class="entity-kicker">Voice actor</p>
          <h1 class="character-title">{{ displayPersonName(voiceActor.name) }}</h1>
          <p v-if="voiceActor.nativeName" class="original-title">
            Native Name: {{ voiceActor.nativeName }}
          </p>

          <div class="character-actions">
            <button
              v-if="authStore.isAuthenticated"
              type="button"
              data-testid="favorite-action"
              :class="voiceActor.isFavorited ? 'btn-secondary' : 'btn-primary'"
              @click="onToggleFavorite"
            >
              <i :class="voiceActor.isFavorited ? 'fas fa-heart' : 'far fa-heart'"></i>
              {{ voiceActor.isFavorited ? 'Favorited' : 'Add to Favorites' }}
            </button>
            <button v-else type="button" class="btn-outline" @click="router.push('/login')">
              Sign in to favorite
            </button>
          </div>
        </div>
      </div>

      <div class="character-description">
        <h2>About</h2>
        <p class="about-text">{{ voiceActor.about || 'No biography available.' }}</p>
      </div>

      <div v-if="voicedCharacters.length" class="appearances">
        <h2>Characters</h2>
        <div class="content-grid">
          <div
            v-for="row in voicedCharacters"
            :key="row.key"
            class="content-card"
            :class="{ clickable: Boolean(row.id) }"
            :data-testid="`voiced-character-${row.id || row.key}`"
            @click="openCharacter(row)"
          >
            <img
              v-if="row.imagePath"
              :src="getPosterUrl(row.imagePath)"
              :alt="row.name"
              referrerpolicy="no-referrer"
              @error="handleImageError"
            />
            <div v-else class="no-poster small">
              <i class="fas fa-user"></i>
            </div>
            <div class="content-info">
              <h5>{{ row.name }}</h5>
              <p v-if="row.title" class="content-type">{{ row.title }}</p>
              <p v-else-if="row.role" class="content-type">{{ row.role }}</p>
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
import { getPosterUrl } from '@/services/api'
import { getDisplayTitle } from '@/utils/titles'
import { collectVoicedCharacters, displayPersonName } from '@/utils/entities'
import type { CatalogEntity } from '@/types/content'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const entityStore = useEntityStore()

const voiceActor = ref<CatalogEntity | null>(null)
const loading = ref(true)
const error = ref('')

const voicedCharacters = computed(() => {
  return collectVoicedCharacters(voiceActor.value).map((row, index) => {
    const content = row.content && typeof row.content === 'object' ? row.content : null
    return {
      key: row.id || `${row.name}-${index}`,
      id: row.id,
      name: row.name,
      imagePath: row.imagePath,
      role: row.role,
      title: content ? getDisplayTitle(content) : '',
    }
  })
})

const loadVoiceActor = async (id: string) => {
  if (!id) {
    error.value = 'No voice actor ID provided'
    loading.value = false
    return
  }
  loading.value = true
  error.value = ''
  try {
    voiceActor.value = await entityStore.getEntityDetails(id)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load voice actor'
    voiceActor.value = null
  } finally {
    loading.value = false
  }
}

const onToggleFavorite = async () => {
  if (!voiceActor.value) return
  try {
    voiceActor.value = await entityStore.toggleFavorite(voiceActor.value)
  } catch (err) {
    console.error('Favorite update failed:', err)
  }
}

const openCharacter = (row: { id: string }) => {
  if (!row.id) return
  router.push({
    name: 'CharacterDetails',
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
    if (typeof id === 'string') loadVoiceActor(id)
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
.appearances {
  margin-bottom: 2rem;
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
}

.content-card.clickable {
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
