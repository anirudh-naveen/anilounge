<!-- eslint-disable vue/multi-word-component-names -->
<!--
  Home.vue — personal landing view.

  A status feed of the viewer's and friends' watchlist changes (or a sign-up
  prompt for guests), a release sidebar for watchlist titles that falls back
  to trending releases, the character of the day, and forum highlights (picked
  from the watchlist when signed in; the pick refreshes every few hours).
  Guests also get a "Join the Community" pop-up (`JoinPrompt`), and everyone a Ko-fi
  donation card (`SupportCard`) when a donation page is configured.
-->
<template>
  <div class="home-page">
    <section class="home-intro fade-in">
      <div class="container">
        <template v-if="authStore.isAuthenticated">
          <p class="kicker">Your lounge</p>
          <h1 class="home-title">
            Welcome back<span v-if="authStore.user?.username"
              >, <span class="gradient-text">{{ authStore.user.username }}</span></span
            >.
          </h1>
          <ImportReminder class="home-import-reminder" />
        </template>
        <template v-else>
          <h1 class="home-title">
            Welcome to the <span class="gradient-text">Animation Lounge.</span>
          </h1>
          <p class="home-subtitle">
            Find new favorites, record all you've watched, and connect with people across the globe.
          </p>
        </template>
      </div>
    </section>

    <div class="container home-layout">
      <div class="home-main">
        <!-- Status -->
        <section class="panel status-panel" data-testid="status-panel">
          <header class="panel-header">
            <div>
              <h2 class="panel-title">Status</h2>
              <p class="panel-sub">Latest watchlist changes from you and your friends.</p>
            </div>
            <div v-if="authStore.isAuthenticated" class="feed-tabs" role="tablist">
              <button
                v-for="tab in FEED_TABS"
                :key="tab.value"
                type="button"
                role="tab"
                class="feed-tab"
                :class="{ active: feedTab === tab.value }"
                :aria-selected="feedTab === tab.value"
                :data-testid="`feed-tab-${tab.value}`"
                @click="feedTab = tab.value"
              >
                {{ tab.label }}
              </button>
            </div>
          </header>

          <div v-if="!authStore.isAuthenticated" class="status-signup" data-testid="status-signup">
            <ul class="signup-preview" aria-hidden="true">
              <li v-for="n in 3" :key="n" class="preview-row">
                <span class="preview-poster"></span>
                <span class="preview-lines">
                  <span class="preview-line wide"></span>
                  <span class="preview-line"></span>
                </span>
              </li>
            </ul>
            <div class="signup-copy">
              <h3>Track what you watch</h3>
              <p>
                Create a free account to build your watchlist and see what you and your friends are
                watching.
              </p>
              <div class="signup-actions">
                <router-link to="/register" class="btn btn-primary">Register</router-link>
                <router-link to="/login" class="btn btn-secondary">Log in</router-link>
              </div>
            </div>
          </div>

          <div v-else-if="activityLoading" class="panel-loading">
            <div class="spinner"></div>
          </div>

          <ul v-else-if="visibleActivity.length" class="activity-list">
            <li
              v-for="entry in visibleActivity"
              :key="entry.id"
              class="activity-item"
              data-testid="activity-item"
            >
              <router-link :to="titleRoute(entry.content)" class="activity-poster">
                <img
                  :src="getPosterUrl(entry.content.posterPath)"
                  :alt="getDisplayTitle(entry.content)"
                  loading="lazy"
                  @error="handlePosterError"
                />
              </router-link>
              <div class="activity-body">
                <p class="activity-text">
                  <span class="activity-user">
                    {{ activitySubject(entry) }}
                  </span>
                  {{ describeActivity(entry) }}
                  <router-link :to="titleRoute(entry.content)" class="activity-title">
                    {{ getDisplayTitle(entry.content) }}
                  </router-link>
                </p>
                <p class="activity-meta">
                  <span class="status-chip" :class="`status-${entry.status}`">
                    {{ getWatchlistStatusLabel(entry.status) }}
                  </span>
                  <span v-if="entry.rating" class="activity-rating">★ {{ entry.rating }}/10</span>
                  <time :datetime="entry.at">{{ timeAgo(entry.at, now) }}</time>
                </p>
              </div>
            </li>
          </ul>

          <div v-else class="panel-empty" data-testid="activity-empty">
            <p>{{ emptyActivityCopy }}</p>
            <router-link v-if="feedTab !== 'friends'" to="/search" class="btn btn-secondary">
              Find something to watch
            </router-link>
          </div>
        </section>

        <!-- Character of the day -->
        <section
          v-if="characterLoading || character"
          class="panel character-bar"
          data-testid="character-of-the-day"
        >
          <div v-if="characterLoading" class="panel-loading">
            <div class="spinner"></div>
          </div>
          <template v-else-if="character">
            <router-link :to="characterRoute" class="character-portrait">
              <img
                v-if="character.imagePath"
                :src="getPosterUrl(character.imagePath)"
                :alt="character.name"
                referrerpolicy="no-referrer"
                @error="handlePortraitError"
              />
              <span v-else class="portrait-fallback" aria-hidden="true">
                {{ character.name.charAt(0) }}
              </span>
            </router-link>
            <div class="character-body">
              <p class="kicker">Character of the day</p>
              <h2 class="character-name">
                <router-link :to="characterRoute">{{ character.name }}</router-link>
              </h2>
              <p v-if="character.nativeName" class="character-native">{{ character.nativeName }}</p>
              <p v-if="characterBio" class="character-blurb">{{ characterBio }}</p>
              <div
                v-if="characterFranchiseNames.length"
                class="character-titles"
                data-testid="character-of-the-day-franchises"
              >
                <span class="titles-label">
                  {{ characterFranchiseNames.length === 1 ? 'Franchise' : 'Franchises' }}
                </span>
                <component
                  :is="characterFranchiseIds[name] ? 'router-link' : 'span'"
                  v-for="name in characterFranchiseNames"
                  :key="name"
                  :to="
                    characterFranchiseIds[name]
                      ? { name: 'FranchiseDetails', params: { id: characterFranchiseIds[name] } }
                      : undefined
                  "
                  class="franchise-chip"
                >
                  {{ name }}
                </component>
              </div>
              <div v-if="characterTitles.length" class="character-titles">
                <span class="titles-label">Appears in</span>
                <router-link
                  v-for="title in characterTitles"
                  :key="title._id"
                  :to="titleRoute(title)"
                  class="title-chip"
                >
                  {{ getDisplayTitle(title) }}
                </router-link>
              </div>
            </div>
          </template>
        </section>
      </div>

      <!-- Release updates -->
      <aside class="home-sidebar">
        <section class="panel updates-panel" data-testid="updates-panel">
          <header class="panel-header stacked">
            <h2 class="panel-title">{{ updatesTitle }}</h2>
            <p class="panel-sub">{{ updatesSubtitle }}</p>
          </header>

          <div v-if="updatesLoading" class="panel-loading">
            <div class="spinner"></div>
          </div>
          <template v-else-if="updates.items.length">
            <div v-for="group in updateGroups" :key="group.kind" class="update-group">
              <h3 class="group-title">{{ group.label }}</h3>
              <ul class="update-list">
                <li
                  v-for="item in group.items"
                  :key="item.content._id"
                  class="update-item"
                  data-testid="update-item"
                >
                  <router-link :to="titleRoute(item.content)" class="update-link">
                    <img
                      class="update-poster"
                      :src="getPosterUrl(item.content.posterPath)"
                      :alt="getDisplayTitle(item.content)"
                      loading="lazy"
                      @error="handlePosterError"
                    />
                    <span class="update-body">
                      <span class="update-title">{{ getDisplayTitle(item.content) }}</span>
                      <span class="update-when" :class="`when-${item.kind}`">
                        {{ releaseLabel(item, now) }}
                      </span>
                      <span v-if="item.via" class="update-via"
                        >Related to {{ item.via.title }}</span
                      >
                    </span>
                  </router-link>
                </li>
              </ul>
            </div>
          </template>
          <p v-else class="panel-empty">No releases to show right now.</p>
        </section>
      </aside>
    </div>

    <!-- Forum -->
    <section class="container forum-section">
      <div class="panel forum-panel" data-testid="forum-highlights-home">
        <header class="panel-header">
          <div>
            <h2 class="panel-title">Popular in the Forum</h2>
            <p class="panel-sub">{{ forumSubtitle }}</p>
          </div>
          <router-link to="/forum" class="btn btn-secondary btn-small">Visit the Forum</router-link>
        </header>
        <div v-if="forumLoading" class="panel-loading"><div class="spinner"></div></div>
        <div v-else-if="forum.items.length" class="forum-grid">
          <ForumPostCard
            v-for="(post, index) in forum.items"
            :key="post.id"
            :post="post"
            show-image
            @update:post="(next) => (forum.items[index] = next)"
          />
        </div>
        <p v-else class="panel-empty">
          No posts yet.
          <router-link :to="{ name: 'forum', query: { compose: '1' } }"
            >Start the first one</router-link
          >.
        </p>
      </div>
    </section>

    <!-- Donations -->
    <div class="container support-section">
      <SupportCard />
    </div>

    <JoinPrompt
      title="Join the Community"
      message="Sign up free to track what you watch, rate titles, and talk anime with the lounge."
    />
  </div>
</template>

<script setup lang="ts">
import { showPosterPlaceholder } from '@/utils/posters'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import ImportReminder from '@/components/ImportReminder.vue'
import ForumPostCard from '@/components/ForumPostCard.vue'
import JoinPrompt from '@/components/JoinPrompt.vue'
import SupportCard from '@/components/SupportCard.vue'
import { usePageMeta } from '@/composables/usePageMeta'
import { absoluteUrl } from '@/utils/pageMeta'
import { forumAPI, getDetailsRouteName, getPosterUrl, homeAPI } from '@/services/api'
import type { HomeForum } from '@/types/forum'
import type { CatalogEntity, EntityAppearance } from '@/types/content'
import type { ActivityFeed, ReleaseUpdate, ReleaseUpdates } from '@/types/home'
import { getDisplayTitle } from '@/utils/titles'
import { getWatchlistStatusLabel } from '@/utils/watchlist'
import { characterFranchiseIds as franchiseIdsOf, characterFranchises } from '@/utils/entities'
import {
  characterBlurb,
  activitySubject,
  describeActivity,
  mergeActivity,
  releaseLabel,
  timeAgo,
} from '@/utils/homeFeed'

type FeedTab = 'all' | 'you' | 'friends'
type AppearanceTitle = Exclude<EntityAppearance['content'], string | undefined>

const FEED_TABS: { value: FeedTab; label: string }[] = [
  { value: 'all', label: 'Everyone' },
  { value: 'you', label: 'You' },
  { value: 'friends', label: 'Friends' },
]

const authStore = useAuthStore()

const now = ref(new Date())
let clock: ReturnType<typeof setInterval> | undefined

const feedTab = ref<FeedTab>('all')
const activity = ref<ActivityFeed>({ personal: [], friends: [], friendCount: 0 })
const activityLoading = ref(false)

const updates = ref<ReleaseUpdates>({ source: 'trending', items: [] })
const updatesLoading = ref(true)

const character = ref<CatalogEntity | null>(null)
const characterLoading = ref(true)

const forum = ref<HomeForum>({ items: [], personalized: false, refreshesAt: '' })
const forumLoading = ref(true)
const forumSubtitle = computed(() =>
  forum.value.personalized
    ? 'Picked from your watchlist. Refreshes every few hours.'
    : 'Reviews, episode threads, and franchise talk from the lounge.',
)

const visibleActivity = computed(() => {
  if (feedTab.value === 'you') return activity.value.personal
  if (feedTab.value === 'friends') return activity.value.friends
  return mergeActivity(activity.value.personal, activity.value.friends)
})

const emptyActivityCopy = computed(() => {
  if (feedTab.value !== 'friends') {
    return "Nothing here yet. Add a title to your watchlist and it'll show up here."
  }
  if (!activity.value.friendCount) {
    return 'No friends yet. Add friends from the Friends page in your profile menu.'
  }
  return "Your friends haven't updated their watchlists yet."
})

const updatesTitle = computed(() => (updates.value.source === 'watchlist' ? 'Updates' : 'Trending'))

const updatesSubtitle = computed(() => {
  if (updates.value.source === 'watchlist')
    return 'New episodes and upcoming titles from your list.'
  if (authStore.isAuthenticated) return "Nothing new on your watchlist, so here's what's trending."
  return "What's airing and premiering soon."
})

const updateGroups = computed(() => {
  const groups: { kind: ReleaseUpdate['kind']; label: string; items: ReleaseUpdate[] }[] = [
    { kind: 'episode', label: 'New episodes', items: [] },
    { kind: 'premiere', label: 'Upcoming', items: [] },
  ]
  for (const item of updates.value.items) {
    groups.find((group) => group.kind === item.kind)?.items.push(item)
  }
  return groups.filter((group) => group.items.length)
})

const characterRoute = computed(() => ({
  name: 'CharacterDetails',
  params: { id: character.value?._id || '' },
  query: { from: '/' },
}))

const characterBio = computed(() => characterBlurb(character.value?.about))

const characterFranchiseNames = computed(() => characterFranchises(character.value))
const characterFranchiseIds = computed(() => franchiseIdsOf(character.value))

const characterTitles = computed(() => {
  const seen = new Set<string>()
  const titles: AppearanceTitle[] = []
  for (const row of character.value?.appearances || []) {
    const content = row.content
    if (!content || typeof content !== 'object' || seen.has(content._id)) continue
    seen.add(content._id)
    titles.push(content)
  }
  return titles.slice(0, 3)
})

const titleRoute = (content: { _id: string; contentType?: string }) => ({
  name: getDetailsRouteName({ contentType: content.contentType }),
  params: { id: content._id },
  query: { from: '/' },
})

const handlePosterError = showPosterPlaceholder

const handlePortraitError = (event: Event) => {
  ;(event.target as HTMLImageElement).style.visibility = 'hidden'
}

const loadActivity = async () => {
  if (!authStore.isAuthenticated) return
  activityLoading.value = true
  try {
    const response = await homeAPI.getActivity()
    activity.value = response.data.data as ActivityFeed
  } catch (error) {
    console.error('Error loading home activity:', error)
  } finally {
    activityLoading.value = false
  }
}

const loadUpdates = async () => {
  try {
    const response = await homeAPI.getUpdates()
    updates.value = response.data.data as ReleaseUpdates
  } catch (error) {
    console.error('Error loading release updates:', error)
  } finally {
    updatesLoading.value = false
  }
}

const loadCharacter = async () => {
  try {
    const response = await homeAPI.getCharacterOfTheDay()
    character.value = (response.data.data?.character as CatalogEntity) || null
  } catch (error) {
    console.error('Error loading character of the day:', error)
  } finally {
    characterLoading.value = false
  }
}

const loadForum = async () => {
  try {
    const response = await forumAPI.home()
    forum.value = response.data.data as HomeForum
  } catch (error) {
    console.error('Error loading forum highlights:', error)
  } finally {
    forumLoading.value = false
  }
}

onMounted(() => {
  window.scrollTo({ top: 0 })
  clock = setInterval(() => {
    now.value = new Date()
  }, 60 * 1000)
  loadActivity()
  loadUpdates()
  loadCharacter()
  loadForum()
})

onUnmounted(() => {
  if (clock) clearInterval(clock)
})

usePageMeta(() => ({
  title: 'Discover, track, and discuss anime',
  description:
    "Find new anime and animated films, track everything you've watched, and talk about it with fans around the world.",
  path: '/',
  jsonLd: {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'AniLounge',
    url: absoluteUrl('/'),
  },
}))
</script>

<style scoped>
.home-page {
  min-height: 100vh;
  padding-bottom: 4rem;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 20px;
}

.home-intro {
  padding: 3.5rem 0 2rem;
}

.kicker {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--coral-primary);
  margin: 0 0 0.5rem;
}

.home-title {
  font-family: var(--font-display);
  font-size: 2.75rem;
  font-weight: 650;
  line-height: 1.15;
  letter-spacing: -0.03em;
  color: var(--text-primary);
  margin: 0;
}

.gradient-text {
  background: linear-gradient(90deg, var(--coral-primary), var(--gold-accent), var(--teal-primary));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.home-subtitle {
  margin: 0.9rem 0 0;
  max-width: 40rem;
  font-size: 1.1rem;
  line-height: 1.6;
  color: var(--text-secondary);
}

.home-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) clamp(250px, 30%, 340px);
  gap: 1.5rem;
  align-items: start;
}

.home-main {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  min-width: 0;
}

.home-sidebar {
  position: sticky;
  top: 96px;
  min-width: 0;
}

.panel {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 20px;
  box-shadow: var(--shadow-md);
  padding: 1.5rem;
}

.panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.25rem;
}

.panel-header.stacked {
  flex-direction: column;
  gap: 0.25rem;
}

.panel-title {
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 650;
  letter-spacing: -0.02em;
  color: var(--text-primary);
  margin: 0;
}

.panel-sub {
  margin: 0.25rem 0 0;
  font-size: 0.9rem;
  color: var(--text-secondary);
}

.panel-loading {
  display: flex;
  justify-content: center;
  padding: 2.5rem 0;
}

.panel-empty {
  text-align: center;
  padding: 2rem 1rem;
  color: var(--text-secondary);
}

.panel-empty p {
  margin: 0 0 1rem;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border-color);
  border-top-color: var(--coral-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.65rem 1.25rem;
  border-radius: 10px;
  font-weight: 600;
  text-decoration: none;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
  border: none;
  cursor: pointer;
}

.btn:hover {
  transform: translateY(-1px);
}

.btn-primary {
  background: linear-gradient(135deg, var(--coral-light), var(--coral-primary));
  color: var(--text-on-accent);
  box-shadow: 0 8px 20px rgba(224, 122, 95, 0.24);
}

.btn-secondary {
  background: var(--bg-card);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
}

.btn-secondary:hover {
  border-color: var(--border-hover);
}

/* Status */
.feed-tabs {
  display: inline-flex;
  padding: 4px;
  gap: 2px;
  border-radius: 999px;
  background: var(--bg-secondary);
  flex-shrink: 0;
}

.feed-tab {
  border: 0;
  background: transparent;
  padding: 0.4rem 0.9rem;
  border-radius: 999px;
  font: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
}

.feed-tab.active {
  background: var(--bg-card);
  color: var(--text-primary);
  box-shadow: var(--shadow-sm);
}

.activity-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.activity-item {
  display: flex;
  gap: 1rem;
  padding: 0.85rem 0;
  border-top: 1px solid var(--border-color);
}

.activity-item:first-child {
  border-top: 0;
  padding-top: 0;
}

.activity-poster {
  flex-shrink: 0;
  width: 52px;
  height: 74px;
  border-radius: 8px;
  overflow: hidden;
  background: var(--bg-secondary);
}

.activity-poster img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.activity-body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.4rem;
}

.activity-text {
  margin: 0;
  line-height: 1.45;
  color: var(--text-secondary);
}

.activity-user {
  font-weight: 700;
  color: var(--text-primary);
}

.activity-title {
  font-weight: 600;
  color: var(--text-primary);
  text-decoration: none;
}

.activity-title:hover {
  color: var(--coral-deep);
}

.activity-meta {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem;
  font-size: 0.8rem;
  color: var(--text-muted);
}

.status-chip {
  padding: 2px 8px;
  border-radius: 999px;
  font-weight: 600;
  background: var(--bg-secondary);
  color: var(--text-secondary);
}

.status-chip.status-watching {
  background: rgba(61, 139, 217, 0.12);
  color: var(--tv-badge);
}

.status-chip.status-completed {
  background: rgba(43, 187, 173, 0.14);
  color: #1d8a7f;
}

.status-chip.status-dropped {
  background: rgba(217, 74, 74, 0.1);
  color: var(--movie-badge);
}

.status-chip.status-on_hold {
  background: rgba(140, 120, 200, 0.14);
  color: #6e5bb5;
}

.status-chip.status-plan_to_watch {
  background: rgba(232, 163, 23, 0.14);
  color: #a8750f;
}

.activity-rating {
  font-weight: 600;
  color: var(--gold-accent);
}

.status-signup {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 1.2fr;
  gap: 1.5rem;
  align-items: center;
}

.signup-preview {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  opacity: 0.7;
}

.preview-row {
  display: flex;
  gap: 0.85rem;
  align-items: center;
}

.preview-poster {
  width: 40px;
  height: 56px;
  border-radius: 6px;
  background: linear-gradient(160deg, rgba(224, 122, 95, 0.25), rgba(43, 187, 173, 0.2));
}

.preview-lines {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.preview-line {
  display: block;
  height: 9px;
  width: 55%;
  border-radius: 999px;
  background: var(--bg-secondary);
}

.preview-line.wide {
  width: 85%;
}

.signup-copy h3 {
  font-family: var(--font-display);
  font-size: 1.35rem;
  margin: 0 0 0.5rem;
  color: var(--text-primary);
}

.signup-copy p {
  margin: 0 0 1.1rem;
  line-height: 1.55;
  color: var(--text-secondary);
}

.signup-actions {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

/* Character of the day */
.character-bar {
  display: flex;
  gap: 1.5rem;
  align-items: stretch;
  background:
    radial-gradient(circle at 0% 0%, rgba(224, 122, 95, 0.12), transparent 55%),
    radial-gradient(circle at 100% 100%, rgba(43, 187, 173, 0.1), transparent 50%), var(--bg-card);
}

.character-bar .panel-loading {
  width: 100%;
}

.character-portrait {
  flex-shrink: 0;
  width: 132px;
  aspect-ratio: 3 / 4;
  border-radius: 14px;
  overflow: hidden;
  background: var(--bg-secondary);
  box-shadow: var(--shadow-sm);
}

.character-portrait img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.portrait-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-family: var(--font-display);
  font-size: 2.5rem;
  color: var(--text-muted);
}

.character-body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.character-name {
  font-family: var(--font-display);
  font-size: 1.6rem;
  font-weight: 650;
  letter-spacing: -0.02em;
  margin: 0;
}

.character-name a {
  color: var(--text-primary);
  text-decoration: none;
}

.character-name a:hover {
  color: var(--coral-deep);
}

.character-native {
  margin: 0.15rem 0 0;
  font-size: 0.9rem;
  color: var(--text-muted);
}

.character-blurb {
  margin: 0.65rem 0 0;
  line-height: 1.55;
  color: var(--text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.character-titles {
  margin-top: 0.85rem;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
}

.titles-label {
  font-size: 0.8rem;
  color: var(--text-muted);
  margin-right: 0.2rem;
}

.title-chip {
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 600;
  text-decoration: none;
  background: rgba(224, 122, 95, 0.12);
  color: var(--coral-deep);
}

.title-chip:hover {
  background: rgba(224, 122, 95, 0.2);
}

.franchise-chip {
  text-decoration: none;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 600;
  color: white;
  background: linear-gradient(90deg, var(--coral-light), var(--tan-primary));
}

/* Release updates */
.update-group + .update-group {
  margin-top: 1.25rem;
}

.group-title {
  margin: 0 0 0.6rem;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.update-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.update-link {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  padding: 0.4rem;
  margin: 0 -0.4rem;
  border-radius: 10px;
  text-decoration: none;
  transition: background 0.2s ease;
}

.update-link:hover {
  background: var(--bg-hover);
}

.update-poster {
  flex-shrink: 0;
  width: 42px;
  height: 60px;
  border-radius: 6px;
  object-fit: cover;
  background: var(--bg-secondary);
}

.update-body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.update-title {
  font-weight: 600;
  font-size: 0.92rem;
  line-height: 1.3;
  color: var(--text-primary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.update-when {
  font-size: 0.8rem;
  font-weight: 600;
}

.update-when.when-episode {
  color: var(--teal-primary);
}

.update-when.when-premiere {
  color: var(--upcoming-color);
}

.update-via {
  font-size: 0.75rem;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Forum */
.forum-section {
  margin-top: 1.5rem;
}

.support-section {
  margin-top: 1.5rem;
}

.forum-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
}

.fade-in {
  animation: fadeIn 0.6s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 960px) {
  .home-layout {
    gap: 1rem;
  }

  .home-main {
    gap: 1rem;
  }

  .panel {
    padding: 1.15rem;
  }

  .panel-header {
    flex-direction: column;
  }

  .status-signup {
    grid-template-columns: 1fr;
  }

  .forum-section {
    margin-top: 1rem;
  }
}

@media (max-width: 640px) {
  .home-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .home-sidebar {
    position: static;
  }

  .home-intro {
    padding: 2.25rem 0 1.5rem;
  }

  .home-title {
    font-size: 2rem;
  }

  .character-bar {
    flex-direction: column;
    align-items: flex-start;
  }

  .character-portrait {
    width: 110px;
  }

  .forum-grid {
    grid-template-columns: 1fr;
  }
}

.home-import-reminder {
  margin: 1rem 0 0;
  max-width: 720px;
}
</style>
