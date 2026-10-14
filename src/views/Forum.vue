<!-- eslint-disable vue/multi-word-component-names -->
<!--
  Forum.vue — forum post list (view).

  Discussions, reviews, guides, and articles, searchable (`?q=`, matching titles,
  text, and tag names), filtered by type and by tag (a title, franchise, character, or one
  episode via `?tag=&season=&episode=`), sorted hot, new, top, or by latest
  activity. Signed-in users write posts in the inline composer,
  which starts with the current tag; `?compose=1` opens it (title pages link
  here to start a discussion) and `?compose=review` (or `guide`, `article`) opens it
  as that type. All filters live in the query string.
-->
<template>
  <div class="social-page" :class="{ 'is-app': isAppLayout }">
    <!-- App layout: search and New post live in the top bar -->
    <AppBar>
      <button
        v-if="!appSearchOpen"
        type="button"
        class="view-summary"
        data-testid="forum-view-summary"
        @click="filterSheetOpen = true"
      >
        {{ viewSummary }}
      </button>
      <span v-if="!appSearchOpen" class="app-bar-spacer"></span>
      <AppSearchToggle
        v-model="searchTerm"
        v-model:expanded="appSearchOpen"
        placeholder="Search the forum"
        maxlength="100"
        data-testid="forum-search"
      />
      <button
        v-if="!appSearchOpen && !composing"
        type="button"
        class="app-bar-button"
        aria-label="New post"
        data-testid="new-post"
        @click="openComposer"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" d="M12 5v14M5 12h14" />
        </svg>
      </button>
      <button
        v-if="!appSearchOpen"
        type="button"
        class="app-bar-button"
        :class="{ active: kinds.length > 0 || sort !== 'hot' }"
        aria-label="Filter and sort"
        data-testid="forum-filters-toggle"
        @click="filterSheetOpen = true"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9">
          <path stroke-linecap="round" d="M4 7h16M7 12h10M10 17h4" />
        </svg>
      </button>
    </AppBar>
    <AppSheet
      v-if="isAppLayout"
      v-model:open="filterSheetOpen"
      title="Filter & Sort"
      reset-label="Reset"
      :can-reset="kinds.length > 0 || sort !== 'hot'"
      @reset="router.push(withQuery({ kind: undefined, sort: undefined, page: undefined }))"
    >
      <AppSheetSection title="Type" :note="kinds.length ? '' : 'All'">
        <div class="sheet-chips" role="group" aria-label="Post type">
          <router-link
            v-for="option in KIND_FILTERS"
            :key="option.value"
            :to="kindLink(option.value)"
            class="sheet-chip"
            :class="{ active: isChipPicked(kinds, option.value) }"
            :aria-pressed="isChipPicked(kinds, option.value)"
            :data-testid="`sheet-filter-${option.value}`"
          >
            {{ option.label }}
          </router-link>
        </div>
      </AppSheetSection>
      <AppSheetSection title="Sort">
        <div class="sheet-chips" role="group" aria-label="Sort posts">
          <router-link
            v-for="option in SORT_OPTIONS"
            :key="option.value"
            :to="
              withQuery({
                sort: option.value === 'hot' ? undefined : option.value,
                page: undefined,
              })
            "
            class="sheet-chip"
            :class="{ active: sort === option.value }"
            :aria-current="sort === option.value ? 'true' : undefined"
          >
            {{ option.label }}
          </router-link>
        </div>
      </AppSheetSection>
    </AppSheet>

    <div class="social-container">
      <!-- Header -->
      <header v-if="!isAppLayout" class="social-intro forum-intro">
        <div>
          <p class="social-kicker">Community</p>
          <h1 class="social-title">{{ heading }}</h1>
          <p class="social-subtitle">{{ subtitle }}</p>
        </div>
        <button
          v-if="!composing"
          type="button"
          class="btn btn-primary"
          data-testid="new-post"
          @click="openComposer"
        >
          New post
        </button>
      </header>

      <!-- Title: Tag Filter -->
      <div v-if="page?.tag" class="tag-banner social-panel" data-testid="tag-banner">
        <img
          v-if="page.tag.imagePath"
          :src="getPosterUrl(page.tag.imagePath)"
          alt=""
          class="tag-banner-image"
        />
        <div class="tag-banner-body">
          <span class="social-meta">{{ KIND_LABELS[page.tag.kind] }}</span>
          <strong>{{ tagLabel({ ...page.tag, season, episode }) }}</strong>
          <span v-if="page.tag.kind === 'franchise'" class="social-meta">
            Includes posts about every title in the franchise.
          </span>
        </div>
        <div class="tag-banner-actions">
          <router-link
            v-if="page.tag.kind !== 'franchise'"
            :to="tagRoute(page.tag)"
            class="btn btn-ghost btn-small"
          >
            Open page
          </router-link>
          <router-link
            v-if="season !== null"
            :to="{ name: 'forum', query: { tag: page.tag.contentId } }"
            class="btn btn-ghost btn-small"
          >
            Whole series
          </router-link>
          <router-link :to="{ name: 'forum' }" class="btn btn-ghost btn-small">
            Clear filter
          </router-link>
        </div>
      </div>

      <!-- Title: Composer -->
      <section v-if="composing" class="social-panel composer-panel">
        <h2 class="social-panel-title">New Post</h2>
        <ForumComposer
          :key="composeKey"
          :preset-tags="presetTags"
          :preset-kind="composeKind"
          @saved="onSaved"
          @cancel="closeComposer"
        />
      </section>

      <!-- Title: Search -->
      <div v-if="!isAppLayout" class="forum-search">
        <input
          v-model="searchTerm"
          type="search"
          class="input"
          placeholder="Search posts, titles, and characters"
          aria-label="Search the forum"
          maxlength="100"
          data-testid="forum-search"
        />
      </div>

      <!-- Title: Controls (the app layout has them in a sheet) -->
      <div v-if="!isAppLayout" class="forum-controls">
        <div class="kind-tabs" role="group" aria-label="Post type">
          <span class="kind-label">
            Type<span v-if="!kinds.length" class="kind-all" data-testid="forum-kind-all">
              · All</span
            >
          </span>
          <router-link
            v-for="option in KIND_FILTERS"
            :key="option.value"
            :to="kindLink(option.value)"
            class="kind-tab"
            :class="{ active: isChipPicked(kinds, option.value) }"
            :aria-pressed="isChipPicked(kinds, option.value)"
            :data-testid="`filter-${option.value}`"
          >
            {{ option.label }}
          </router-link>
        </div>
        <div class="forum-sort">
          <label class="social-meta" for="forum-sort">Sort</label>
          <!-- Title: Sort (same pill as SortByControls, without a direction) -->
          <div class="sort-pill">
            <svg class="sort-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                stroke="currentColor"
                stroke-width="1.75"
                stroke-linecap="round"
                d="M4 7h16M7 12h10M10 17h4"
              />
            </svg>
            <select
              id="forum-sort"
              class="sort-select"
              :value="sort"
              data-testid="forum-sort"
              @change="
                router.push(
                  withQuery({ sort: ($event.target as HTMLSelectElement).value, page: undefined }),
                )
              "
            >
              <option v-for="option in SORT_OPTIONS" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
            <svg class="sort-chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                d="m7 10 5 5 5-5"
              />
            </svg>
          </div>
        </div>
      </div>

      <!-- Title: Posts -->
      <div v-if="loading && !page" class="social-loading"><div class="spinner"></div></div>
      <p v-else-if="error" class="social-empty">{{ error }}</p>
      <template v-else-if="page">
        <p v-if="!page.items.length" class="social-empty social-panel" data-testid="forum-empty">
          {{ emptyCopy }}
        </p>
        <div v-else class="post-list" :class="{ dim: loading }" data-testid="post-list">
          <ForumPostCard
            v-for="(post, index) in page.items"
            :key="post.id"
            :post="post"
            @update:post="(next) => page && (page.items[index] = next)"
          />
        </div>
        <PaginationNav
          :current-page="page.page"
          :total-pages="Math.ceil(page.total / page.pageSize)"
          @change="(next) => router.push(withQuery({ page: String(next) }))"
        />
      </template>
    </div>

    <JoinPrompt
      title="Join the Conversation"
      message="Sign up to write posts, reply to threads, and review what you've watched."
    />
  </div>
</template>

<script setup lang="ts">
import { isChipPicked, toggleChipOfAll } from '@/utils/filterChips'
import AppBar from '@/components/AppBar.vue'
import AppSearchToggle from '@/components/AppSearchToggle.vue'
import AppSheet from '@/components/AppSheet.vue'
import AppSheetSection from '@/components/AppSheetSection.vue'
import { isAppLayout } from '@/utils/nativeApp'
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter, type LocationQueryRaw } from 'vue-router'
import { useToast } from 'vue-toastification'
import ForumComposer from '@/components/ForumComposer.vue'
import ForumPostCard from '@/components/ForumPostCard.vue'
import JoinPrompt from '@/components/JoinPrompt.vue'
import PaginationNav from '@/components/PaginationNav.vue'
import { forumAPI, getPosterUrl } from '@/services/api'
import { usePageMeta } from '@/composables/usePageMeta'
import { useAuthStore } from '@/stores/auth'
import type { ForumPost, PostKind, PostPage, PostSort, PostTag } from '@/types/forum'
import {
  KIND_LABELS,
  POST_KIND_LABELS,
  POST_KINDS,
  postRoute,
  tagLabel,
  tagRoute,
} from '@/utils/forum'
import { apiErrorMessage } from '@/utils/social'

defineOptions({ name: 'ForumPage' })

/** Post-type chips: each toggles on its own, and all of them on is All (no chip). */
const KIND_FILTERS: { value: PostKind; label: string }[] = POST_KINDS.map((kind) => ({
  value: kind,
  label: `${POST_KIND_LABELS[kind]}s`,
}))
const isPostKind = (value: string): value is PostKind => (POST_KINDS as string[]).includes(value)
const SEARCH_DELAY_MS = 350
const SORT_OPTIONS: { value: PostSort; label: string }[] = [
  { value: 'hot', label: 'Hot' },
  { value: 'new', label: 'New' },
  { value: 'top', label: 'Top' },
  { value: 'active', label: 'Recently active' },
]

const route = useRoute()
const router = useRouter()
const toast = useToast()
const authStore = useAuthStore()

const page = ref<PostPage | null>(null)
const loading = ref(true)
const error = ref('')
const composing = ref(false)
let seq = 0

const text = (value: unknown) => (typeof value === 'string' ? value : '')
const intOrNull = (value: unknown) => {
  const n = Number(text(value))
  return text(value) !== '' && Number.isInteger(n) ? n : null
}

const tagId = computed(() => text(route.query.tag))
const season = computed(() => (tagId.value ? intOrNull(route.query.season) : null))
const episode = computed(() => (season.value !== null ? intOrNull(route.query.episode) : null))
/** Picked post types from `?kind=review,guide`; empty means every type (All). */
const kinds = computed<PostKind[]>(() => {
  const listed = text(route.query.kind).split(',')
  const picked = POST_KINDS.filter((kind) => listed.includes(kind))
  return picked.length === POST_KINDS.length ? [] : picked
})
/** The one picked type, when exactly one is (headings and links name it). */
const kindFilter = computed<PostKind | ''>(() => (kinds.value.length === 1 ? kinds.value[0]! : ''))
/** The list after toggling one type chip. */
const kindLink = (kind: PostKind) =>
  withQuery({
    kind: toggleChipOfAll(kinds.value, kind, POST_KINDS).join(',') || undefined,
    page: undefined,
  })
/** Type the composer starts as: `?compose=<kind>`, else discussion. */
const composeKind = computed<PostKind>(() => {
  const kind = text(route.query.compose)
  return isPostKind(kind) ? kind : 'discussion'
})
const sort = computed<PostSort>(() => {
  const value = text(route.query.sort) as PostSort
  return SORT_OPTIONS.some((option) => option.value === value) ? value : 'hot'
})
const pageNumber = computed(() => Math.max(1, intOrNull(route.query.page) || 1))

const heading = computed(() =>
  kindFilter.value ? `${POST_KIND_LABELS[kindFilter.value]}s` : 'Forum',
)
const query = computed(() => text(route.query.q).trim())
const subtitle = computed(() => {
  const about = page.value?.tag
    ? `about ${tagLabel({ ...page.value.tag, season: season.value, episode: episode.value })}`
    : ''
  if (query.value) {
    const count = page.value
      ? `${page.value.total} ${page.value.total === 1 ? 'post' : 'posts'}`
      : 'Posts'
    return `${count} matching “${query.value}”${about ? ` ${about}` : ''}.`
  }
  return about
    ? `Posts ${about}.`
    : 'Reviews, guides, episode threads, and franchise talk from the lounge.'
})
const emptyCopy = computed(() => {
  if (query.value) return `No posts match “${query.value}”. Try other words.`
  return page.value?.tag
    ? 'No posts here yet. Start the conversation.'
    : 'No posts yet. Be the first to write one.'
})

usePageMeta(() => {
  // Search results and later pages aren't pages of their own.
  const tag = page.value?.tag
  const path = tag
    ? `/forum?tag=${tag.contentId}`
    : kindFilter.value
      ? `/forum?kind=${kindFilter.value}`
      : '/forum'
  return {
    title: tag
      ? `${tagLabel({ ...tag, season: season.value, episode: episode.value })} · Forum`
      : heading.value,
    description: subtitle.value,
    path,
  }
})

/** Search box text; pushed to `?q=` after a pause so typing doesn't refetch per key. */
const searchTerm = ref(query.value)
/** App layout: the top bar's search field, open while it holds a search. */
const appSearchOpen = ref(Boolean(searchTerm.value))
const filterSheetOpen = ref(false)
/** The bar's summary of the list, e.g. "Reviews · Top". */
const viewSummary = computed(() => {
  const kind = !kinds.value.length
    ? 'All'
    : kindFilter.value
      ? `${POST_KIND_LABELS[kindFilter.value]}s`
      : `${kinds.value.length} types`
  const order = SORT_OPTIONS.find((option) => option.value === sort.value)?.label ?? ''
  return `${kind} · ${order}`
})
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(searchTerm, (value) => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    const q = value.trim()
    if (q !== query.value) router.replace(withQuery({ q: q || undefined, page: undefined }))
  }, SEARCH_DELAY_MS)
})
// Back/forward or a link changed the query: show it in the box.
watch(query, (value) => {
  if (value !== searchTerm.value.trim()) searchTerm.value = value
})
onUnmounted(() => clearTimeout(searchTimer))

/** Tags the composer starts with: the current filter, narrowed to its episode. */
const presetTags = computed<PostTag[]>(() =>
  page.value?.tag ? [{ ...page.value.tag, season: season.value, episode: episode.value }] : [],
)

/** Remount the composer once the tag loads so it starts with it. */
const composeKey = computed(
  () => `${page.value?.tag?.contentId || ''}-${route.query.compose || ''}`,
)

/** Current query with `changes` applied (undefined removes a key). */
const withQuery = (changes: Record<string, string | undefined>) => {
  const query: LocationQueryRaw = { ...route.query, ...changes }
  for (const key of Object.keys(query)) if (query[key] === undefined) delete query[key]
  delete query.compose
  return { name: 'forum', query }
}

const load = async () => {
  const mine = ++seq
  loading.value = true
  error.value = ''
  try {
    const response = await forumAPI.list({
      tag: tagId.value || undefined,
      season: season.value ?? undefined,
      episode: episode.value ?? undefined,
      kind: kinds.value.join(',') || undefined,
      q: query.value || undefined,
      sort: sort.value,
      page: pageNumber.value,
    })
    if (mine === seq) page.value = response.data.data as PostPage
  } catch (err) {
    if (mine === seq) error.value = apiErrorMessage(err, 'Could not load the forum.')
  } finally {
    if (mine === seq) loading.value = false
  }
}

const openComposer = () => {
  if (!authStore.isAuthenticated) {
    toast.info('Sign in to post in the forum.')
    router.push('/login')
    return
  }
  composing.value = true
}

const closeComposer = () => {
  composing.value = false
  if (route.query.compose) router.replace(withQuery({}))
}

const onSaved = (post: ForumPost) => {
  composing.value = false
  router.push(postRoute(post.id))
}

watch(
  () => [
    tagId.value,
    season.value,
    episode.value,
    kinds.value.join(','),
    sort.value,
    pageNumber.value,
    query.value,
  ],
  load,
  { immediate: true },
)

watch(
  () => route.query.compose,
  (value) => {
    if (value) openComposer()
  },
  { immediate: true },
)
</script>

<style scoped>
/* App layout: no page padding under the top bar. */
.social-page.is-app {
  min-height: 0;
  padding: 0;
}

.view-summary {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  height: 34px;
  padding: 0 0.9rem;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  color: #e8edf5;
  font: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}

.sheet-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.sheet-chip {
  padding: 0.4rem 0.85rem;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 0.85rem;
  font-weight: 600;
  text-decoration: none;
}

.sheet-chip.active {
  background: var(--coral-primary);
  border-color: var(--coral-primary);
  color: var(--text-on-accent);
}

/* One row of type tabs that scrolls sideways. */
.is-app .kind-tabs {
  flex-wrap: nowrap;
  overflow-x: auto;
  scrollbar-width: none;
}

.is-app .kind-label {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  margin-right: 0.25rem;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.kind-all {
  margin-left: 0.25rem;
  color: var(--coral-primary);
}

.kind-tab {
  flex-shrink: 0;
}

.forum-intro {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.tag-banner {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 1.25rem;
  padding: 1rem 1.25rem;
}

.tag-banner-image {
  width: 44px;
  height: 64px;
  object-fit: cover;
  border-radius: 8px;
}

.tag-banner-body {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  flex: 1;
  min-width: 0;
}

.tag-banner-body strong {
  font-size: 1.1rem;
}

.tag-banner-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.composer-panel {
  margin-bottom: 1.25rem;
}

.composer-panel .social-panel-title {
  margin-bottom: 1rem;
}

.forum-search {
  margin-bottom: 0.85rem;
}

.forum-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 1rem;
}

.kind-tabs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
}

.kind-tab {
  padding: 0.4rem 0.9rem;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--text-secondary);
  text-decoration: none;
}

.kind-tab.active {
  border-color: var(--coral-primary);
  background: var(--coral-primary);
  color: var(--text-on-accent);
}

.forum-sort {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.sort-pill {
  position: relative;
  display: flex;
  align-items: center;
  height: 36px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-card);
  box-shadow: 0 1px 2px rgba(21, 34, 56, 0.06);
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.sort-pill:hover {
  border-color: var(--border-hover);
}

.sort-pill:focus-within {
  border-color: var(--coral-primary);
  box-shadow: 0 0 0 3px rgba(224, 122, 95, 0.2);
}

.sort-icon,
.sort-chevron {
  position: absolute;
  width: 16px;
  height: 16px;
  color: var(--text-muted);
  pointer-events: none;
}

.sort-icon {
  left: 0.8rem;
}

.sort-chevron {
  right: 0.7rem;
}

.sort-select {
  height: 100%;
  padding: 0 2rem 0 2.3rem;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
}

.sort-select:focus {
  outline: none;
}

.sort-select option {
  background: var(--bg-card);
  color: var(--text-primary);
}

.post-list {
  display: grid;
  gap: 0.85rem;
  margin-bottom: 1.5rem;
  transition: opacity 0.2s ease;
}

.post-list.dim {
  opacity: 0.6;
}
</style>
