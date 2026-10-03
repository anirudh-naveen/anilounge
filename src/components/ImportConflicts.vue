<!--
  ImportConflicts.vue — pick a version for imported titles that clash (component).

  A title clashes when the imported sites disagree about it, or the import disagrees
  with what's already on the watchlist. Nothing is written for it until the user picks
  a version here, one title at a time or for every title at once. Clashes are stored
  on the server, so leaving the page keeps them for later.
-->
<template>
  <div v-if="conflicts.length" class="import-conflicts" data-testid="import-conflicts">
    <div class="conflicts-header">
      <h4>
        {{ conflicts.length }} {{ conflicts.length === 1 ? 'title needs' : 'titles need' }} you
      </h4>
      <p>
        These came in differently from each site, or differently from what's already on your
        watchlist. Pick the version to keep.
      </p>
      <div class="bulk-actions">
        <button
          v-for="source in bulkSources"
          :key="source"
          type="button"
          class="bulk-btn"
          :disabled="saving"
          @click="useSourceForAll(source)"
        >
          Use {{ SOURCE_LABELS[source] }} for all
        </button>
        <button type="button" class="bulk-btn" :disabled="saving" @click="keepAll">
          Keep my watchlist for all
        </button>
      </div>
      <p v-if="errorMessage" class="conflicts-error" role="alert">{{ errorMessage }}</p>
    </div>

    <ul class="conflict-list">
      <li v-for="conflict in shown" :key="conflict.contentId" class="conflict">
        <div class="conflict-title">
          <img :src="getPosterUrl(conflict.posterPath)" alt="" @error="onPosterError" />
          <strong>{{ conflict.title }}</strong>
        </div>
        <div class="conflict-options" role="group" :aria-label="`Versions of ${conflict.title}`">
          <button
            v-for="option in conflict.options"
            :key="option.key"
            type="button"
            class="option-card"
            :disabled="saving"
            @click="choose(conflict, option.key)"
          >
            <span class="option-source">{{ sourceNames(option.sources) }}</span>
            <span class="option-detail">{{ describe(option, conflict.episodeCount) }}</span>
          </button>
          <button
            type="button"
            class="option-card keep"
            :disabled="saving"
            @click="choose(conflict, 'keep')"
          >
            <span class="option-source">{{ conflict.current ? 'Keep mine' : "Don't add" }}</span>
            <span class="option-detail">
              {{
                conflict.current
                  ? describe(conflict.current, conflict.episodeCount)
                  : 'Leave it off my watchlist'
              }}
            </span>
          </button>
        </div>
      </li>
    </ul>
    <button
      v-if="conflicts.length > shown.length"
      type="button"
      class="show-more"
      @click="limit += PAGE_SIZE"
    >
      Show {{ Math.min(PAGE_SIZE, conflicts.length - shown.length) }} more
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { getPosterUrl, watchlistImportAPI } from '@/services/api'
import { getWatchlistStatusLabel } from '@/utils/watchlist'
import type { ImportConflict, WatchlistImportSource } from '@/types'

const emit = defineEmits<{ resolved: []; loaded: [count: number] }>()

const SOURCE_LABELS: Record<WatchlistImportSource, string> = {
  anilist: 'AniList',
  mal: 'MyAnimeList',
  mal_file: 'MyAnimeList',
  tmdb: 'TMDB',
}
const PAGE_SIZE = 20

const conflicts = ref<ImportConflict[]>([])
const saving = ref(false)
const errorMessage = ref('')
const limit = ref(PAGE_SIZE)

const shown = computed(() => conflicts.value.slice(0, limit.value))

/** Sites that appear in at least one clash, in import order. */
const bulkSources = computed(() => {
  const present = new Set(conflicts.value.flatMap((c) => c.options.flatMap((o) => o.sources)))
  return (['anilist', 'mal', 'tmdb'] as const).filter((source) => present.has(source))
})

const sourceNames = (sources: WatchlistImportSource[]) =>
  [...new Set(sources.map((source) => SOURCE_LABELS[source]))].join(' + ')

const describe = (
  version: { status: string; currentEpisode: number; score: number | null },
  episodeCount: number | null,
) => {
  const parts = [getWatchlistStatusLabel(version.status)]
  if (version.currentEpisode || episodeCount) {
    parts.push(`${version.currentEpisode}/${episodeCount || '?'} eps`)
  }
  parts.push(version.score ? `${version.score}/10` : 'unrated')
  return parts.join(' · ')
}

const onPosterError = (event: Event) => {
  ;(event.target as HTMLImageElement).src = '/placeholder-movie.jpg'
}

const load = async () => {
  try {
    const response = await watchlistImportAPI.conflicts()
    conflicts.value = response.data.data || []
  } catch {
    conflicts.value = []
  }
  emit('loaded', conflicts.value.length)
}

const submit = async (choices: { contentId: string; choice: string }[]) => {
  if (!choices.length) return
  saving.value = true
  errorMessage.value = ''
  try {
    await watchlistImportAPI.resolveConflicts(choices)
    const settled = new Set(choices.map((item) => item.contentId))
    conflicts.value = conflicts.value.filter((c) => !settled.has(c.contentId))
    emit('resolved')
  } catch (error) {
    const data = (error as { response?: { data?: { message?: string } } })?.response?.data
    errorMessage.value = data?.message || "Couldn't save that. Try again."
  } finally {
    saving.value = false
  }
}

const choose = (conflict: ImportConflict, choice: string) =>
  submit([{ contentId: conflict.contentId, choice }])

/** Each clash that has a version from `source` takes it; the rest wait. */
const useSourceForAll = (source: WatchlistImportSource) =>
  submit(
    conflicts.value.flatMap((conflict) => {
      const option = conflict.options.find((o) => o.sources.includes(source))
      return option ? [{ contentId: conflict.contentId, choice: option.key }] : []
    }),
  )

const keepAll = () =>
  submit(conflicts.value.map((conflict) => ({ contentId: conflict.contentId, choice: 'keep' })))

defineExpose({ load })

onMounted(load)
</script>

<style scoped>
.import-conflicts {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-top: 1.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--border-subtle, var(--border-color));
}

.conflicts-header h4 {
  margin: 0 0 0.35rem;
  font-size: 1.05rem;
  color: var(--text-primary);
}

.conflicts-header p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.9rem;
  line-height: 1.5;
}

.bulk-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.85rem;
}

.bulk-btn {
  padding: 0.45rem 0.9rem;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-card);
  color: var(--text-primary);
  font: inherit;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background 0.15s ease;
}

.bulk-btn:hover:not(:disabled) {
  border-color: var(--coral-primary);
  background: var(--bg-hover);
}

.conflicts-error {
  margin-top: 0.75rem !important;
  color: var(--error-color) !important;
}

.conflict-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.conflict {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.85rem;
  border: 1px solid var(--border-color);
  border-radius: 10px;
}

.conflict-title {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  color: var(--text-primary);
}

.conflict-title img {
  width: 34px;
  height: 50px;
  border-radius: 4px;
  object-fit: cover;
  flex-shrink: 0;
}

.conflict-options {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 0.5rem;
}

.option-card {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background 0.15s ease;
}

.option-card:hover:not(:disabled),
.option-card:focus-visible {
  outline: none;
  border-color: var(--coral-primary);
  background: var(--bg-hover);
}

.option-card.keep {
  border-style: dashed;
}

.option-source {
  font-weight: 600;
  font-size: 0.9rem;
}

.option-detail {
  color: var(--text-secondary);
  font-size: 0.82rem;
}

.show-more {
  align-self: center;
  padding: 0.4rem 1rem;
  border: none;
  background: none;
  color: var(--coral-primary);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
</style>
