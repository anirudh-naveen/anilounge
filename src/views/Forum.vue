<!-- eslint-disable vue/multi-word-component-names -->
<!--
  Forum.vue — forum post list (view).

  Discussions and reviews, searchable (`?q=`, matching titles, text, and tag
  names), filtered by type and by tag (a title, franchise, character, or one
  episode via `?tag=&season=&episode=`), sorted hot, new, top, or by latest
  activity. Signed-in users write posts in the inline composer,
  which starts with the current tag; `?compose=1` opens it (title pages link
  here to start a discussion) and `?compose=review` opens it as a review. All filters live in the query string.
-->
<template>
  <div class="social-page">
    <div class="social-container">
      <!-- Header -->
      <header class="social-intro forum-intro">
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
        <h2 class="social-panel-title">New post</h2>
        <ForumComposer
          :key="composeKey"
          :preset-tags="presetTags"
          :preset-kind="route.query.compose === 'review' ? 'review' : 'discussion'"
          @saved="onSaved"
          @cancel="closeComposer"
        />
      </section>

      <!-- Title: Search -->
      <div class="forum-search">
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

      <!-- Title: Controls -->
      <div class="forum-controls">
        <div class="kind-tabs" role="tablist" aria-label="Post type">
          <router-link
            v-for="option in KIND_FILTERS"
            :key="option.value"
            :to="withQuery({ kind: option.value || undefined, page: undefined })"
            class="kind-tab"
            :class="{ active: kindFilter === option.value }"
            role="tab"
            :aria-selected="kindFilter === option.value"
            :data-testid="`filter-${option.value || 'all'}`"
          >
            {{ option.label }}
          </router-link>
        </div>
        <label class="sort-select">
          <span class="social-meta">Sort</span>
          <select
            class="input"
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
        </label>
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
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter, type LocationQueryRaw } from 'vue-router'
import { useToast } from 'vue-toastification'
import ForumComposer from '@/components/ForumComposer.vue'
import ForumPostCard from '@/components/ForumPostCard.vue'
import PaginationNav from '@/components/PaginationNav.vue'
import { forumAPI, getPosterUrl } from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import type { ForumPost, PostKind, PostPage, PostSort, PostTag } from '@/types/forum'
import { KIND_LABELS, postRoute, tagLabel, tagRoute } from '@/utils/forum'
import { apiErrorMessage } from '@/utils/social'

defineOptions({ name: 'ForumPage' })

const KIND_FILTERS: { value: PostKind | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'discussion', label: 'Discussions' },
  { value: 'review', label: 'Reviews' },
]
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
const kindFilter = computed(() => {
  const kind = text(route.query.kind)
  return kind === 'discussion' || kind === 'review' ? kind : ''
})
const sort = computed<PostSort>(() => {
  const value = text(route.query.sort) as PostSort
  return SORT_OPTIONS.some((option) => option.value === value) ? value : 'hot'
})
const pageNumber = computed(() => Math.max(1, intOrNull(route.query.page) || 1))

const heading = computed(() => {
  if (kindFilter.value === 'review') return 'Reviews'
  if (kindFilter.value === 'discussion') return 'Discussions'
  return 'Forum'
})
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
  return about ? `Posts ${about}.` : 'Reviews, episode threads, and franchise talk from the lounge.'
})
const emptyCopy = computed(() => {
  if (query.value) return `No posts match “${query.value}”. Try other words.`
  return page.value?.tag
    ? 'No posts here yet. Start the conversation.'
    : 'No posts yet. Be the first to write one.'
})

/** Search box text; pushed to `?q=` after a pause so typing doesn't refetch per key. */
const searchTerm = ref(query.value)
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
      kind: kindFilter.value || undefined,
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
    kindFilter.value,
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

.sort-select {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.sort-select select {
  width: auto;
  padding: 0.35rem 0.6rem;
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
