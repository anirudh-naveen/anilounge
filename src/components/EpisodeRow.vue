<!--
  EpisodeRow.vue — horizontal TV episode strip (component).

  Renders season pills and a left-to-right episode scroller on the show
  details page. Clicking a card expands its title, description, and the people who
  worked on that episode in place, and emits `select-episode` so the page can
  narrow its characters to it (null when it closes); episodes are not routed to
  their own page. With no catalog characters, the panel lists the episode's TMDB
  cast itself. Picking a season emits
  `select-season`; a parent passing `selectedSeason` controls the pills, and
  `seasonPicker: false` hides them when the parent has its own season picker.
-->
<template>
  <DetailSection
    v-if="loading || episodes.length"
    name="episodes"
    title="Episodes"
    class="episode-row"
  >
    <!-- Title: Loading State -->
    <div v-if="loading" class="episode-loading">
      <div class="spinner"></div>
      <p>Loading episodes...</p>
    </div>

    <template v-else>
      <!-- Title: Season Picker -->
      <div
        v-if="multiSeason && seasonPicker"
        class="season-pills"
        role="tablist"
        aria-label="Seasons"
      >
        <button
          v-for="season in seasons"
          :key="`season-${season}`"
          type="button"
          class="season-pill"
          :class="{ active: season === activeSeason }"
          :aria-selected="season === activeSeason"
          @click="selectSeason(season)"
        >
          {{ seasonNames?.[season] || `Season ${season}` }}
        </button>
      </div>

      <!-- Title: Episode Strip -->
      <div ref="stripEl" class="episode-strip">
        <button
          v-for="episode in visibleEpisodes"
          :key="episodeKey(episode)"
          type="button"
          class="episode-card"
          :class="{ expanded: isSelected(episode) }"
          :data-testid="`episode-${episodeKey(episode)}`"
          :aria-expanded="isSelected(episode)"
          :aria-controls="isSelected(episode) ? 'episode-expanded' : undefined"
          :aria-label="`${indexLabel(episode)}: ${episode.title}`"
          @click="toggleEpisode(episode)"
        >
          <div class="episode-still">
            <img
              v-if="episode.stillPath"
              :src="getStillUrl(episode.stillPath)"
              :alt="episode.title"
              @error="handleImageError"
            />
            <div v-else class="no-still"></div>
            <span class="episode-index" aria-hidden="true">{{ episode.episodeNumber }}</span>
            <span v-if="episode.isFiller || episode.isRecap" class="episode-flag">
              {{ episode.isRecap ? 'Recap' : 'Filler' }}
            </span>
          </div>
          <div class="episode-card-body">
            <p class="episode-card-title">{{ episode.title }}</p>
            <p v-if="cardMeta(episode)" class="episode-card-meta">{{ cardMeta(episode) }}</p>
          </div>
        </button>
      </div>

      <!-- Title: Expanded Episode -->
      <div v-if="selectedEpisode" id="episode-expanded" class="episode-expanded">
        <div class="expanded-header">
          <h3>{{ indexLabel(selectedEpisode) }} · {{ selectedEpisode.title }}</h3>
          <p v-if="otherTitles" class="expanded-titles">{{ otherTitles }}</p>
          <p v-if="expandedMeta" class="expanded-meta">{{ expandedMeta }}</p>
        </div>
        <p class="expanded-overview">
          {{ selectedEpisode.overview || 'No description available.' }}
        </p>
        <div v-if="!characters.length && selectedEpisode.cast.length" class="expanded-cast">
          <h4>Cast</h4>
          <div class="cast-list">
            <div
              v-for="member in selectedEpisode.cast"
              :key="`${member.name}-${member.character}`"
              class="cast-card"
            >
              <img
                v-if="member.profilePath"
                :src="getProfileUrl(member.profilePath)"
                :alt="member.name"
                @error="handleImageError"
              />
              <div v-else class="no-profile">
                <i class="fas fa-user"></i>
              </div>
              <p class="cast-name">{{ member.name }}</p>
              <p v-if="cleanCharacterName(member.character)" class="cast-character">
                {{ cleanCharacterName(member.character) }}
              </p>
            </div>
          </div>
        </div>
        <!-- Title: Episode Staff -->
        <div v-if="episodeStaffGroups.length" class="expanded-staff" data-testid="episode-staff">
          <h4>Staff On This Episode</h4>
          <dl>
            <template v-for="group in episodeStaffGroups" :key="group.role">
              <dt>{{ group.role }}</dt>
              <dd>
                <template v-for="(person, index) in group.people" :key="person._id">
                  <router-link :to="detailPath('/staff', person._id, person.name)">{{
                    person.name
                  }}</router-link
                  ><span v-if="index < group.people.length - 1">, </span>
                </template>
              </dd>
            </template>
          </dl>
        </div>
      </div>
    </template>
  </DetailSection>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { CatalogEntity, Episode } from '@/types/content'
import { getProfileUrl, getStillUrl } from '@/services/api'
import {
  episodeKey,
  episodesForSeason,
  formatEpisodeIndex,
  getSeasonNumbers,
} from '@/utils/episodes'
import { cleanCharacterName } from '@/utils/entities'
import { detailPath } from '@/utils/slug'
import DetailSection from '@/components/DetailSection.vue'

const props = withDefaults(
  defineProps<{
    episodes: Episode[]
    loading?: boolean
    /** The page's catalog characters; without any, the panel lists the episode's cast. */
    characters?: CatalogEntity[]
    /** Season chosen by the parent; null lets the row track its own pick. */
    selectedSeason?: number | null
    /**
     * Names for the season pills by guide number ("Season 3 Part 2", "Stone Wars").
     * With them the pills say which season, so cards just number the episode.
     */
    seasonNames?: Record<number, string> | null
    /** Show the season pills (off when the page picks seasons itself). */
    seasonPicker?: boolean
  }>(),
  {
    characters: () => [],
    selectedSeason: null,
    seasonNames: null,
    seasonPicker: true,
  },
)

const emit = defineEmits<{
  'select-season': [season: number]
  'select-episode': [episode: Episode | null]
}>()

const stripEl = ref<HTMLElement | null>(null)
const ownSeason = ref(1)
const selectedKey = ref('')

const seasons = computed(() => getSeasonNumbers(props.episodes))
const activeSeason = computed(() => props.selectedSeason ?? ownSeason.value)
const multiSeason = computed(() => seasons.value.length > 1)
const visibleEpisodes = computed(() => episodesForSeason(props.episodes, activeSeason.value))

const selectedEpisode = computed(
  () => visibleEpisodes.value.find((episode) => episodeKey(episode) === selectedKey.value) || null,
)

const expandedMeta = computed(() => {
  if (!selectedEpisode.value) return ''
  const parts: string[] = []
  if (selectedEpisode.value.airDate) {
    const date = new Date(selectedEpisode.value.airDate)
    if (!Number.isNaN(date.getTime())) {
      parts.push(
        date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
      )
    }
  }
  if (selectedEpisode.value.runtime) {
    parts.push(`${selectedEpisode.value.runtime} min`)
  }
  return parts.join(' · ')
})

/** "Jul 6, 2023 · 24 min" under a card's title. */
const cardMeta = (episode: Episode) => {
  const parts: string[] = []
  const date = episode.airDate ? new Date(episode.airDate) : null
  if (date && !Number.isNaN(date.getTime())) {
    parts.push(
      date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
    )
  }
  if (episode.runtime) parts.push(`${episode.runtime} min`)
  return parts.join(' · ')
}

const isSelected = (episode: Episode) => episodeKey(episode) === selectedKey.value

watch(selectedEpisode, (episode) => emit('select-episode', episode))

/** The open episode's staff, one line per role. */
const episodeStaffGroups = computed(() => {
  const groups = new Map<string, Array<{ _id: string; name: string }>>()
  for (const person of selectedEpisode.value?.staff || []) {
    if (!groups.has(person.role)) groups.set(person.role, [])
    groups.get(person.role)!.push(person)
  }
  return [...groups].map(([role, people]) => ({ role, people }))
})

const indexLabel = (episode: Episode) =>
  formatEpisodeIndex(episode, multiSeason.value && !props.seasonNames)

/** The episode's romaji and Japanese titles, when they differ from its title. */
const otherTitles = computed(() => {
  const episode = selectedEpisode.value
  if (!episode) return ''
  return [episode.titleRomaji, episode.titleNative]
    .filter((title) => title && title !== episode.title)
    .join(' · ')
})

const selectSeason = (season: number) => {
  ownSeason.value = season
  emit('select-season', season)
}

const toggleEpisode = (episode: Episode) => {
  const key = episodeKey(episode)
  selectedKey.value = selectedKey.value === key ? '' : key
}

watch(activeSeason, () => {
  selectedKey.value = ''
  if (stripEl.value) stripEl.value.scrollLeft = 0
})

watch(
  () => props.episodes,
  (episodes) => {
    const numbers = getSeasonNumbers(episodes)
    ownSeason.value = numbers[0] || 1
    selectedKey.value = ''
  },
  { immediate: true },
)

/** Close the open episode (the page's "whole season" button). */
const closeEpisode = () => {
  selectedKey.value = ''
}

defineExpose({ closeEpisode })

const handleImageError = (event: Event) => {
  const img = event.target as HTMLImageElement
  img.style.display = 'none'
}
</script>

<style scoped>
.episode-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 1.5rem;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
}

.episode-loading p {
  margin: 0;
  color: var(--text-secondary);
}

.spinner {
  width: 32px;
  height: 32px;
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

.season-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.season-pill {
  background: var(--bg-card);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 20px;
  padding: 0.35rem 0.9rem;
  font-size: 0.9rem;
  font-weight: 600;
  line-height: 1.15;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  cursor: pointer;
}

.season-pill.active,
.season-pill:hover {
  background: var(--blend-color);
  border-color: var(--coral-primary);
  color: white;
}

.episode-strip {
  display: flex;
  gap: 0.75rem;
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: 0.75rem;
  scroll-snap-type: x proximity;
  -webkit-overflow-scrolling: touch;
}

.episode-strip::-webkit-scrollbar {
  height: 8px;
}

.episode-strip::-webkit-scrollbar-thumb {
  background: var(--coral-primary);
  border-radius: 4px;
}

.episode-card {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  flex: 0 0 200px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  overflow: hidden;
  cursor: pointer;
  text-align: left;
  color: inherit;
  padding: 0;
  scroll-snap-align: start;
  transition:
    transform 0.2s ease,
    border-color 0.2s ease;
}

.episode-card:hover,
.episode-card.expanded {
  transform: translateY(-3px);
  border-color: var(--coral-primary);
}

.episode-still {
  position: relative;
  aspect-ratio: 16 / 9;
  background: var(--bg-hover);
}

.episode-still img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.no-still,
.no-profile {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  background: var(--bg-hover);
}

.expanded-staff {
  margin-top: 1rem;
}

.expanded-staff h4 {
  margin-bottom: 0.5rem;
}

.expanded-staff dl {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.3rem 1rem;
  margin: 0;
  font-size: 0.9rem;
}

.expanded-staff dt {
  color: var(--text-muted);
}

.expanded-staff dd {
  margin: 0;
}

.expanded-staff a {
  color: var(--text-primary);
  text-decoration: none;
}

.expanded-staff a:hover {
  color: var(--coral-primary);
  text-decoration: underline;
}

.episode-flag {
  position: absolute;
  top: 0.4rem;
  right: 0.4rem;
  padding: 0.1rem 0.45rem;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.75);
  color: var(--text-muted);
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.expanded-titles {
  color: var(--text-muted);
  font-size: 0.9rem;
  margin-top: 0.25rem;
}

.episode-index {
  position: absolute;
  top: 6px;
  left: 6px;
  min-width: 1.6rem;
  padding: 0.15rem 0.45rem;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.75);
  color: #fff;
  font-size: 0.8rem;
  font-weight: 700;
  line-height: 1.3;
  text-align: center;
}

.episode-card-body {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.55rem 0.65rem 0.65rem;
}

.episode-card-title {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  margin: 0;
  overflow: hidden;
  font-size: 0.9rem;
  font-weight: 600;
  line-height: 1.3;
  color: var(--text-primary);
}

.episode-card-meta {
  margin: 0;
  font-size: 0.78rem;
  color: var(--text-muted);
}

.episode-expanded {
  margin-top: 1rem;
  padding: 1.25rem;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
}

.expanded-header h3 {
  margin: 0 0 0.35rem;
  font-size: 1.15rem;
  color: var(--text-primary);
}

.expanded-meta {
  margin: 0 0 0.75rem;
  font-size: 0.9rem;
  color: var(--text-muted);
}

.expanded-overview {
  margin: 0;
  font-size: 1rem;
  line-height: 1.6;
  color: var(--text-secondary);
}

.expanded-cast {
  margin-top: 1.25rem;
}

.expanded-cast h4 {
  margin: 0 0 0.75rem;
  font-size: 1rem;
  color: var(--text-primary);
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
}

.cast-card img,
.cast-card .no-profile {
  width: 110px;
  height: 140px;
  object-fit: cover;
  border-radius: 8px;
  background: var(--bg-hover);
}

.no-profile i {
  font-size: 1.5rem;
}

.cast-name,
.cast-character {
  margin: 0.35rem 0 0;
  font-size: 0.8rem;
}

.cast-name {
  font-weight: 600;
  color: var(--text-primary);
}

.cast-character {
  color: var(--text-muted);
}

@media (max-width: 768px) {
  .episode-card {
    flex-basis: 150px;
  }
}
</style>
