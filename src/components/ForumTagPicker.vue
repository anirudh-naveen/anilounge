<!--
  ForumTagPicker.vue — choose what a forum post is about (component).

  Search movies, series, specials, franchises, and characters by name and add up
  to TAGS_MAX tags. Results float in a grouped panel (franchises, titles,
  characters) driven by arrow keys / Enter / Esc. Title results expand to list their characters, main cast
  first. A series tag can be narrowed to one episode, picked from the series'
  episode list (the same one its page shows), to make an episode thread.
  The star on a chip makes it the post's top tag (one at most). v-model is the
  selected tag list, kept in hierarchy order (franchise, titles, characters).
-->
<template>
  <div class="tag-picker">
    <!-- Title: Selected -->
    <ul v-if="modelValue.length" class="tag-chips" data-testid="selected-tags">
      <li v-for="(tag, index) in modelValue" :key="`${tag.contentId}-${index}`" class="tag-chip">
        <span class="tag-chip-main" :class="{ top: tag.top }">
          <button
            type="button"
            class="tag-top"
            :aria-pressed="!!tag.top"
            :aria-label="tag.top ? `Unset ${tag.name} as top tag` : `Make ${tag.name} the top tag`"
            :title="tag.top ? 'Top tag (click to unset)' : 'Make this the top tag'"
            :data-testid="`tag-top-${index}`"
            @click="toggleTop(index)"
          >
            <ForumIcon name="star" :filled="!!tag.top" />
          </button>
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

    <p v-if="modelValue.length" class="social-meta tag-hint" data-testid="tag-top-hint">
      ★ marks your top tag: it's highlighted on the post and its picture shows with it.
    </p>

    <!-- Title: Search -->
    <div
      v-if="modelValue.length < TAGS_MAX"
      ref="searchRoot"
      class="tag-search"
      @focusout="onFocusOut"
      @keydown="onKeydown"
    >
      <div class="tag-search-field" :class="{ open: panelOpen }">
        <svg class="tag-search-icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          ref="input"
          v-model="term"
          type="text"
          class="tag-search-input"
          placeholder="Tag a title, franchise, or character"
          aria-label="Search for a tag"
          role="combobox"
          autocomplete="off"
          :aria-expanded="panelOpen"
          aria-controls="tag-results"
          :aria-activedescendant="activeKey ? optionId(activeKey) : undefined"
          maxlength="80"
          data-testid="tag-search"
          @focus="open = true"
        />
        <span v-if="searching" class="tag-search-spinner" aria-hidden="true"></span>
        <button
          v-else-if="term"
          type="button"
          class="tag-search-clear"
          aria-label="Clear search"
          @click="clearSearch"
        >
          ×
        </button>
      </div>

      <div v-if="panelOpen" class="tag-panel">
        <ul
          v-if="results.length"
          id="tag-results"
          class="tag-results"
          role="listbox"
          data-testid="tag-results"
        >
          <template v-for="group in groups" :key="group.label">
            <li class="tag-group" role="presentation">{{ group.label }}</li>
            <li v-for="hit in group.hits" :key="hit.contentId" role="presentation">
              <div class="tag-row" :class="{ active: activeKey === hit.contentId }">
                <button
                  :id="optionId(hit.contentId)"
                  type="button"
                  class="tag-result"
                  role="option"
                  :aria-selected="activeKey === hit.contentId"
                  :class="{ added: isAdded(hit.contentId) }"
                  tabindex="-1"
                  @mouseenter="activeKey = hit.contentId"
                  @click="add(hit)"
                >
                  <img
                    v-if="hit.imagePath"
                    :src="getPosterUrl(hit.imagePath)"
                    alt=""
                    class="tag-thumb"
                    loading="lazy"
                  />
                  <span v-else class="tag-thumb placeholder" aria-hidden="true">
                    {{ hit.name.charAt(0) }}
                  </span>
                  <span class="tag-result-body">
                    <span class="tag-result-name">{{ hit.name }}</span>
                    <span class="tag-result-meta">{{ hitMeta(hit) }}</span>
                  </span>
                  <span v-if="isAdded(hit.contentId)" class="tag-added">Added</span>
                </button>
                <!-- Title: Characters Toggle -->
                <button
                  v-if="REVIEWABLE_KINDS.includes(hit.kind)"
                  type="button"
                  class="tag-expand"
                  tabindex="-1"
                  :aria-expanded="expanded === hit.contentId"
                  :aria-label="`Characters in ${hit.name}`"
                  :title="`Characters in ${hit.name}`"
                  :data-testid="`characters-toggle-${hit.contentId}`"
                  @click="toggleCharacters(hit.contentId)"
                >
                  Cast
                  <svg class="tag-chevron" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
              </div>
              <!-- Title: Characters -->
              <div
                v-if="expanded === hit.contentId"
                class="tag-characters"
                :data-testid="`characters-${hit.contentId}`"
              >
                <p v-if="characters[hit.contentId] === 'loading'" class="tag-panel-note">
                  Loading characters…
                </p>
                <p v-else-if="!characterList(hit.contentId).length" class="tag-panel-note">
                  No characters listed.
                </p>
                <ul v-else>
                  <li
                    v-for="person in characterList(hit.contentId)"
                    :key="person.contentId"
                    role="presentation"
                  >
                    <button
                      :id="optionId(person.contentId)"
                      type="button"
                      class="tag-result character"
                      role="option"
                      :aria-selected="activeKey === person.contentId"
                      :class="{
                        added: isAdded(person.contentId),
                        active: activeKey === person.contentId,
                      }"
                      tabindex="-1"
                      @mouseenter="activeKey = person.contentId"
                      @click="add(person)"
                    >
                      <img
                        v-if="person.imagePath"
                        :src="getPosterUrl(person.imagePath)"
                        alt=""
                        class="tag-thumb round"
                        loading="lazy"
                      />
                      <span v-else class="tag-thumb round placeholder" aria-hidden="true">
                        {{ person.name.charAt(0) }}
                      </span>
                      <span class="tag-result-body">
                        <span class="tag-result-name">{{ person.name }}</span>
                        <span class="tag-result-meta">Character · {{ person.role }}</span>
                      </span>
                      <span v-if="isAdded(person.contentId)" class="tag-added">Added</span>
                    </button>
                  </li>
                </ul>
              </div>
            </li>
          </template>
        </ul>
        <p v-else-if="searching" class="tag-panel-note">Searching…</p>
        <p v-else class="tag-panel-note">Nothing found for “{{ term.trim() }}”.</p>
        <p class="tag-panel-keys" aria-hidden="true">
          <kbd>↑</kbd><kbd>↓</kbd> move · <kbd>Enter</kbd> add · <kbd>Esc</kbd> close
        </p>
      </div>
    </div>
    <p v-else class="social-meta">Up to {{ TAGS_MAX }} tags.</p>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { contentAPI, forumAPI, getPosterUrl } from '@/services/api'
import type { Episode } from '@/types/content'
import type { CharacterHit, PostTag, TagSearchHit } from '@/types/forum'
import ForumIcon from '@/components/ForumIcon.vue'
import { KIND_LABELS, REVIEWABLE_KINDS, sortTags, TAGS_MAX, tagLabel } from '@/utils/forum'

const SEARCH_DELAY_MS = 250

const props = defineProps<{ modelValue: PostTag[] }>()
const emit = defineEmits<{ 'update:modelValue': [tags: PostTag[]] }>()

const term = ref('')
const results = ref<TagSearchHit[]>([])
const searching = ref(false)
const searched = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
let seq = 0

const searchRoot = ref<HTMLElement | null>(null)
const input = ref<HTMLInputElement | null>(null)
/** The results panel shows while the search has focus and a term long enough to search. */
const open = ref(false)
/** contentId of the keyboard/hover-highlighted option. */
const activeKey = ref<string | null>(null)

const panelOpen = computed(
  () => open.value && term.value.trim().length >= 2 && (searched.value || searching.value),
)

const GROUPS: { label: string; kinds: TagSearchHit['kind'][] }[] = [
  { label: 'Franchises', kinds: ['franchise'] },
  { label: 'Titles', kinds: ['series', 'season', 'movie', 'special'] },
  { label: 'Characters', kinds: ['character'] },
]

/** Results split into labelled groups, keeping the server's order within each. */
const groups = computed(() =>
  GROUPS.map((group) => ({
    label: group.label,
    hits: results.value.filter((hit) => group.kinds.includes(hit.kind)),
  })).filter((group) => group.hits.length),
)

/** Options in display order (expanded characters follow their title), for arrow keys. */
const options = computed(() =>
  groups.value.flatMap((group) =>
    group.hits.flatMap((hit) => [
      { key: hit.contentId, item: hit as TagSearchHit | CharacterHit },
      ...(expanded.value === hit.contentId
        ? characterList(hit.contentId).map((person) => ({ key: person.contentId, item: person }))
        : []),
    ]),
  ),
)

const optionId = (key: string) => `tag-option-${key}`

const hitMeta = (hit: TagSearchHit) => {
  const parts: string[] = [KIND_LABELS[hit.kind]]
  if (hit.year) parts.push(String(hit.year))
  if (hit.kind === 'series' && hit.seasonCount && hit.seasonCount > 1) {
    parts.push(`${hit.seasonCount} seasons`)
  } else if (hit.episodeCount) {
    parts.push(`${hit.episodeCount} ep${hit.episodeCount === 1 ? '' : 's'}`)
  }
  return parts.join(' · ')
}

const isAdded = (contentId: string) =>
  props.modelValue.some((tag) => tag.contentId === contentId && tag.season === null)

const clearSearch = () => {
  term.value = ''
  input.value?.focus()
}

const moveActive = (step: number) => {
  const list = options.value
  if (!list.length) return
  const at = list.findIndex((option) => option.key === activeKey.value)
  const next =
    at === -1 ? (step > 0 ? 0 : list.length - 1) : (at + step + list.length) % list.length
  activeKey.value = list[next]!.key
  nextTick(() =>
    document.getElementById(optionId(activeKey.value!))?.scrollIntoView({ block: 'nearest' }),
  )
}

const onKeydown = (event: KeyboardEvent) => {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    if (!panelOpen.value) {
      open.value = true
      return
    }
    event.preventDefault()
    moveActive(event.key === 'ArrowDown' ? 1 : -1)
  } else if (event.key === 'Enter' && panelOpen.value) {
    // Never submit the post from the tag search.
    event.preventDefault()
    const option = options.value.find((o) => o.key === activeKey.value) ?? options.value[0]
    if (option) add(option.item)
  } else if (event.key === 'ArrowRight' && activeKey.value && panelOpen.value) {
    const hit = results.value.find((h) => h.contentId === activeKey.value)
    if (hit && REVIEWABLE_KINDS.includes(hit.kind) && expanded.value !== hit.contentId) {
      event.preventDefault()
      toggleCharacters(hit.contentId)
    }
  } else if (event.key === 'Escape' && panelOpen.value) {
    event.preventDefault()
    event.stopPropagation()
    open.value = false
  }
}

/** Close the panel once focus leaves the search entirely. */
const onFocusOut = (event: FocusEvent) => {
  const next = event.relatedTarget as Node | null
  if (!next || !searchRoot.value?.contains(next)) open.value = false
}

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

/** Emit tags kept in hierarchy order: franchise, titles, characters. */
const update = (tags: PostTag[]) => emit('update:modelValue', sortTags(tags))

/** Title id → its characters (or 'loading'), for the expandable list under a result. */
const characters = reactive<Record<string, CharacterHit[] | 'loading'>>({})
const expanded = ref<string | null>(null)

const characterList = (contentId: string) => {
  const list = characters[contentId]
  return Array.isArray(list) ? list : []
}

const toggleCharacters = async (contentId: string) => {
  expanded.value = expanded.value === contentId ? null : contentId
  if (expanded.value !== contentId || characters[contentId]) return
  characters[contentId] = 'loading'
  try {
    const response = await forumAPI.contentCharacters(contentId)
    characters[contentId] = response.data.data as CharacterHit[]
  } catch {
    characters[contentId] = []
  }
}

const add = (hit: TagSearchHit | CharacterHit) => {
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
  // Clear the search unless the user is picking several characters from one title.
  if (hit.kind !== 'character' || !expanded.value) term.value = ''
  input.value?.focus()
}

/** Make one tag the top tag (or unset it); only one can be top. */
const toggleTop = (index: number) => {
  update(props.modelValue.map((tag, i) => ({ ...tag, top: i === index ? !tag.top : false })))
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
  activeKey.value = null
  if (q.length < 2) {
    seq += 1
    results.value = []
    searched.value = false
    searching.value = false
    expanded.value = null
    return
  }
  open.value = true
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

.tag-top {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  margin-left: -0.35rem;
  border: 0;
  border-radius: 50%;
  background: none;
  color: var(--text-muted);
  font-size: 0.95rem;
  cursor: pointer;
}

.tag-top:hover {
  background: var(--bg-hover);
  color: var(--coral-primary);
}

.tag-top[aria-pressed='true'] {
  color: var(--coral-primary);
}

.tag-chip-main.top {
  border-color: color-mix(in srgb, var(--coral-primary) 55%, transparent);
  background: color-mix(in srgb, var(--coral-primary) 10%, transparent);
}

.tag-hint {
  margin: 0;
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

.tag-search-field {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0 0.75rem 0 0.9rem;
  background: var(--bg-parchment);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.tag-search-field:focus-within {
  border-color: var(--highlight-color);
  box-shadow: 0 0 0 3px rgba(224, 122, 95, 0.22);
}

.tag-search-icon,
.tag-chevron {
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.tag-search-icon {
  color: var(--text-muted);
}

.tag-search-input {
  flex: 1;
  min-width: 0;
  padding: 0.7rem 0;
  border: 0;
  background: none;
  color: var(--text-primary);
  font: inherit;
  font-size: 1rem;
  outline: none;
}

.tag-search-input::placeholder {
  color: var(--text-muted);
}

.tag-search-clear {
  width: 1.5rem;
  height: 1.5rem;
  flex-shrink: 0;
  border: 0;
  border-radius: 50%;
  background: var(--bg-hover);
  color: var(--text-secondary);
  font-size: 1rem;
  cursor: pointer;
}

.tag-search-clear:hover {
  color: var(--text-primary);
}

.tag-search-spinner {
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
  border: 2px solid var(--border-color);
  border-top-color: var(--highlight-color);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

/* Floats over the form below instead of pushing it down. */
.tag-panel {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  z-index: 30;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

.tag-results {
  list-style: none;
  margin: 0;
  padding: 0.35rem;
  max-height: min(360px, 50vh);
  overflow-y: auto;
  overscroll-behavior: contain;
}

.tag-group {
  padding: 0.55rem 0.6rem 0.3rem;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.tag-group:not(:first-child) {
  margin-top: 0.25rem;
  border-top: 1px solid var(--border-color);
}

.tag-row {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding-right: 0.35rem;
  border-radius: 8px;
}

.tag-row.active,
.tag-result.character.active {
  background: var(--bg-hover);
}

.tag-result {
  flex: 1;
  min-width: 0;
  justify-content: flex-start;
  gap: 0.7rem;
  padding: 0.4rem 0.5rem;
  border: 0;
  border-radius: 8px;
  background: none;
  font: inherit;
  color: inherit;
  text-align: left;
  line-height: 1.3;
  cursor: pointer;
}

.tag-result.character {
  width: 100%;
}

.tag-result.added .tag-result-name {
  color: var(--text-secondary);
}

.tag-thumb {
  width: 30px;
  height: 42px;
  flex-shrink: 0;
  object-fit: cover;
  border-radius: 5px;
  background: var(--bg-secondary);
}

.tag-thumb.round {
  width: 32px;
  height: 32px;
  border-radius: 50%;
}

.tag-thumb.placeholder {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
}

.tag-result-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.15rem;
  min-width: 0;
}

.tag-result-name {
  max-width: 100%;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tag-result-meta {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.tag-added {
  flex-shrink: 0;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--coral-primary);
}

.tag-expand {
  flex-shrink: 0;
  gap: 0.2rem;
  padding: 0.3rem 0.5rem 0.3rem 0.65rem;
  border: 1px solid transparent;
  border-radius: 999px;
  background: none;
  font: inherit;
  font-size: 0.78rem;
  color: var(--text-muted);
  cursor: pointer;
}

.tag-expand:hover,
.tag-expand[aria-expanded='true'] {
  color: var(--text-primary);
  border-color: var(--border-color);
  background: var(--bg-card);
}

.tag-chevron {
  width: 0.85rem;
  height: 0.85rem;
  transition: transform 0.15s ease;
}

.tag-expand[aria-expanded='true'] .tag-chevron {
  transform: rotate(180deg);
}

.tag-characters {
  margin: 0.15rem 0 0.35rem 1.4rem;
  padding-left: 0.5rem;
  border-left: 2px solid var(--border-color);
}

.tag-characters ul {
  list-style: none;
  margin: 0;
  padding: 0;
}

.tag-panel-note {
  margin: 0;
  padding: 0.75rem 0.9rem;
  font-size: 0.88rem;
  color: var(--text-muted);
}

.tag-characters .tag-panel-note {
  padding: 0.4rem 0.5rem;
}

.tag-panel-keys {
  margin: 0;
  padding: 0.4rem 0.8rem;
  border-top: 1px solid var(--border-color);
  font-size: 0.72rem;
  color: var(--text-muted);
}

.tag-panel-keys kbd {
  display: inline-block;
  min-width: 1.2rem;
  margin-right: 0.15rem;
  padding: 0 0.25rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font: inherit;
  text-align: center;
}

@media (hover: none) {
  .tag-panel-keys {
    display: none;
  }
}
</style>
