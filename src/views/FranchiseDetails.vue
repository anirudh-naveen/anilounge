<!--
  FranchiseDetails.vue — franchise detail view.

  Own screen for a catalog franchise: its name, nicknames, rating across the
  franchise, every movie, series, and special in it as a numbered watch-order
  timeline (release order, with each title after its prequels), then every
  character in those titles and everyone who worked on them. Content editors can
  reorder the timeline for everyone and add titles to it from here.
-->
<template>
  <div class="franchise-details">
    <div class="back-button" @click="goBack">
      <i class="fas fa-arrow-left"></i>
      Back
    </div>

    <div v-if="loading" class="loading">
      <div class="spinner"></div>
      <p>Loading franchise...</p>
    </div>

    <div v-else-if="error" class="error">
      <h2>Error Loading Franchise</h2>
      <p>{{ error }}</p>
      <button @click="goBack" class="btn-primary">Go Back</button>
    </div>

    <div v-else-if="franchise" class="franchise-content">
      <div class="franchise-header">
        <p class="entity-kicker">Franchise</p>
        <h1 class="franchise-title">{{ franchise.name }}</h1>
        <p v-if="franchise.nicknames.length" class="nicknames">
          Also known as {{ franchise.nicknames.join(', ') }}
        </p>
        <p class="franchise-counts" data-testid="franchise-counts">
          {{ countsLabel }}
          <span v-if="franchise.rating" class="franchise-rating">
            · <i class="fas fa-star"></i> {{ franchise.rating.toFixed(1) }} across the franchise
          </span>
        </p>
        <p v-if="franchise.about" class="about-text">{{ franchise.about }}</p>
      </div>

      <div class="timeline-head">
        <h2 class="timeline-heading">Watch Order</h2>
        <button
          v-if="authStore.canEditContent"
          type="button"
          class="btn-edit"
          data-testid="edit-watch-order"
          @click="editing = !editing"
        >
          <i :class="editing ? 'fas fa-check' : 'fas fa-pen'"></i>
          {{ editing ? 'Done' : 'Edit Order' }}
        </button>
      </div>
      <p class="timeline-note">
        {{
          franchise.customOrder
            ? 'Watch order set by the AniLounge team.'
            : 'Release order, with each title placed after the story it follows.'
        }}
      </p>

      <div v-if="editing" class="order-editor" data-testid="watch-order-editor">
        <div class="add-title">
          <input
            v-model="addQuery"
            type="search"
            placeholder="Add a movie, series, or special..."
            aria-label="Search titles to add"
            data-testid="add-title-search"
          />
          <ul v-if="addResults.length" class="add-results">
            <li v-for="hit in addResults" :key="hit.id">
              <button
                type="button"
                :disabled="busy"
                :data-testid="`add-title-${hit.id}`"
                @click="addWork(hit)"
              >
                <span>{{ hit.title }}</span>
                <small>
                  {{ hit.kind }}<span v-if="hitYear(hit)"> · {{ hitYear(hit) }}</span>
                </small>
              </button>
            </li>
          </ul>
        </div>
        <button
          v-if="franchise.customOrder"
          type="button"
          class="btn-reset"
          :disabled="busy"
          data-testid="reset-watch-order"
          @click="resetOrder"
        >
          Reset to Release Order
        </button>
      </div>

      <ol v-if="franchise.works.length" class="timeline" data-testid="franchise-timeline">
        <li
          v-for="(work, index) in franchise.works"
          :key="work._id"
          class="timeline-item"
          :class="{ editing }"
          :data-testid="`franchise-work-${work._id}`"
          @click="!editing && openWork(work)"
        >
          <span v-if="editing" class="order-move">
            <button
              type="button"
              :disabled="busy || index === 0"
              :aria-label="`Move ${workTitle(work)} up`"
              data-testid="move-up"
              @click.stop="moveWork(index, -1)"
            >
              <i class="fas fa-chevron-up"></i>
            </button>
            <button
              type="button"
              :disabled="busy || index === franchise.works.length - 1"
              :aria-label="`Move ${workTitle(work)} down`"
              data-testid="move-down"
              @click.stop="moveWork(index, 1)"
            >
              <i class="fas fa-chevron-down"></i>
            </button>
          </span>
          <span class="timeline-step">{{ index + 1 }}</span>
          <div class="timeline-card">
            <FavoriteHeart :content-id="work._id" />
            <img
              v-if="work.posterPath"
              class="timeline-poster"
              :src="getPosterUrl(work.posterPath)"
              :alt="getDisplayTitle(work)"
              @error="hideBrokenImage"
            />
            <div v-else class="timeline-poster no-poster">
              <i :class="isEpisodic(work.contentType) ? 'fas fa-tv' : 'fas fa-film'"></i>
            </div>
            <div class="timeline-info">
              <h3>{{ workTitle(work) }}</h3>
              <p class="content-type">
                {{ getCardContentTypeDisplay(work.contentType || 'movie') }}
                <span v-if="workYear(work)"> · {{ workYear(work) }}</span>
                <span v-if="isEpisodic(work.contentType) && work.episodeCount">
                  · {{ work.episodeCount }} {{ work.episodeCount === 1 ? 'episode' : 'episodes' }}
                </span>
              </p>
              <div v-if="work.unifiedScore" class="rating">
                <i class="fas fa-star"></i>
                <span>{{ Number(work.unifiedScore).toFixed(1) }}</span>
              </div>
            </div>
          </div>
        </li>
      </ol>

      <p v-else class="no-works">No catalog titles are linked to this franchise yet.</p>

      <!-- Franchise: Characters -->
      <DetailSection
        v-if="franchise.characters.length"
        name="franchise-characters"
        title="Characters"
        class="people-section"
      >
        <template #aside>
          <span class="people-count">{{ franchise.characters.length }}</span>
        </template>
        <div class="character-grid" data-testid="franchise-characters">
          <router-link
            v-for="character in franchise.characters"
            :key="character._id"
            :to="{
              name: 'CharacterDetails',
              params: { id: character._id },
              query: { from: route.fullPath },
            }"
            class="character-card"
            :data-testid="`character-card-${character._id}`"
          >
            <img
              v-if="character.imagePath"
              :src="getPosterUrl(character.imagePath)"
              :alt="characterName(character.name)"
              loading="lazy"
              referrerpolicy="no-referrer"
              @error="hideBrokenImage"
            />
            <div v-else class="no-photo"><i class="fas fa-user"></i></div>
            <p class="person-name">{{ characterName(character.name) }}</p>
            <p v-if="character.role" class="person-role">{{ character.role }}</p>
          </router-link>
        </div>
      </DetailSection>

      <!-- Franchise: Staff -->
      <DetailSection
        v-if="franchise.staff.length"
        name="franchise-staff"
        title="Staff"
        class="people-section"
      >
        <template #aside>
          <span class="people-count">{{ franchise.staff.length }}</span>
        </template>
        <div class="staff-list" data-testid="franchise-staff">
          <router-link
            v-for="person in franchise.staff"
            :key="person._id"
            :to="detailPath('/staff', person._id, person.name)"
            class="staff-card"
            :data-testid="`staff-${person._id}`"
          >
            <img
              v-if="person.imagePath"
              :src="getProfileUrl(person.imagePath)"
              :alt="person.name"
              loading="lazy"
              @error="hideBrokenImage"
            />
            <div v-else class="no-photo"><i class="fas fa-user"></i></div>
            <div class="staff-text">
              <p class="person-name">{{ person.name }}</p>
              <p class="person-role">{{ person.roles.join(', ') }}</p>
            </div>
          </router-link>
        </div>
      </DetailSection>
    </div>
  </div>
</template>

<script setup lang="ts">
import { isEpisodic } from '@/utils/contentKinds'
import { goBackOr } from '@/utils/navigation'
import { hideBrokenImage } from '@/utils/posters'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from 'vue-toastification'
import {
  adminAPI,
  contentAPI,
  getCardContentTypeDisplay,
  getDetailsRouteName,
  getPosterUrl,
  getProfileUrl,
} from '@/services/api'
import { getDisplayTitle } from '@/utils/titles'
import { canonicalCharacterName } from '@/utils/entities'
import { apiErrorMessage } from '@/utils/social'
import { useAuthStore } from '@/stores/auth'
import type { FranchiseDetails, UnifiedContent } from '@/types/content'
import FavoriteHeart from '@/components/FavoriteHeart.vue'
import DetailSection from '@/components/DetailSection.vue'
import { usePageMeta } from '@/composables/usePageMeta'
import { useCanonicalSlug } from '@/composables/useCanonicalSlug'
import { detailPath } from '@/utils/slug'
import { entityPageMeta } from '@/utils/pageMeta'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const authStore = useAuthStore()

const franchise = ref<FranchiseDetails | null>(null)
const loading = ref(true)
const error = ref('')

/** Content editors: the timeline shows move buttons and an add-title search. */
const editing = ref(false)
const busy = ref(false)

interface TitleHit {
  id: string
  kind: string
  title: string
  releaseDate?: string | null
}

const addQuery = ref('')
const addResults = ref<TitleHit[]>([])
const SEARCH_DELAY_MS = 300
let addTimer: ReturnType<typeof setTimeout> | undefined
let addSeq = 0

const characterName = (name: string) => canonicalCharacterName(name) || name

const countsLabel = computed(() => {
  const works = franchise.value?.works || []
  // Seasons stand in for their series in the watch order; count each series once.
  const series = new Set(
    works
      .filter((work) => isEpisodic(work.contentType))
      .map((work) => (work.contentType === 'season' && work.seriesId) || work._id),
  ).size
  const movies = works.filter((work) => work.contentType === 'movie').length
  const specials = works.filter((work) => work.contentType === 'special').length
  const parts = []
  if (series) parts.push(`${series} series`)
  if (movies) parts.push(`${movies} ${movies === 1 ? 'movie' : 'movies'}`)
  if (specials) parts.push(`${specials} ${specials === 1 ? 'special' : 'specials'}`)
  return parts.length ? parts.join(' · ') : 'No catalog titles yet'
})

/** "Blue Box · Season 1" when a season's own name doesn't say which season it is. */
const workTitle = (work: UnifiedContent) => {
  const title = getDisplayTitle(work)
  const label = work.contentType === 'season' ? work.seasonLabel : ''
  return label && !title.toLowerCase().includes(label.toLowerCase()) ? `${title} · ${label}` : title
}

const workYear = (work: UnifiedContent) => {
  const date = work.releaseDate ? new Date(work.releaseDate) : null
  const year = date && !Number.isNaN(date.getTime()) ? date.getFullYear() : 0
  return year || work.startSeasonYear || null
}

const hitYear = (hit: TitleHit) => (hit.releaseDate ? new Date(hit.releaseDate).getFullYear() : '')

/** Run an admin change; the response carries the updated franchise. */
const saveChange = async (
  call: () => Promise<{ data: { data: FranchiseDetails; message: string } }>,
) => {
  busy.value = true
  try {
    const response = await call()
    franchise.value = response.data.data
    toast.success(response.data.message)
    return true
  } catch (err) {
    toast.error(apiErrorMessage(err, 'That did not work.'))
    return false
  } finally {
    busy.value = false
  }
}

const moveWork = (index: number, step: -1 | 1) => {
  const value = franchise.value
  if (!value) return
  const order = value.works.map((work) => work._id)
  const [moved] = order.splice(index, 1)
  order.splice(index + step, 0, moved!)
  saveChange(() => adminAPI.setFranchiseWatchOrder(value._id, order))
}

const resetOrder = () => {
  const value = franchise.value
  if (!value || !window.confirm('Go back to the release order for everyone?')) return
  saveChange(() => adminAPI.setFranchiseWatchOrder(value._id, []))
}

const addWork = async (hit: TitleHit) => {
  const value = franchise.value
  if (!value) return
  const ok = await saveChange(() => adminAPI.addFranchiseWork(value._id, hit.id))
  if (ok) {
    addQuery.value = ''
    addResults.value = []
  }
}

watch(addQuery, (value) => {
  clearTimeout(addTimer)
  const term = value.trim()
  if (term.length < 2) {
    addSeq++
    addResults.value = []
    return
  }
  addTimer = setTimeout(async () => {
    const seq = ++addSeq
    try {
      const response = await adminAPI.searchContent({ q: term, type: 'work' })
      const taken = new Set(
        (franchise.value?.works || []).flatMap((work) => [work._id, work.seriesId || '']),
      )
      if (seq === addSeq) {
        addResults.value = (response.data.data.items as TitleHit[])
          .filter((hit) => !taken.has(hit.id))
          .slice(0, 8)
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Search failed.'))
    }
  }, SEARCH_DELAY_MS)
})

onBeforeUnmount(() => clearTimeout(addTimer))

const loadFranchise = async (id: string) => {
  loading.value = true
  error.value = ''
  try {
    const response = await contentAPI.getFranchise(id)
    franchise.value = response.data.data
    window.scrollTo(0, 0)
  } catch (err) {
    const status = (err as { response?: { status?: number } })?.response?.status
    error.value =
      status === 404
        ? 'Franchise not found'
        : err instanceof Error
          ? err.message
          : 'Failed to load franchise'
    franchise.value = null
  } finally {
    loading.value = false
  }
}

const openWork = (work: UnifiedContent) => {
  router.push({
    name: getDetailsRouteName({ contentType: work.contentType }),
    params: { id: work._id },
    query: { from: route.fullPath },
  })
}

/** Back to the previous page, or the `from` page (else Search) when opened directly. */
const goBack = () => goBackOr(router, () => router.push((route.query.from as string) || '/search'))

watch(
  () => route.params.id,
  (id) => {
    editing.value = false
    addQuery.value = ''
    if (typeof id === 'string') loadFranchise(id)
  },
  { immediate: true },
)

usePageMeta(() => {
  const value = franchise.value
  if (!value) return null
  return entityPageMeta('franchise', value, {
    path: detailPath('/franchise', value._id, value.name),
    image: value.imagePath ? getPosterUrl(value.imagePath) : null,
    works: value.works.map((work) => getDisplayTitle(work)),
  })
})

useCanonicalSlug(
  () => franchise.value?.name,
  () => franchise.value?._id,
)
</script>

<style scoped>
.franchise-details {
  max-width: 900px;
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

.btn-primary {
  border-radius: 8px;
  padding: 0.65rem 1.1rem;
  font-weight: 600;
  cursor: pointer;
  background: var(--coral-primary);
  color: white;
  border: 0;
}

.franchise-header {
  margin-bottom: 2rem;
  padding: 1.5rem;
  border-radius: 12px;
  background: linear-gradient(90deg, var(--coral-light), var(--tan-primary));
  color: white;
}

.entity-kicker {
  margin: 0 0 0.35rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 0.8rem;
  opacity: 0.85;
}

.franchise-title {
  margin: 0 0 0.5rem;
  font-size: 2.2rem;
}

.nicknames,
.franchise-counts {
  margin: 0 0 0.35rem;
}

.about-text {
  white-space: pre-wrap;
  line-height: 1.6;
  margin: 0.75rem 0 0;
}

.timeline-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.25rem;
}

.timeline-heading {
  margin: 0;
  color: var(--text-primary);
}

.btn-edit,
.btn-reset {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.85rem;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}

.btn-edit:hover,
.btn-reset:hover:not(:disabled) {
  border-color: var(--coral-primary);
}

.order-editor {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: flex-start;
  margin-bottom: 1.25rem;
}

.add-title {
  position: relative;
  flex: 1 1 260px;
}

.add-title input {
  width: 100%;
  padding: 0.55rem 0.8rem;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-primary);
  font: inherit;
}

.add-results {
  list-style: none;
  margin: 0.35rem 0 0;
  padding: 0.25rem;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
}

.add-results button {
  display: flex;
  width: 100%;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.45rem 0.6rem;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.add-results button:hover:not(:disabled) {
  background: var(--bg-hover);
}

.add-results small {
  flex-shrink: 0;
  color: var(--text-muted);
  text-transform: capitalize;
}

.order-move {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.order-move button {
  width: 28px;
  height: 22px;
  display: grid;
  place-items: center;
  padding: 0;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-secondary);
  cursor: pointer;
}

.order-move button:disabled {
  opacity: 0.35;
  cursor: default;
}

.timeline-item.editing {
  cursor: default;
}

.timeline-item.editing:hover .timeline-card {
  transform: none;
}

.timeline-note {
  margin: 0 0 1.25rem;
  color: var(--text-muted);
  font-size: 0.9rem;
}

.timeline {
  list-style: none;
  margin: 0;
  padding: 0;
  position: relative;
}

/* The line joining the step numbers. */
.timeline::before {
  content: '';
  position: absolute;
  left: 17px;
  top: 18px;
  bottom: 18px;
  width: 2px;
  background: var(--border-color);
}

.timeline-item {
  position: relative;
  display: flex;
  gap: 1rem;
  align-items: center;
  margin-bottom: 1rem;
  cursor: pointer;
}

.timeline-step {
  position: relative;
  flex: 0 0 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  color: white;
  background: var(--coral-primary);
}

.timeline-card {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  gap: 1rem;
  align-items: center;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  overflow: hidden;
  transition:
    transform 0.2s ease,
    border-color 0.2s ease;
}

.timeline-item:hover .timeline-card {
  transform: translateX(3px);
  border-color: var(--coral-primary);
}

.timeline-poster {
  width: 70px;
  height: 100px;
  object-fit: cover;
  flex-shrink: 0;
}

.no-poster {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  background: var(--bg-hover);
  font-size: 1.3rem;
}

.timeline-info {
  min-width: 0;
  padding: 0.5rem 2.5rem 0.5rem 0;
}

.timeline-info h3 {
  margin: 0 0 0.25rem;
  font-size: 1.05rem;
  color: var(--text-primary);
}

.content-type {
  margin: 0;
  font-size: 0.85rem;
  color: var(--text-muted);
}

.rating {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  margin-top: 0.3rem;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.rating i {
  color: var(--gold-accent);
}

.no-works {
  color: var(--text-muted);
}

.people-section {
  margin-top: 2rem;
}

.people-count {
  color: var(--text-muted);
  font-size: 0.9rem;
}

.character-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 1rem 0.75rem;
}

.character-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  color: inherit;
  text-decoration: none;
  min-width: 0;
}

.character-card img,
.character-card .no-photo {
  width: 100%;
  aspect-ratio: 11 / 14;
  object-fit: cover;
  border-radius: 8px;
  background: var(--bg-hover);
}

.no-photo {
  display: grid;
  place-items: center;
  color: var(--text-muted);
  font-size: 1.3rem;
}

.character-card .person-name {
  margin-top: 0.35rem;
  font-size: 0.8rem;
}

.person-name {
  margin: 0;
  font-weight: 600;
  color: var(--text-primary);
  overflow-wrap: anywhere;
}

.person-role {
  margin: 0.15rem 0 0;
  font-size: 0.75rem;
  color: var(--text-muted);
}

.staff-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 0.75rem;
}

.staff-card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  text-decoration: none;
  min-width: 0;
}

.staff-card:hover {
  border-color: var(--coral-primary);
}

.character-card:hover .person-name {
  color: var(--coral-primary);
}

.staff-card img,
.staff-card .no-photo {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
  font-size: 1rem;
  background: var(--bg-hover);
}

.staff-text {
  min-width: 0;
}

.staff-card .person-role {
  font-size: 0.8rem;
}

@media (max-width: 600px) {
  .franchise-details {
    padding: 1rem;
  }

  .franchise-title {
    font-size: 1.7rem;
  }

  .character-grid {
    grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  }
}
</style>
