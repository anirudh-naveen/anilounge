<!--
  ForumTagPicker.vue — choose what a forum post is about (component).

  Search movies, series, specials, franchises, and characters by name and add up
  to TAGS_MAX tags. A series tag can be narrowed to one episode, picked from the
  series' episode list (the same one its page shows), to make an episode thread.
  v-model is the selected tag list.
-->
<template>
  <div class="tag-picker">
    <!-- Title: Selected -->
    <ul v-if="modelValue.length" class="tag-chips" data-testid="selected-tags">
      <li v-for="(tag, index) in modelValue" :key="`${tag.contentId}-${index}`" class="tag-chip">
        <span class="tag-chip-main">
          <span class="tag-kind">{{ KIND_LABELS[tag.kind] }}</span>
          {{ tagLabel(tag) }}
          <button
            type="button"
            class="tag-remove"
            :aria-label="`Remove ${tag.name}`"
            @click="remove(index)"
          >
            ×
          </button>
        </span>
        <!-- Title: Episode -->
        <span v-if="tag.kind === 'series'" class="tag-episode">
          <template v-if="tag.season === null">
            <button
              type="button"
              class="tag-episode-add"
              :disabled="guides[tag.contentId] === 'loading'"
              :data-testid="`episode-add-${index}`"
              @click="pickEpisode(index)"
            >
              {{ guides[tag.contentId] === 'loading' ? 'Loading episodes…' : '+ Episode' }}
            </button>
            <span
              v-if="guides[tag.contentId] === 'none'"
              class="social-meta"
              :data-testid="`episode-none-${index}`"
            >
              No episode list for this series.
            </span>
          </template>
          <template v-else>
            <select
              class="input tag-select"
              :value="tag.season"
              aria-label="Season"
              :data-testid="`episode-season-${index}`"
              @change="changeSeason(index, Number(($event.target as HTMLSelectElement).value))"
            >
              <option v-for="season in seasonsOf(tag.contentId)" :key="season" :value="season">
                {{ season === 0 ? 'Specials' : `Season ${season}` }}
              </option>
            </select>
            <select
              class="input tag-select episode-select"
              :value="tag.episode"
              aria-label="Episode"
              :data-testid="`episode-number-${index}`"
              @change="
                setEpisode(index, tag.season, Number(($event.target as HTMLSelectElement).value))
              "
            >
              <option
                v-for="ep in episodesOf(tag.contentId, tag.season)"
                :key="ep.episodeNumber"
                :value="ep.episodeNumber"
              >
                E{{ ep.episodeNumber }}<template v-if="ep.title"> · {{ ep.title }}</template>
              </option>
            </select>
            <button type="button" class="tag-episode-add" @click="setEpisode(index, null, null)">
              Whole series
            </button>
          </template>
        </span>
      </li>
    </ul>

    <!-- Title: Search -->
    <div v-if="modelValue.length < TAGS_MAX" class="tag-search">
      <input
        v-model="term"
        type="search"
        class="input"
        placeholder="Tag a title, franchise, or character"
        aria-label="Search for a tag"
        maxlength="80"
        data-testid="tag-search"
      />
      <ul v-if="results.length" class="tag-results" data-testid="tag-results">
        <li v-for="hit in results" :key="hit.contentId">
          <button type="button" class="tag-result" @click="add(hit)">
            <img
              v-if="hit.imagePath"
              :src="getPosterUrl(hit.imagePath)"
              alt=""
              class="tag-result-image"
              loading="lazy"
            />
            <span class="tag-result-body">
              <span class="tag-result-name">{{ hit.name }}</span>
              <span class="social-meta">
                {{ KIND_LABELS[hit.kind] }}<template v-if="hit.year"> · {{ hit.year }}</template>
              </span>
            </span>
          </button>
        </li>
      </ul>
      <p v-else-if="searched && term.trim().length >= 2 && !searching" class="social-meta">
        Nothing found.
      </p>
    </div>
    <p v-else class="social-meta">Up to {{ TAGS_MAX }} tags.</p>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { contentAPI, forumAPI, getPosterUrl } from '@/services/api'
import type { Episode } from '@/types/content'
import type { PostTag, TagSearchHit } from '@/types/forum'
import { KIND_LABELS, TAGS_MAX, tagLabel } from '@/utils/forum'

const SEARCH_DELAY_MS = 250

const props = defineProps<{ modelValue: PostTag[] }>()
const emit = defineEmits<{ 'update:modelValue': [tags: PostTag[]] }>()

const term = ref('')
const results = ref<TagSearchHit[]>([])
const searching = ref(false)
const searched = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
let seq = 0

/** Series id → its episodes, 'loading', or 'none' when it has no episode list. */
const guides = reactive<Record<string, Episode[] | 'loading' | 'none'>>({})

/** Fetch a series' episode list once. */
const loadGuide = async (seriesId: string) => {
  if (guides[seriesId]) return
  guides[seriesId] = 'loading'
  try {
    const response = await contentAPI.getContentEpisodes(seriesId)
    const episodes = (response.data.data?.episodes || []) as Episode[]
    guides[seriesId] = episodes.length ? episodes : 'none'
  } catch {
    guides[seriesId] = 'none'
  }
}

const episodeList = (seriesId: string) => {
  const guide = guides[seriesId]
  return Array.isArray(guide) ? guide : []
}

const seasonsOf = (seriesId: string) =>
  [...new Set(episodeList(seriesId).map((ep) => ep.seasonNumber))].sort((a, b) => a - b)

const episodesOf = (seriesId: string, season: number | null) =>
  episodeList(seriesId)
    .filter((ep) => ep.seasonNumber === season)
    .sort((a, b) => a.episodeNumber - b.episodeNumber)

/** Narrow a series tag to its first episode (loading the list first). */
const pickEpisode = async (index: number) => {
  const tag = props.modelValue[index]
  if (!tag) return
  await loadGuide(tag.contentId)
  const season = seasonsOf(tag.contentId).find((n) => n > 0) ?? seasonsOf(tag.contentId)[0]
  if (season === undefined) return
  setEpisode(index, season, episodesOf(tag.contentId, season)[0]?.episodeNumber ?? null)
}

const changeSeason = (index: number, season: number) => {
  const tag = props.modelValue[index]
  if (!tag) return
  setEpisode(index, season, episodesOf(tag.contentId, season)[0]?.episodeNumber ?? null)
}

const update = (tags: PostTag[]) => emit('update:modelValue', tags)

const add = (hit: TagSearchHit) => {
  const exists = props.modelValue.some(
    (tag) => tag.contentId === hit.contentId && tag.season === null,
  )
  if (!exists) {
    update([
      ...props.modelValue,
      {
        contentId: hit.contentId,
        kind: hit.kind,
        name: hit.name,
        imagePath: hit.imagePath,
        season: null,
        episode: null,
      },
    ])
  }
  term.value = ''
}

const remove = (index: number) => update(props.modelValue.filter((_, i) => i !== index))

const setEpisode = (index: number, season: number | null, episode: number | null) => {
  update(
    props.modelValue.map((tag, i) =>
      i === index ? { ...tag, season, episode: season === null ? null : episode } : tag,
    ),
  )
}

watch(term, (value) => {
  clearTimeout(timer)
  const q = value.trim()
  if (q.length < 2) {
    seq += 1
    results.value = []
    searched.value = false
    return
  }
  timer = setTimeout(async () => {
    const mine = ++seq
    searching.value = true
    try {
      const response = await forumAPI.searchTags(q)
      if (mine === seq) results.value = response.data.data as TagSearchHit[]
    } catch {
      if (mine === seq) results.value = []
    } finally {
      if (mine === seq) {
        searching.value = false
        searched.value = true
      }
    }
  }, SEARCH_DELAY_MS)
})

// Editing a post that already has episode tags: load their lists for the dropdowns.
onMounted(() => {
  for (const tag of props.modelValue) {
    if (tag.kind === 'series' && tag.season !== null) loadGuide(tag.contentId)
  }
})

onUnmounted(() => clearTimeout(timer))
</script>

<style scoped>
.tag-picker {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.tag-chips {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  list-style: none;
  margin: 0;
  padding: 0;
}

.tag-chip {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.tag-chip-main {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.25rem 0.35rem 0.25rem 0.65rem;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-secondary);
  font-size: 0.88rem;
  color: var(--text-primary);
}

.tag-kind {
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.tag-remove {
  width: 1.4rem;
  height: 1.4rem;
  border: 0;
  border-radius: 50%;
  background: none;
  color: var(--text-secondary);
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
}

.tag-remove:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.tag-episode {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.tag-select {
  width: auto;
  max-width: 100%;
  padding: 0.25rem 0.4rem;
}

.episode-select {
  max-width: 16rem;
}

.tag-episode-add {
  border: 0;
  background: none;
  font: inherit;
  font-size: 0.82rem;
  color: var(--coral-deep);
  cursor: pointer;
}

.tag-search {
  position: relative;
}

.tag-results {
  list-style: none;
  margin: 0.35rem 0 0;
  padding: 0.3rem;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
  box-shadow: var(--shadow-md);
  max-height: 280px;
  overflow-y: auto;
}

.tag-result {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  padding: 0.4rem 0.5rem;
  border: 0;
  border-radius: 8px;
  background: none;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.tag-result:hover {
  background: var(--bg-hover);
}

.tag-result-image {
  width: 28px;
  height: 40px;
  object-fit: cover;
  border-radius: 4px;
  flex-shrink: 0;
}

.tag-result-body {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.tag-result-name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
