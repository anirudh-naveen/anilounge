<!--
  TVShowDetails.vue — series detail view.

  Loads one series by route id and shows poster, titles, franchise, season/episode
  meta, watchlist actions, then overview, seasons and episodes, characters, tags,
  where to watch and trailer, the forum, and credits. Picking a season swaps the
  page to that season's details in place (`?season=N` on the series route): the
  season's own catalog title when one exists, otherwise the show with TMDB's
  season poster/overview. With no season picked, the first season shows. From a
  season's own page, picking another season moves to the series route with that
  season picked. A series with a single season is shown as the series: no season
  cards, label, or count (its lone season's own page moves to the series). A
  season's own title borrows the overview, genres, and studios it lacks from its
  series. Opening an episode narrows the characters to it (its staff show
  in the episode panel). Every section below the header folds away.
-->
<template>
  <div class="tv-details">
    <!-- Navigation -->
    <div class="back-button" @click="goBack">
      <i class="fas fa-arrow-left"></i>
      Back
    </div>

    <!-- Status -->
    <!-- Title: Loading State -->
    <div v-if="loading" class="loading">
      <div class="spinner"></div>
      <p>Loading series details...</p>
    </div>

    <!-- Title: Error State -->
    <div v-else-if="error" class="error">
      <h2>Error Loading Series</h2>
      <p>{{ error }}</p>
      <button @click="goBack" class="btn-primary">Go Back</button>
    </div>

    <div v-else-if="show" class="show-content">
      <!-- Header -->
      <div class="show-header">
        <!-- Title: Poster -->
        <div class="show-poster">
          <img
            v-if="show.posterPath"
            :src="getPosterUrl(show.posterPath)"
            :alt="getDisplayTitle(show)"
            @error="hideBrokenImage"
          />
          <div v-else class="no-poster">
            <i class="fas fa-tv"></i>
            <p>No poster available</p>
          </div>
        </div>

        <div class="show-info title-info">
          <!-- Title: Titles -->
          <p v-if="show.series" class="eyebrow" data-testid="season-label">
            <router-link
              :to="detailPath('/tv-show', show.series._id, show.series.title)"
              class="series-link"
              data-testid="series-link"
              >{{ show.series.title }}</router-link
            ><span class="eyebrow-sep" aria-hidden="true">/</span
            ><span>{{ show.seasonLabel || seasonLabel }}</span>
          </p>
          <p v-else-if="seasonLabel" class="eyebrow" data-testid="season-label">
            {{ seasonLabel }}
          </p>
          <h1 class="show-title title-heading">{{ getDisplayTitle(show) }}</h1>
          <p v-if="getNativeTitle(show)" class="original-title" lang="ja">
            {{ getNativeTitle(show) }}
          </p>

          <!-- Title: Facts -->
          <ul class="title-facts">
            <li class="fact-rating">
              <ForumIcon name="star" filled class="fact-star" />
              <strong>{{ getDisplayScore(show) }}</strong>
              <span v-if="getDisplayVoteCount(show)" class="fact-muted">
                {{ formatVotes(getDisplayVoteCount(show)) }} votes
              </span>
            </li>
            <li v-if="show.releaseDate">{{ formatDate(show.releaseDate) }}</li>
            <li v-if="(show.seasonCount || 0) > 1 && show.contentType !== 'season'">
              {{ show.seasonCount }} seasons
            </li>
            <li v-if="show.episodeCount || show.malEpisodes">
              {{ show.episodeCount || show.malEpisodes }} episode{{
                (show.episodeCount || show.malEpisodes || 0) > 1 ? 's' : ''
              }}
            </li>
            <li v-if="isCurrentlyAiring(show) || isUpcoming(show)" class="fact-badge">
              <AiringBadge :content="show" variant="detail" />
            </li>
            <li v-else-if="show.malStatus">{{ formatAiringStatus(show.malStatus) }}</li>
          </ul>

          <div v-if="show.genres?.length" class="genres">
            <span
              v-for="genre in show.genres"
              :key="typeof genre === 'string' ? genre : genre.name || genre.id"
              class="genre-tag"
            >
              {{ typeof genre === 'string' ? genre : genre.name }}
            </span>
          </div>

          <div class="title-pills">
            <FranchiseLink :content="show" />
            <MainStudio :content="show" />
          </div>

          <!-- Title: Actions -->
          <div class="show-actions title-actions">
            <FavoriteHeart :content-id="show._id" variant="button" />
            <button @click="shareShow" class="btn-outline">Share</button>
            <button
              v-if="hasUpcomingEpisode"
              type="button"
              class="btn-outline"
              data-testid="add-to-calendar"
              @click="addToCalendar"
            >
              Add to Calendar
            </button>
          </div>
        </div>
      </div>

      <!-- Title: Watchlist -->
      <!-- A series with seasons is tracked season by season, unless it is tracked already. -->
      <WatchlistPanel
        v-if="
          show.contentType === 'season' ||
          !seriesSeasons.length ||
          contentStore.isInWatchlist(show._id)
        "
        :content-id="watchlistTargetId"
        content-type="tv"
        :total-episodes="show.episodeCount || show.malEpisodes || 0"
        :total-seasons="show.contentType === 'season' ? 1 : show.seasonCount || 1"
      />

      <!-- Body -->
      <!-- Title: Overview -->
      <DetailSection name="overview" title="Overview" :collapsible="false" class="show-description">
        <p>{{ show.overview || 'No overview available.' }}</p>
      </DetailSection>

      <!-- Title: Seasons -->
      <!-- Picking a season swaps the page above and below to that season's details. -->
      <DetailSection
        v-if="seriesSeasons.length"
        name="seasons"
        title="Seasons"
        class="series-seasons"
        data-testid="series-seasons"
      >
        <template #aside>Pick a season to see, track, and rate it</template>
        <div class="season-cards">
          <button
            v-for="season in seriesSeasons"
            :key="season._id"
            type="button"
            class="season-card"
            :class="{ active: season._id === selectedSeasonInfo?.contentId }"
            :aria-pressed="season._id === selectedSeasonInfo?.contentId"
            :data-testid="`season-card-${season._id}`"
            @click="selectSeasonCard(season)"
          >
            <img
              v-if="season.posterPath"
              :src="getPosterUrl(season.posterPath)"
              :alt="season.label"
              @error="hideBrokenImage"
            />
            <div v-else class="no-poster"></div>
            <div class="season-card-info">
              <p class="season-card-label">{{ season.label }}</p>
              <p class="season-card-meta">
                {{
                  [
                    season.releaseDate ? new Date(season.releaseDate).getFullYear() : '',
                    season.episodeCount ? `${season.episodeCount} episodes` : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')
                }}
              </p>
              <p class="season-card-meta">
                <span v-if="season.unifiedScore" class="season-score"
                  ><ForumIcon name="star" filled class="fact-star" />
                  {{ season.unifiedScore.toFixed(1) }}</span
                >
                <span v-if="season.airingStatus === 'airing'" class="season-airing">Airing</span>
                <span v-else-if="season.airingStatus === 'upcoming'" class="season-airing"
                  >Upcoming</span
                >
                <span v-if="contentStore.isInWatchlist(season._id)" class="season-tracked">
                  {{ watchlistStatusLabel(season._id) }}
                </span>
              </p>
            </div>
          </button>
        </div>
      </DetailSection>

      <!-- Title: Episodes -->
      <EpisodeRow
        ref="episodeRow"
        :episodes="episodes"
        :loading="episodesLoading"
        :characters="characters"
        :selected-season="selectedSeason"
        :season-names="seasonNames"
        :season-picker="!seriesSeasons.length"
        @select-season="selectSeason"
        @select-episode="selectedEpisode = $event"
      />

      <!-- Title: Characters -->
      <EntityCastRow :items="shownCharacters" :content-id="show._id" :loading="charactersLoading">
        <template v-if="episodeFocus" #aside>
          <span class="episode-focus" data-testid="episode-focus">
            <span
              >In <strong>{{ episodeFocus }}</strong></span
            >
            <button type="button" class="focus-clear" @click="episodeRow?.closeEpisode()">
              Show All
            </button>
          </span>
        </template>
      </EntityCastRow>
      <p v-if="shownCharacters.some((item) => isTvmazeImage(item.imagePath))" class="image-credit">
        Character images from
        <a href="https://www.tvmaze.com" target="_blank" rel="noopener">TVmaze</a> (CC BY-SA).
      </p>

      <!-- Title: Tags -->
      <TitleExtras :content="show" :sections="['tags']" />

      <!-- Title: Where to Watch -->
      <WhereToWatch :content-id="show._id" />
      <TitleExtras :content="show" :sections="['trailer']" />

      <!-- Title: Credits -->
      <StudioLinks :content="show" />
      <TitleExtras :content="show" :sections="['staff']" />
    </div>

    <JoinPrompt
      list-sync
      title="Track This Series"
      message="Sign up free to follow new episodes, log your progress, and rate every season."
    />
  </div>
</template>

<script setup lang="ts">
import { goBackOr, returnToListing } from '@/utils/navigation'
import { ref, computed, useTemplateRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useContentStore } from '@/stores/content'
import { useAuthStore } from '@/stores/auth'
import { contentAPI, getPosterUrl } from '@/services/api'
import WatchlistPanel from '@/components/WatchlistPanel.vue'
import AiringBadge from '@/components/AiringBadge.vue'
import EpisodeRow from '@/components/EpisodeRow.vue'
import EntityCastRow from '@/components/EntityCastRow.vue'
import StudioLinks from '@/components/StudioLinks.vue'
import TitleExtras from '@/components/TitleExtras.vue'
import FranchiseLink from '@/components/FranchiseLink.vue'
import MainStudio from '@/components/MainStudio.vue'
import FavoriteHeart from '@/components/FavoriteHeart.vue'
import DetailSection from '@/components/DetailSection.vue'
import ForumIcon from '@/components/ForumIcon.vue'
import { isTvmazeImage } from '@/utils/imageCredits'
import type {
  CatalogEntity,
  Episode,
  SeasonGuide,
  SeasonSummary,
  SeriesSeason,
  UnifiedContent,
} from '@/types/content'
import { useEntityStore } from '@/stores/entities'
import { getTotalVoteCount, getWeightedAverage } from '@/utils/ratings'
import { getDisplayTitle, getNativeTitle } from '@/utils/titles'
import { formatAiringStatus, isCurrentlyAiring, isUpcoming } from '@/utils/airing'
import { matchCharacterByName } from '@/utils/entities'
import {
  findRouteSeason,
  formatEpisodeIndex,
  formatSeasonLabel,
  seasonContent,
} from '@/utils/episodes'
import { hideBrokenImage } from '@/utils/posters'
import JoinPrompt from '@/components/JoinPrompt.vue'
import { usePageMeta } from '@/composables/usePageMeta'
import { useCanonicalSlug } from '@/composables/useCanonicalSlug'
import { detailPath } from '@/utils/slug'
import { titlePageMeta } from '@/utils/pageMeta'
import { openCalendarFile, shareLink } from '@/utils/nativeApp'
import WhereToWatch from '@/components/WhereToWatch.vue'
import { useToast } from 'vue-toastification'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const contentStore = useContentStore()
const authStore = useAuthStore()
const entityStore = useEntityStore()

const show = ref<UnifiedContent | null>(null)
const loading = ref(true)
const error = ref('')
const episodes = ref<Episode[]>([])
const episodesLoading = ref(false)
const characters = ref<CatalogEntity[]>([])
const charactersLoading = ref(false)
/** Details fetched on this page, by id (the route title, its show, and its seasons). */
const loaded = ref<Record<string, UnifiedContent>>({})
const seasons = ref<SeasonSummary[]>([])
/** Title the episodes and seasons belong to (differs from the route when it is one season). */
const seriesId = ref('')
const selectedSeason = ref<number | null>(null)
/** Episode open in the episode row; characters narrow to it. */
const selectedEpisode = ref<Episode | null>(null)
const episodeRow = useTemplateRef<InstanceType<typeof EpisodeRow>>('episodeRow')
let detailsRequestId = 0
let episodesRequestId = 0
let charactersRequestId = 0
let detailsForId = ''

/** One season only: the page stays on the series and never mentions seasons. */
const singleSeason = computed(() => seasons.value.length === 1)
const selectedSeasonInfo = computed(() =>
  singleSeason.value
    ? null
    : seasons.value.find((season) => season.seasonNumber === selectedSeason.value) || null,
)
/** Title whose details are on screen: the selected season's own title, else its show. */
const displayId = computed(() => {
  if (singleSeason.value) return seriesId.value
  const season = selectedSeasonInfo.value
  if (!season) return route.params.id as string
  return season.contentId || seriesId.value
})
const seasonLabel = computed(() =>
  seasons.value.length > 1 && selectedSeasonInfo.value
    ? formatSeasonLabel(selectedSeasonInfo.value)
    : '',
)

/** The series' season cards, on the series page and on each season's page (two or more). */
const seriesSeasons = computed(() => {
  const series = loaded.value[seriesId.value]
  const cards = series?.contentType === 'tv' ? series.seasons || [] : []
  return cards.length > 1 && !singleSeason.value ? cards : []
})
/**
 * Row the watchlist panel edits: the title on screen, or for a one-season series its
 * season's own row (only seasons are added to watchlists). A series already on the
 * list from before keeps its row.
 */
const watchlistTargetId = computed(() => {
  const id = show.value?._id || ''
  const seasonId = singleSeason.value ? seasons.value[0]?.contentId : undefined
  if (!seasonId || seasonId === id || contentStore.isInWatchlist(id)) return id
  return seasonId
})
/** Guide number of the first season, shown until another season is picked. */
const firstSeason = computed(() => seasons.value[0]?.seasonNumber ?? null)
/** Season pill names by guide number, for shows stored season by season. */
const seasonNames = computed(() =>
  seasons.value.some((season) => season.contentId)
    ? Object.fromEntries(seasons.value.map((season) => [season.seasonNumber, season.name]))
    : null,
)
/** The open episode's characters, matched from its cast; empty when none match. */
const episodeCharacters = computed(() => {
  const found = new Map<string, CatalogEntity>()
  for (const member of selectedEpisode.value?.cast || []) {
    const entity = matchCharacterByName(member.character, characters.value)
    if (entity) found.set(entity._id, entity)
  }
  return [...found.values()]
})
const shownCharacters = computed(() =>
  episodeCharacters.value.length ? episodeCharacters.value : characters.value,
)
/** "S1E3 · Title" for the open episode, when the characters narrowed to it. */
const episodeFocus = computed(() => {
  const episode = selectedEpisode.value
  if (!episode || !episodeCharacters.value.length) return ''
  const index = formatEpisodeIndex(episode, seasons.value.length > 1 && !seasonNames.value)
  return `${index} · ${episode.title}`
})
const WATCHLIST_STATUS_LABELS: Record<string, string> = {
  plan_to_watch: 'Planned',
  watching: 'Watching',
  completed: 'Completed',
  on_hold: 'On hold',
  dropped: 'Dropped',
}
const watchlistStatusLabel = (contentId: string) => {
  const item = contentStore.getWatchlistItem(contentId) as { status?: string } | undefined
  return WATCHLIST_STATUS_LABELS[item?.status || ''] || 'On your list'
}

const getDisplayScore = (content: UnifiedContent) => {
  const average = getWeightedAverage(content)
  return average != null ? average.toFixed(1) : 'N/A'
}

const getDisplayVoteCount = (content: UnifiedContent) => getTotalVoteCount(content)

const remember = (content: UnifiedContent) => {
  loaded.value = { ...loaded.value, [content._id]: content }
}

/**
 * Put a title's details in `loaded`: cached copy first, then the fresh API copy.
 * @returns False when the API failed and nothing was cached.
 */
const loadDetails = async (contentId: string) => {
  if (!contentId) return false
  const cached = loaded.value[contentId] || contentStore.findContentById(contentId)
  if (cached) remember(cached)
  try {
    const response = await contentAPI.getContentById(contentId)
    const fresh = response.data.data as UnifiedContent
    contentStore.cacheContent(fresh)
    remember(fresh)
    return true
  } catch (err) {
    if (!cached) throw err
    return true
  }
}

/**
 * A season's own title with the overview, genres, and studios it lacks taken from
 * its series (season rows often carry only dates, counts, and scores).
 */
const withSeriesDetails = (title: UnifiedContent): UnifiedContent => {
  const series = loaded.value[seriesId.value]
  if (!series || title._id === series._id) return title
  const filled = (own?: unknown[]) => !!own?.length
  return {
    ...title,
    overview: title.overview || series.overview,
    genres: filled(title.genres) ? title.genres : series.genres,
    studios: filled(title.studios) ? title.studios : series.studios,
    studioEntities: filled(title.studioEntities) ? title.studioEntities : series.studioEntities,
    animationStudios: filled(title.animationStudios)
      ? title.animationStudios
      : series.animationStudios,
  }
}

/**
 * Show the details for the selected season. Until that title's details
 * arrive, the previous ones stay on screen.
 */
const renderShow = () => {
  const base = loaded.value[displayId.value]
  if (!base) return
  const season = selectedSeasonInfo.value
  const latest = seasons.value[seasons.value.length - 1]
  show.value =
    season && !season.contentId
      ? seasonContent(base, season, season === latest)
      : withSeriesDetails(base)
  contentStore.cacheContent(base, true)
}

watch([loaded, displayId, selectedSeasonInfo], renderShow)

let seasonPillClicked = false

const loadShow = async (showId: string) => {
  if (!showId) {
    error.value = 'No series ID provided'
    loading.value = false
    return
  }

  const fromPill = seasonPillClicked
  seasonPillClicked = false
  const season = findRouteSeason(seasons.value, showId, route.query.season, seriesId.value)
  if (season) {
    selectedSeason.value = season.seasonNumber
    if (!fromPill) contentStore.scrollToTop()
    loadDetails(displayId.value).catch((err) => console.error('Failed to load season:', err))
    return
  }
  // The series route with no season picked shows its first season; nothing new to fetch.
  if (showId === seriesId.value && seasons.value.length && loaded.value[showId]) {
    selectedSeason.value = firstSeason.value
    if (!fromPill) contentStore.scrollToTop()
    return
  }

  const requestId = ++detailsRequestId
  error.value = ''
  show.value = null
  seasons.value = []
  seriesId.value = showId
  selectedSeason.value = null
  episodes.value = []
  renderShow()
  contentStore.scrollToTop()
  fetchEpisodes(showId)

  loading.value = !loaded.value[showId] && !contentStore.findContentById(showId)
  try {
    await loadDetails(showId)
  } catch (err) {
    if (requestId !== detailsRequestId) return
    error.value = err instanceof Error ? err.message : 'Failed to load series'
  } finally {
    if (requestId === detailsRequestId) loading.value = false
  }
}

/**
 * Season pick (card or pill). The page stays and shows that season: on its own
 * page nothing moves, otherwise the series route gets `?season=N`.
 */
const selectSeason = (seasonNumber: number) => {
  const season = seasons.value.find((item) => item.seasonNumber === seasonNumber)
  if (!season) {
    selectedSeason.value = seasonNumber
    return
  }
  const own = !!season.contentId && season.contentId === route.params.id
  const id = own ? (route.params.id as string) : seriesId.value
  const query = { ...route.query }
  delete query.season
  if (!own) query.season = String(seasonNumber)
  if (id === route.params.id && query.season === route.query.season) {
    selectedSeason.value = seasonNumber
    return
  }
  seasonPillClicked = true
  void router.replace({ name: 'TVShowDetails', params: { id }, query })
}

/** Season card click: pick that season, or open its page if the guide lacks it. */
const selectSeasonCard = (card: SeriesSeason) => {
  const season = seasons.value.find((item) => item.contentId === card._id)
  if (season) {
    selectSeason(season.seasonNumber)
    return
  }
  void router.push(detailPath('/tv-show', card._id, card.title))
}

const goBack = () =>
  goBackOr(router, () => returnToListing(router, route.query.from as string, contentStore))

/** A next episode is scheduled (or aired within the last day), so a calendar file exists. */
const hasUpcomingEpisode = computed(() => {
  const next = show.value?.nextEpisodeAirDate
  return !!next && new Date(next).getTime() > Date.now() - 24 * 60 * 60 * 1000
})

/** Upcoming episodes as an .ics file: the next one, then weekly to the season's end. */
const addToCalendar = () => {
  if (!show.value) return
  openCalendarFile(`${window.location.origin}/api/content/${show.value._id}/calendar.ics`).catch(
    () => toast.error("Couldn't open the calendar file."),
  )
}

const shareShow = async () => {
  if (!show.value) return
  const result = await shareLink({
    title: getDisplayTitle(show.value),
    text: show.value.overview,
    url: window.location.href,
  })
  if (result === 'copied') toast.success('Link copied!')
  if (result === 'failed') toast.error("Couldn't share this page.")
}

const formatVotes = (count: number) =>
  new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(count)

const formatDate = (date: string | Date) => {
  if (!date) return 'N/A'
  const dateObj = typeof date === 'string' ? new Date(date) : date
  return dateObj.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

const fetchEpisodes = async (contentId: string) => {
  const requestId = ++episodesRequestId
  episodesLoading.value = true
  try {
    const response = await contentAPI.getContentEpisodes(contentId)
    if (requestId !== episodesRequestId) return
    const guide = (response.data as { data: SeasonGuide }).data
    episodes.value = guide.episodes || []
    seasons.value = guide.seasons || []
    seriesId.value = guide.seriesId || contentId
    const season =
      findRouteSeason(seasons.value, contentId, route.query.season, seriesId.value) ||
      seasons.value.find((item) => item.seasonNumber === guide.currentSeason)
    selectedSeason.value = season?.seasonNumber ?? firstSeason.value
    if (singleSeason.value) {
      // The lone season's own page shows as its series.
      if (contentId !== seriesId.value) {
        void router.replace({
          name: 'TVShowDetails',
          params: { id: seriesId.value },
          query: { ...route.query, season: undefined },
        })
      }
      loadDetails(seriesId.value).catch((err) => console.error('Failed to load series:', err))
    } else if (seasons.value.length) {
      // Every season and the series itself, so picks swap instantly and the cards show.
      const ids = new Set([
        seriesId.value,
        ...seasons.value.map((item) => item.contentId || seriesId.value),
      ])
      for (const id of ids) {
        loadDetails(id).catch((err) => console.error('Failed to load season details:', err))
      }
    }
  } catch (err) {
    if (requestId !== episodesRequestId) return
    console.error('Failed to fetch episodes:', err)
    episodes.value = []
    seasons.value = []
  } finally {
    if (requestId === episodesRequestId) {
      episodesLoading.value = false
    }
  }
}

const fetchCharacters = async (contentId: string) => {
  const requestId = ++charactersRequestId
  charactersLoading.value = true
  try {
    const data = await entityStore.getContentCharacters(contentId)
    if (requestId !== charactersRequestId) return
    characters.value = data
  } catch (err) {
    if (requestId !== charactersRequestId) return
    console.error('Failed to fetch characters:', err)
    characters.value = []
  } finally {
    if (requestId === charactersRequestId) {
      charactersLoading.value = false
    }
  }
}

// Characters follow the title on screen (a season's own title, or its show).
watch(
  displayId,
  (contentId) => {
    if (!contentId || contentId === detailsForId) return
    detailsForId = contentId
    characters.value = []
    fetchCharacters(contentId)
  },
  { immediate: true },
)

watch(
  () => [route.params.id as string, route.query.season] as const,
  ([showId]) => {
    void loadShow(showId)
  },
  { immediate: true },
)

watch(
  () => authStore.isAuthenticated,
  (isAuthenticated) => {
    if (isAuthenticated) {
      void contentStore.loadWatchlist()
    }
  },
  { immediate: true },
)

/**
 * Name of the title the URL points at (its slug), loaded or on screen. None while a
 * lone season's page is moving to its series, so the slug fix doesn't undo the move.
 */
const routeTitle = computed(() => {
  if (singleSeason.value && String(route.params.id) !== seriesId.value) return null
  const content = loaded.value[String(route.params.id)] || show.value
  return content ? getDisplayTitle(content) : null
})

usePageMeta(() =>
  show.value
    ? titlePageMeta(show.value, {
        path: detailPath('/tv-show', String(route.params.id), routeTitle.value),
        image: show.value.posterPath ? getPosterUrl(show.value.posterPath) : null,
        seasonLabel: seasonLabel.value,
      })
    : null,
)

useCanonicalSlug(routeTitle, () => (routeTitle.value ? String(route.params.id) : null))
</script>

<style scoped src="@/assets/styles/titleHeader.css"></style>

<style scoped>
.tv-details {
  min-height: 100vh;
  background: var(--bg-primary);
  color: var(--text-primary);
  padding: 2rem;
}

.image-credit {
  margin: -1rem 0 2rem;
  color: var(--text-muted);
  font-size: 0.8rem;
}

.image-credit a {
  color: var(--coral-primary);
}

.season-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 1rem;
}

.season-card {
  display: flex;
  flex-direction: column;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-primary);
  text-decoration: none;
  transition: border-color 0.2s ease;
}

.season-card {
  padding: 0;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.season-card:hover,
.season-card.active {
  border-color: var(--coral-primary);
}

.season-card.active {
  box-shadow: 0 0 0 2px var(--coral-primary);
}

.season-card img,
.season-card .no-poster {
  width: 100%;
  aspect-ratio: 2 / 3;
  object-fit: cover;
}

.season-card-info {
  padding: 0.6rem 0.7rem 0.75rem;
}

.season-card-label {
  font-weight: 600;
}

.season-card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  color: var(--text-muted);
  font-size: 0.85rem;
  margin-top: 0.2rem;
}

.season-airing,
.season-tracked {
  padding: 0 0.4rem;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  font-size: 0.75rem;
}

.season-airing {
  color: var(--coral-primary);
  border-color: var(--coral-primary);
}

.back-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  line-height: 1.15;
  gap: 0.5rem;
  margin-bottom: 2rem;
  padding: 0.5rem 1rem;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  width: fit-content;
}

.back-button:hover {
  background: var(--bg-hover);
  transform: translateX(-2px);
}

.loading,
.error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 50vh;
  text-align: center;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid var(--border-color);
  border-top: 4px solid var(--highlight-color);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 1rem;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.show-content {
  max-width: 1200px;
  margin: 0 auto;
}

.show-header {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 2rem;
  margin-bottom: 3rem;
}

.show-poster {
  position: relative;
}

.show-poster img {
  width: 100%;
  height: auto;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.no-poster {
  width: 100%;
  height: 450px;
  background: var(--bg-card);
  border: 2px dashed var(--border-color);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}

.btn-primary,
.btn-secondary,
.btn-outline {
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  line-height: 1;
  gap: 0.5rem;
  box-sizing: border-box;
  border: 2px solid transparent;
}

.btn-primary {
  background: var(--blend-color);
  color: white;
}

.btn-primary:hover {
  background: var(--purple-accent);
  transform: translateY(-2px);
}

.btn-secondary {
  background: var(--success-color);
  color: white;
}

.btn-secondary:hover {
  background: var(--success-color);
  opacity: 0.9;
}

.btn-outline {
  background: transparent;
  color: var(--text-primary);
  border-color: var(--border-color);
}

.btn-outline:hover {
  background: var(--bg-hover);
  border-color: var(--highlight-color);
}

.show-description p {
  margin: 0;
  font-size: 1.1rem;
  line-height: 1.6;
  color: var(--text-secondary);
}

.episode-focus {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.3rem 0.4rem 0.3rem 0.8rem;
  border: 1px solid var(--coral-primary);
  border-radius: 999px;
  color: var(--text-primary);
}

.focus-clear {
  padding: 0.2rem 0.7rem;
  border: 0;
  border-radius: 999px;
  background: var(--bg-hover);
  color: var(--text-primary);
  font: inherit;
  font-size: 0.85rem;
  cursor: pointer;
}

.focus-clear:hover {
  background: var(--coral-primary);
  color: var(--bg-primary);
}

.season-score {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

@media (max-width: 768px) {
  .tv-details {
    padding: 1rem;
  }

  .show-header {
    grid-template-columns: 1fr;
    gap: 1.5rem;
  }
}
</style>
