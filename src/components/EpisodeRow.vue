<!--
  EpisodeRow.vue — horizontal TV episode strip (component).

  Renders season pills and a left-to-right episode scroller on the show
  details page. Clicking a card expands title, description, and cast in place;
  episodes are not routed to their own page.
-->
<template>
  <section v-if="loading || episodes.length" class="episode-row">
    <!-- Title: Heading -->
    <h2>Episodes</h2>

    <!-- Title: Loading State -->
    <div v-if="loading" class="episode-loading">
      <div class="spinner"></div>
      <p>Loading episodes...</p>
    </div>

    <template v-else>
      <!-- Title: Season Picker -->
      <div v-if="multiSeason" class="season-pills" role="tablist" aria-label="Seasons">
        <button
          v-for="season in seasons"
          :key="`season-${season}`"
          type="button"
          class="season-pill"
          :class="{ active: season === selectedSeason }"
          :aria-selected="season === selectedSeason"
          @click="selectSeason(season)"
        >
          Season {{ season }}
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
          @click="toggleEpisode(episode)"
        >
          <div class="episode-still">
            <img
              v-if="episode.stillPath"
              :src="getStillUrl(episode.stillPath)"
              :alt="episode.title"
              @error="handleImageError"
            />
            <div v-else class="no-still">
              <i class="fas fa-play"></i>
            </div>
            <span class="episode-index">{{ formatEpisodeIndex(episode, multiSeason) }}</span>
          </div>
          <p class="episode-card-title">{{ episode.title }}</p>
        </button>
      </div>

      <!-- Title: Expanded Episode -->
      <div v-if="selectedEpisode" id="episode-expanded" class="episode-expanded">
        <div class="expanded-header">
          <h3>
            {{ formatEpisodeIndex(selectedEpisode, multiSeason) }} · {{ selectedEpisode.title }}
          </h3>
          <p v-if="expandedMeta" class="expanded-meta">{{ expandedMeta }}</p>
        </div>
        <p class="expanded-overview">
          {{ selectedEpisode.overview || 'No description available.' }}
        </p>
        <EntityCastRow
          v-if="characters.length"
          :items="characters"
          :content-id="contentId"
          title="Characters"
        />
        <div v-else-if="selectedEpisode.cast.length" class="expanded-cast">
          <h4>Cast</h4>
          <div class="cast-list">
            <button
              v-for="member in selectedEpisode.cast"
              :key="`${member.name}-${member.character}`"
              type="button"
              class="cast-card"
              :disabled="!matchedCharacter(member.character)"
              @click.stop="openMatchedCharacter(member.character)"
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
            </button>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { CatalogEntity, Episode } from '@/types/content'
import { getProfileUrl, getStillUrl } from '@/services/api'
import {
  episodeKey,
  episodesForSeason,
  formatEpisodeIndex,
  getSeasonNumbers,
} from '@/utils/episodes'
import { cleanCharacterName, matchCharacterByName } from '@/utils/entities'
import EntityCastRow from '@/components/EntityCastRow.vue'

const props = withDefaults(
  defineProps<{
    episodes: Episode[]
    loading?: boolean
    characters?: CatalogEntity[]
    contentId?: string
  }>(),
  {
    characters: () => [],
  },
)

const router = useRouter()
const route = useRoute()

const matchedCharacter = (characterName: string) =>
  matchCharacterByName(characterName, props.characters)

const openMatchedCharacter = (characterName: string) => {
  const entity = matchedCharacter(characterName)
  if (!entity) return
  router.push({
    name: 'CharacterDetails',
    params: { id: entity._id },
    query: { from: route.fullPath },
  })
}

const stripEl = ref<HTMLElement | null>(null)
const selectedSeason = ref(1)
const selectedKey = ref('')

const seasons = computed(() => getSeasonNumbers(props.episodes))
const multiSeason = computed(() => seasons.value.length > 1)
const visibleEpisodes = computed(() => episodesForSeason(props.episodes, selectedSeason.value))

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

const isSelected = (episode: Episode) => episodeKey(episode) === selectedKey.value

const selectSeason = (season: number) => {
  selectedSeason.value = season
  selectedKey.value = ''
  if (stripEl.value) stripEl.value.scrollLeft = 0
}

const toggleEpisode = (episode: Episode) => {
  const key = episodeKey(episode)
  selectedKey.value = selectedKey.value === key ? '' : key
}

watch(
  () => props.episodes,
  (episodes) => {
    const numbers = getSeasonNumbers(episodes)
    selectedSeason.value = numbers[0] || 1
    selectedKey.value = ''
  },
  { immediate: true },
)

const handleImageError = (event: Event) => {
  const img = event.target as HTMLImageElement
  img.style.display = 'none'
}
</script>

<style scoped>
.episode-row {
  margin-bottom: 2rem;
}

.episode-row h2 {
  font-size: 1.5rem;
  margin-bottom: 1rem;
  color: var(--text-primary);
}

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
  flex: 0 0 180px;
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
  height: 102px;
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

.no-still i {
  font-size: 1.4rem;
}

.episode-index {
  position: absolute;
  left: 6px;
  bottom: 6px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  font-size: 0.7rem;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
}

.episode-card-title {
  margin: 0;
  padding: 0.55rem 0.65rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
  cursor: pointer;
}

.cast-card:disabled {
  cursor: default;
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
