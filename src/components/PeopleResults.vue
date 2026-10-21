<!--
  PeopleResults.vue — the Characters / Voice Actors tab results on Search (component).

  One page of trending people when nothing is searched, else the search's pages.
  Cards open the character or voice actor page.
-->
<template>
  <section class="people-results" :data-testid="`people-results-${kind}`">
    <div class="results-header">
      <h2>{{ heading }}</h2>
      <p v-if="result && !result.trending">
        {{ result.total }} result{{ result.total === 1 ? '' : 's' }} found
      </p>
      <p v-else>{{ trendingNote }}</p>
    </div>

    <div v-if="loading && !result" class="people-loading">
      <div class="spinner"></div>
    </div>
    <p v-else-if="error" class="people-empty">{{ error }}</p>
    <p v-else-if="result && !result.items.length" class="people-empty">
      {{ result.trending ? emptyTrending : 'No one matches. Try another name or filter.' }}
    </p>
    <div v-else-if="result" class="people-grid" :class="{ stale: loading }">
      <button
        v-for="person in result.items"
        :key="person._id"
        type="button"
        class="person-card"
        :data-testid="`person-card-${person._id}`"
        @click="open(person)"
      >
        <img
          v-if="person.imagePath"
          :src="getPosterUrl(person.imagePath)"
          :alt="displayName(person)"
          loading="lazy"
          referrerpolicy="no-referrer"
          @error="hideBrokenImage"
        />
        <div v-else class="no-photo">
          <i :class="kind === 'voice_actor' ? 'fas fa-microphone' : 'fas fa-user'"></i>
        </div>
        <p class="person-name">{{ displayName(person) }}</p>
        <p v-if="person.subtitle" class="person-subtitle">{{ subtitleFor(person) }}</p>
        <p v-if="detailFor(person)" class="person-detail">{{ detailFor(person) }}</p>
      </button>
    </div>

    <PaginationNav
      v-if="result && !result.trending"
      :current-page="result.page"
      :total-pages="Math.ceil(result.total / result.pageSize)"
      @change="emit('page', $event)"
    />
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PaginationNav from '@/components/PaginationNav.vue'
import { getDetailsRouteName, getPosterUrl } from '@/services/api'
import { canonicalCharacterName, displayPersonName } from '@/utils/entities'
import { hideBrokenImage } from '@/utils/posters'
import type { PeopleKind, PeopleResult, PersonCard } from '@/composables/usePeopleSearch'

const props = defineProps<{
  kind: PeopleKind
  result: PeopleResult | null
  loading: boolean
  error: string
}>()
const emit = defineEmits<{ page: [page: number] }>()

const router = useRouter()
const route = useRoute()

const heading = computed(() =>
  props.result && !props.result.trending
    ? 'Search Results'
    : props.kind === 'voice_actor'
      ? 'Trending Voice Actors'
      : 'Trending Characters',
)
const trendingNote = computed(() =>
  props.kind === 'voice_actor'
    ? 'Who voices the leads of today’s most popular titles.'
    : 'The leads of today’s most popular titles.',
)
const emptyTrending = computed(() =>
  props.kind === 'voice_actor' ? 'No trending voice actors yet.' : 'No trending characters yet.',
)

const displayName = (person: PersonCard) =>
  person.entityType === 'voice_actor'
    ? displayPersonName(person.name)
    : canonicalCharacterName(person.name) || person.name

const subtitleFor = (person: PersonCard) =>
  person.entityType === 'voice_actor'
    ? canonicalCharacterName(person.subtitle) || person.subtitle
    : person.subtitle

const detailFor = (person: PersonCard) => {
  if (person.entityType === 'voice_actor') {
    const roles = person.roleCount
      ? `${person.roleCount} role${person.roleCount === 1 ? '' : 's'}`
      : ''
    return [person.languages?.join(', '), roles].filter(Boolean).join(' · ')
  }
  const titles = person.titleCount || 0
  return titles > 1 ? `${titles} titles` : ''
}

const open = (person: PersonCard) => {
  router.push({
    name: getDetailsRouteName(person),
    params: { id: person._id },
    query: { from: route.fullPath },
  })
}
</script>

<style scoped>
.results-header {
  margin-bottom: 1.25rem;
}

.results-header h2 {
  margin: 0 0 0.25rem;
  color: var(--text-primary);
}

.results-header p {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.9rem;
}

.people-loading {
  display: flex;
  justify-content: center;
  padding: 3rem 0;
}

.spinner {
  width: 36px;
  height: 36px;
  border: 4px solid var(--border-color);
  border-top: 4px solid var(--highlight-color);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.people-empty {
  padding: 2rem 0;
  color: var(--text-muted);
  text-align: center;
}

.people-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 1.25rem 1rem;
  margin-bottom: 2rem;
  transition: opacity 0.15s ease;
}

.people-grid.stale {
  opacity: 0.55;
}

/* A button (inline-flex row site-wide): stack the picture and text. */
.person-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: center;
  line-height: 1.3;
  cursor: pointer;
}

.person-card img,
.person-card .no-photo {
  width: 100%;
  aspect-ratio: 11 / 14;
  object-fit: cover;
  border-radius: 10px;
  background: var(--bg-hover);
  transition: transform 0.2s ease;
}

.person-card:hover img,
.person-card:hover .no-photo {
  transform: translateY(-3px);
}

.no-photo {
  display: grid;
  place-items: center;
  color: var(--text-muted);
  font-size: 1.6rem;
}

.person-name {
  margin: 0.45rem 0 0;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-primary);
  overflow-wrap: anywhere;
}

.person-card:hover .person-name {
  color: var(--coral-primary);
}

.person-subtitle,
.person-detail {
  margin: 0.15rem 0 0;
  font-size: 0.78rem;
  color: var(--text-muted);
  overflow-wrap: anywhere;
}

@media (max-width: 600px) {
  .people-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.9rem 0.6rem;
  }

  .person-name {
    font-size: 0.8rem;
  }

  .person-subtitle,
  .person-detail {
    font-size: 0.7rem;
  }
}

/* App layout: the compact results header Search's catalog results use. */
:global(html.app-layout) .results-header {
  margin-bottom: 0.85rem;
}

:global(html.app-layout) .results-header h2 {
  margin: 0;
  font-size: 1.15rem;
}

:global(html.app-layout) .results-header p {
  font-size: 0.85rem;
}
</style>
