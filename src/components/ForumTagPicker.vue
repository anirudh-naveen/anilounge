<!--
  ForumTagPicker.vue — choose what a forum post is about (component).

  Search movies, series, specials, franchises, and characters by name and add up
  to TAGS_MAX tags. A series tag can be narrowed to one episode (season and
  episode number) to make an episode thread. v-model is the selected tag list.
-->
<template>
  <div class="tag-picker">
    <!-- Title: Selected -->
    <ul v-if="modelValue.length" class="tag-chips" data-testid="selected-tags">
      <li v-for="(tag, index) in modelValue" :key="tagKey(tag)" class="tag-chip">
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
              :data-testid="`episode-add-${index}`"
              @click="setEpisode(index, 1, 1)"
            >
              + Episode
            </button>
          </template>
          <template v-else>
            <label>
              S
              <input
                type="number"
                min="0"
                max="999"
                class="input tag-number"
                :value="tag.season"
                aria-label="Season number"
                :data-testid="`episode-season-${index}`"
                @input="setEpisode(index, numberFrom($event), tag.episode)"
              />
            </label>
            <label>
              E
              <input
                type="number"
                min="1"
                max="9999"
                class="input tag-number"
                :value="tag.episode"
                aria-label="Episode number"
                :data-testid="`episode-number-${index}`"
                @input="setEpisode(index, tag.season, numberFrom($event))"
              />
            </label>
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
import { onUnmounted, ref, watch } from 'vue'
import { forumAPI, getPosterUrl } from '@/services/api'
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

const tagKey = (tag: PostTag) => `${tag.contentId}-${tag.season}-${tag.episode}`

const numberFrom = (event: Event) => {
  const value = (event.target as HTMLInputElement).valueAsNumber
  return Number.isFinite(value) ? value : null
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
  align-items: center;
  gap: 0.4rem;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.tag-episode label {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.tag-number {
  width: 4.5rem;
  padding: 0.25rem 0.4rem;
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
