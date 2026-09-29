<!--
  Profile.vue — user profile view.

  Serves both `/profile` (the signed-in user) and the shareable `/u/:username`.
  A customizable hero (accent, headline, bio) sits above Favorites, Watchlist,
  and Stats tabs whose order, default, and visibility the owner controls from
  the Customize panel, which also edits the profile picture and favorite
  genres. Favorite studios come only from hearting a studio's page. Data comes from `/users/:username`, which hides private
  profiles and hidden tabs from visitors.
-->
<template>
  <div class="profile-page" :style="accentStyle">
    <div class="container">
      <!-- Status -->
      <!-- Title: Loading -->
      <div v-if="isLoading" class="profile-status">
        <div class="spinner"></div>
        <p>Loading profile...</p>
      </div>

      <!-- Title: Not Found -->
      <div v-else-if="!profile" class="profile-status" data-testid="profile-missing">
        <h2>Profile unavailable</h2>
        <p>This profile is private or does not exist.</p>
        <router-link to="/" class="btn btn-primary">Back to Home</router-link>
      </div>

      <template v-else>
        <!-- Identity -->
        <section class="profile-hero">
          <div class="hero-banner"></div>
          <div class="hero-body">
            <!-- Title: Avatar -->
            <div class="avatar">
              <UserAvatar
                :src="profile.user.profilePicture"
                :name="profile.user.username"
                :size="112"
                class="profile-picture"
              />
            </div>

            <!-- Title: Name and Bio -->
            <div class="hero-info">
              <div class="hero-name-row">
                <h1 data-testid="profile-username">
                  {{ profile.user.username
                  }}<RoleBadge :username="profile.user.username" size="lg" />
                </h1>
                <span v-if="!profile.settings.isPublic" class="private-badge"> Private </span>
              </div>
              <p v-if="profile.settings.headline" class="headline">
                {{ profile.settings.headline }}
              </p>
              <p v-if="profile.user.bio" class="bio">{{ profile.user.bio }}</p>
              <p class="member-since">Member since {{ formatDate(profile.user.createdAt) }}</p>

              <!-- Title: Badges -->
              <section
                v-if="profileBadges.length"
                class="badges-section"
                data-testid="profile-badges"
              >
                <h2 class="badges-title">Badges</h2>
                <ul class="badge-list">
                  <li
                    v-for="badge in profileBadges"
                    :key="badge.id"
                    class="badge-card"
                    :class="{ featured: badge.id === featuredBadge }"
                    :title="badge.description"
                  >
                    <BadgeEmblem :badge="badge.id" size="xl" />
                    <span class="badge-name">{{ badge.label }}</span>
                    <span
                      v-if="badge.id === featuredBadge"
                      class="badge-featured"
                      title="Shown next to the name"
                      aria-label="Shown next to the name"
                    >
                      ★
                    </span>
                  </li>
                </ul>
                <label v-if="profile.isOwner && emblemBadges.length" class="emblem-picker">
                  <span>Next to my name</span>
                  <select
                    class="input emblem-select"
                    :value="emblemChoice"
                    :disabled="savingEmblem"
                    data-testid="emblem-picker"
                    @change="saveEmblem(($event.target as HTMLSelectElement).value)"
                  >
                    <option value="">Automatic ({{ emblemBadges[0]!.label }})</option>
                    <option v-for="badge in emblemBadges" :key="badge.id" :value="badge.id">
                      {{ badge.label }}
                    </option>
                    <option :value="NO_EMBLEM">No emblem</option>
                  </select>
                </label>
              </section>
              <div v-if="favoriteGenres.length" class="genre-tags">
                <span v-for="genre in favoriteGenres" :key="genre" class="genre-tag">
                  {{ genre }}
                </span>
              </div>
            </div>

            <!-- Title: Actions -->
            <div class="hero-actions">
              <button
                type="button"
                class="btn btn-secondary"
                data-testid="share-profile"
                @click="shareProfile"
              >
                Share profile
              </button>
              <FriendButton
                v-if="profile.relationship"
                :user-id="profile.user.id"
                :username="profile.user.username"
                :relationship="profile.relationship"
                @update:relationship="(value) => profile && (profile.relationship = value)"
              />
              <button
                v-if="profile.isOwner"
                type="button"
                class="btn btn-primary"
                data-testid="customize-profile"
                @click="openCustomize"
              >
                Customize
              </button>
            </div>
          </div>
        </section>

        <!-- Tabs -->
        <!-- Title: Tab Bar -->
        <nav class="profile-tabs" role="tablist">
          <button
            v-for="tab in profile.tabs"
            :key="tab"
            type="button"
            role="tab"
            class="profile-tab"
            :class="{ active: activeTab === tab }"
            :aria-selected="activeTab === tab"
            :data-testid="`profile-tab-${tab}`"
            @click="selectTab(tab)"
          >
            {{ TAB_LABELS[tab] }}
            <span
              v-if="profile.settings.hiddenTabs.includes(tab)"
              class="hidden-tab-note"
              title="Hidden from visitors"
              >Hidden</span
            >
          </button>
        </nav>

        <!-- Title: Favorites Tab -->
        <section
          v-if="activeTab === 'favorites' && profile.favorites"
          class="tab-panel"
          data-testid="panel-favorites"
        >
          <div v-if="!hasAnyFavorites" class="empty-panel">
            <p v-if="profile.isOwner">
              Hover a poster and tap the heart to start collecting favorites.
            </p>
            <p v-else>No favorites yet.</p>
          </div>

          <div v-if="favoriteTitles.length" class="favorite-group">
            <h3>Titles</h3>
            <div class="poster-grid">
              <div
                v-for="item in favoriteTitles"
                :key="item._id"
                class="favorite-title-card"
                @click="openContent(item)"
              >
                <div class="poster">
                  <img
                    :src="getPosterUrl(item.posterPath || '')"
                    :alt="getDisplayTitle(item)"
                    @error="handleImageError"
                  />
                  <FavoriteHeart :content-id="item._id" />
                </div>
                <span class="card-title">{{ getDisplayTitle(item) }}</span>
                <span class="card-meta">{{ getContentTypeDisplay(item.contentType) }}</span>
              </div>
            </div>
          </div>

          <div v-for="group in entityGroups" :key="group.key" class="favorite-group">
            <h3>{{ group.label }}</h3>
            <div class="poster-grid entity-grid">
              <button
                v-for="entity in group.items"
                :key="entity._id"
                type="button"
                class="favorite-entity-card"
                :class="{ 'studio-card': group.key === 'studios' }"
                @click="openEntity(entity)"
              >
                <img
                  v-if="entity.imagePath"
                  :src="getPosterUrl(entity.imagePath)"
                  :alt="entity.name"
                  referrerpolicy="no-referrer"
                />
                <div v-else class="favorite-entity-placeholder">{{ entity.name.charAt(0) }}</div>
                <span class="card-title">{{ entity.name }}</span>
              </button>
            </div>
          </div>
        </section>

        <!-- Title: Watchlist Tab -->
        <section
          v-else-if="activeTab === 'watchlist' && profile.watchlist"
          class="tab-panel"
          data-testid="panel-watchlist"
        >
          <div class="status-filters">
            <button
              v-for="option in statusFilters"
              :key="option.value"
              type="button"
              class="status-chip"
              :class="{ active: watchlistFilter === option.value }"
              @click="watchlistFilter = option.value"
            >
              {{ option.label }} <span class="chip-count">{{ option.count }}</span>
            </button>
          </div>

          <div v-if="filteredWatchlist.length" class="poster-grid">
            <div
              v-for="entry in filteredWatchlist"
              :key="entry.content._id"
              class="favorite-title-card"
              @click="openContent(entry.content)"
            >
              <div class="poster">
                <img
                  :src="getPosterUrl(entry.content.posterPath || '')"
                  :alt="getDisplayTitle(entry.content)"
                  @error="handleImageError"
                />
                <span class="status-tag" :class="`status-${entry.status}`">
                  {{ getWatchlistStatusLabel(entry.status) }}
                </span>
                <FavoriteHeart :content-id="entry.content._id" />
              </div>
              <span class="card-title">{{ getDisplayTitle(entry.content) }}</span>
              <span class="card-meta">
                <template v-if="progressLabel(entry)">{{ progressLabel(entry) }}</template>
                <span
                  v-if="entry.rating"
                  class="card-rating"
                  :style="getRatingTextStyle(entry.rating)"
                >
                  ★ {{ entry.rating }}
                </span>
              </span>
            </div>
          </div>
          <div v-else class="empty-panel">
            <p>Nothing here yet.</p>
          </div>
        </section>

        <!-- Title: Stats Tab -->
        <section
          v-else-if="activeTab === 'stats' && profile.stats"
          class="tab-panel"
          data-testid="panel-stats"
        >
          <div class="stat-tiles">
            <div class="stat-tile">
              <span class="stat-number" data-testid="stat-watchtime">{{ watchTimeLabel }}</span>
              <span class="stat-label">Watch time</span>
            </div>
            <div class="stat-tile">
              <span class="stat-number">{{ profile.stats.totals.episodesWatched }}</span>
              <span class="stat-label">Episodes watched</span>
            </div>
            <div class="stat-tile">
              <span class="stat-number">{{ profile.stats.totals.completedSeries }}</span>
              <span class="stat-label">Series completed</span>
            </div>
            <div class="stat-tile">
              <span class="stat-number">{{ profile.stats.totals.completedMovies }}</span>
              <span class="stat-label">Movies completed</span>
            </div>
            <div class="stat-tile">
              <span
                class="stat-number"
                :style="
                  profile.stats.totals.averageRating
                    ? { color: getRatingColorHSL(profile.stats.totals.averageRating) }
                    : undefined
                "
              >
                {{ profile.stats.totals.averageRating ?? '—' }}
              </span>
              <span class="stat-label">Avg rating ({{ profile.stats.totals.ratedCount }})</span>
            </div>
          </div>

          <div class="stat-cards">
            <!-- Title: Monthly Watch Time -->
            <div class="stat-card wide">
              <h3>Watch time, last 12 months</h3>
              <p class="stat-note">Hours by the month each title was last updated.</p>
              <div class="month-chart" data-testid="month-chart">
                <div
                  v-for="row in monthlyBars"
                  :key="row.month"
                  class="month-col"
                  :title="`${row.label}: ${row.hours}h`"
                >
                  <span class="month-value">{{ row.hours || '' }}</span>
                  <div class="month-track">
                    <div class="month-bar" :style="{ height: `${row.percent}%` }"></div>
                  </div>
                  <span class="month-label">{{ row.label }}</span>
                </div>
              </div>
            </div>

            <!-- Title: Top Genres -->
            <div class="stat-card">
              <h3>Most watched genres</h3>
              <div v-if="genreBars.length" class="bar-list">
                <div v-for="genre in genreBars" :key="genre.name" class="bar-row">
                  <span class="bar-name">{{ genre.name }}</span>
                  <div class="bar-track">
                    <div class="bar-fill" :style="{ width: `${genre.percent}%` }"></div>
                  </div>
                  <span class="bar-value">{{ genre.hours }}h</span>
                </div>
              </div>
              <p v-else class="stat-note">Start watching to see genre trends.</p>
            </div>

            <!-- Title: Status Breakdown -->
            <div class="stat-card">
              <h3>Watchlist breakdown</h3>
              <div class="stack-bar">
                <div
                  v-for="segment in statusSegments"
                  :key="segment.key"
                  class="stack-segment"
                  :class="`status-${segment.key}`"
                  :style="{ flexGrow: segment.count }"
                ></div>
              </div>
              <ul class="legend">
                <li v-for="segment in statusSegments" :key="segment.key">
                  <span class="legend-dot" :class="`status-${segment.key}`"></span>
                  {{ segment.label }}
                  <strong>{{ segment.count }}</strong>
                </li>
              </ul>

              <h3 class="sub-heading">Ratings given</h3>
              <div class="rating-chart">
                <div
                  v-for="(count, index) in profile.stats.ratingDistribution"
                  :key="index"
                  class="rating-col"
                >
                  <div class="rating-track">
                    <div
                      class="rating-bar"
                      :style="{ height: `${ratingPercent(count)}%` }"
                      :title="`${count} × ${index + 1}`"
                    ></div>
                  </div>
                  <span class="month-label">{{ index + 1 }}</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </template>
    </div>

    <!-- Customize -->
    <!-- Title: Customize Panel -->
    <div v-if="showCustomize && draft" class="modal-backdrop" @click.self="showCustomize = false">
      <form class="customize-panel" data-testid="customize-panel" @submit.prevent="saveCustomize">
        <header class="panel-header">
          <h2>Customize profile</h2>
          <button type="button" class="icon-btn" aria-label="Close" @click="showCustomize = false">
            <span aria-hidden="true">&times;</span>
          </button>
        </header>

        <div class="field">
          <span class="field-label">Profile picture</span>
          <ProfilePictureEditor @changed="onPictureChanged" />
        </div>

        <label class="toggle-row">
          <input v-model="draft.isPublic" type="checkbox" data-testid="toggle-public" />
          <span>
            <strong>Public profile</strong>
            <small>Anyone with your link can view it. Turn off to keep it to yourself.</small>
          </span>
        </label>

        <div class="field">
          <span class="field-label">Accent color</span>
          <div class="swatches">
            <button
              v-for="(color, name) in ACCENT_COLORS"
              :key="name"
              type="button"
              class="swatch"
              :class="{ selected: draft.accent === name }"
              :style="{ background: color }"
              :aria-label="name"
              @click="draft.accent = name"
            ></button>
          </div>
        </div>

        <label class="field">
          <span class="field-label">Headline</span>
          <input
            v-model="draft.headline"
            type="text"
            class="form-control"
            maxlength="80"
            placeholder="Seasonal anime enjoyer"
          />
        </label>

        <label class="field">
          <span class="field-label"
            >Bio <small>{{ draftBio.length }}/300</small></span
          >
          <textarea
            v-model="draftBio"
            class="form-control"
            maxlength="300"
            rows="3"
            placeholder="Tell people what you like to watch"
          ></textarea>
        </label>

        <PreferencesEditor v-model:genres="draftGenres" />

        <div class="field">
          <span class="field-label">Tabs</span>
          <ul class="tab-order">
            <li v-for="(tab, index) in draft.tabOrder" :key="tab" class="tab-order-row">
              <span class="tab-order-name">{{ TAB_LABELS[tab] }}</span>
              <label class="inline-check">
                <input
                  type="checkbox"
                  :checked="!draft.hiddenTabs.includes(tab)"
                  :disabled="!draft.hiddenTabs.includes(tab) && visibleDraftTabs.length === 1"
                  @change="toggleTabVisibility(tab)"
                />
                Visible
              </label>
              <button
                type="button"
                class="icon-btn"
                :disabled="index === 0"
                aria-label="Move up"
                @click="moveTab(index, -1)"
              >
                <span aria-hidden="true">&uarr;</span>
              </button>
              <button
                type="button"
                class="icon-btn"
                :disabled="index === draft.tabOrder.length - 1"
                aria-label="Move down"
                @click="moveTab(index, 1)"
              >
                <span aria-hidden="true">&darr;</span>
              </button>
            </li>
          </ul>
        </div>

        <label class="field">
          <span class="field-label">Open on</span>
          <select v-model="draft.defaultTab" class="form-control">
            <option v-for="tab in visibleDraftTabs" :key="tab" :value="tab">
              {{ TAB_LABELS[tab] }}
            </option>
          </select>
        </label>

        <footer class="panel-footer">
          <router-link to="/settings" class="settings-link">Account settings</router-link>
          <button type="button" class="btn btn-secondary" @click="showCustomize = false">
            Cancel
          </button>
          <button type="submit" class="btn btn-primary" :disabled="isSaving">
            {{ isSaving ? 'Saving...' : 'Save' }}
          </button>
        </footer>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineOptions, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from 'vue-toastification'
import { useAuthStore } from '@/stores/auth'
import { useFavoritesStore } from '@/stores/favorites'
import {
  getContentTypeDisplay,
  getDetailsRouteName,
  getPosterUrl,
  profileAPI,
} from '@/services/api'
import { getRatingColorHSL, getRatingTextStyle } from '@/utils/ratingColors'
import { getDisplayTitle } from '@/utils/titles'
import { getWatchlistStatusLabel, WATCHLIST_STATUS_OPTIONS } from '@/utils/watchlist'
import FavoriteHeart from '@/components/FavoriteHeart.vue'
import PreferencesEditor from '@/components/PreferencesEditor.vue'
import ProfilePictureEditor from '@/components/ProfilePictureEditor.vue'
import UserAvatar from '@/components/UserAvatar.vue'
import RoleBadge from '@/components/RoleBadge.vue'
import BadgeEmblem from '@/components/BadgeEmblem.vue'
import { useBadgesStore } from '@/stores/badges'
import { NO_EMBLEM, badgeInfo } from '@/utils/badges'
import FriendButton from '@/components/FriendButton.vue'
import type { CatalogEntity, UnifiedContent } from '@/types/content'
import type {
  ProfileAccent,
  ProfileSettings,
  ProfileTab,
  PublicProfile,
  PublicWatchlistEntry,
} from '@/types/profile'

defineOptions({ name: 'ProfilePage' })

const TAB_LABELS: Record<ProfileTab, string> = {
  favorites: 'Favorites',
  watchlist: 'Watchlist',
  stats: 'Stats',
}
const ACCENT_COLORS: Record<ProfileAccent, string> = {
  coral: '#e07a5f',
  teal: '#2bbbad',
  violet: '#7b6bb0',
  gold: '#e8a317',
  rose: '#d9577a',
  sky: '#3d8bd9',
}

const route = useRoute()
const router = useRouter()
const toast = useToast()
const authStore = useAuthStore()
const favoritesStore = useFavoritesStore()

const profile = ref<PublicProfile | null>(null)
const isLoading = ref(true)
const activeTab = ref<ProfileTab>('favorites')
const watchlistFilter = ref<'all' | PublicWatchlistEntry['status']>('all')

const showCustomize = ref(false)
const isSaving = ref(false)
const draft = ref<ProfileSettings | null>(null)
const draftBio = ref('')
const draftGenres = ref<string[]>([])

const username = computed(() =>
  typeof route.params.username === 'string' ? route.params.username : authStore.user?.username,
)

const accentStyle = computed(() => ({
  '--profile-accent': ACCENT_COLORS[profile.value?.settings.accent || 'coral'],
}))

const favoriteGenres = computed(() => profile.value?.user.preferences.favoriteGenres || [])

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

const isTab = (value: unknown): value is ProfileTab =>
  value === 'favorites' || value === 'watchlist' || value === 'stats'

const loadProfile = async () => {
  if (!username.value) {
    isLoading.value = false
    profile.value = null
    return
  }
  isLoading.value = true
  try {
    const response = await profileAPI.getPublicProfile(username.value)
    profile.value = response.data.data as PublicProfile
    const requested = route.query.tab
    activeTab.value =
      isTab(requested) && profile.value.tabs.includes(requested)
        ? requested
        : profile.value.tabs.includes(profile.value.settings.defaultTab)
          ? profile.value.settings.defaultTab
          : profile.value.tabs[0] || 'favorites'
  } catch (err) {
    console.error('Failed to load profile:', err)
    profile.value = null
  } finally {
    isLoading.value = false
  }
}

watch(username, loadProfile, { immediate: true })

// --- Badges ------------------------------------------------------------------

const badgesStore = useBadgesStore()
const savingEmblem = ref(false)
const profileUsername = computed(() => profile.value?.user.username)
const profileBadges = computed(() => badgesStore.badgesFor(profileUsername.value).map(badgeInfo))
const emblemBadges = computed(() => profileBadges.value.filter((badge) => badge.emblem))
const featuredBadge = computed(() => badgesStore.featuredFor(profileUsername.value))
/** Select value: '' = automatic, a badge id, or 'none'. */
const emblemChoice = computed(() => badgesStore.choiceFor(profileUsername.value) ?? '')

onMounted(() => {
  badgesStore.load()
})

const saveEmblem = async (value: string) => {
  savingEmblem.value = true
  try {
    await profileAPI.setFeaturedBadge(value || null)
    await badgesStore.load(true)
    toast.success('Saved.')
  } catch (error) {
    const apiError = error as { response?: { data?: { message?: string } } }
    toast.error(apiError.response?.data?.message || 'Could not save your badge.')
  } finally {
    savingEmblem.value = false
  }
}

const selectTab = (tab: ProfileTab) => {
  activeTab.value = tab
  router.replace({ query: { ...route.query, tab } })
}

// ---------------------------------------------------------------------------
// Favorites
// ---------------------------------------------------------------------------

/** On your own profile, un-hearting a title drops it from the list immediately. */
const favoriteTitles = computed(() => {
  const titles = profile.value?.favorites?.content || []
  if (!profile.value?.isOwner || !favoritesStore.isLoaded) return titles
  return titles.filter((item) => favoritesStore.isFavorite(item._id))
})

const entityGroups = computed(() => {
  const favorites = profile.value?.favorites
  if (!favorites) return []
  return [
    { key: 'characters', label: 'Characters', items: favorites.characters },
    {
      key: 'voiceActors',
      label: 'Voice Actors',
      items: favorites.voiceActors,
    },
    {
      key: 'studios',
      label: 'Studios',
      items: favorites.studios,
    },
  ].filter((group) => group.items.length)
})

const hasAnyFavorites = computed(
  () => favoriteTitles.value.length > 0 || entityGroups.value.length > 0,
)

// ---------------------------------------------------------------------------
// Watchlist
// ---------------------------------------------------------------------------

const statusFilters = computed(() => {
  const rows = profile.value?.watchlist || []
  return [
    { value: 'all' as const, label: 'All', count: rows.length },
    ...WATCHLIST_STATUS_OPTIONS.map((option) => ({
      value: option.value,
      label: option.label,
      count: rows.filter((row) => row.status === option.value).length,
    })),
  ]
})

const filteredWatchlist = computed(() => {
  const rows = [...(profile.value?.watchlist || [])].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  )
  if (watchlistFilter.value === 'all') return rows
  return rows.filter((row) => row.status === watchlistFilter.value)
})

const progressLabel = (entry: PublicWatchlistEntry) => {
  if (entry.content.contentType === 'movie') return ''
  const total = entry.content.episodeCount || entry.content.malEpisodes
  if (entry.status === 'plan_to_watch') return total ? `${total} eps` : ''
  if (!entry.currentEpisode && entry.status !== 'completed') return ''
  const watched =
    entry.status === 'completed' ? total || entry.currentEpisode : entry.currentEpisode
  return total ? `${watched}/${total} eps` : `${watched} eps`
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

const toHours = (minutes: number) => Math.round(minutes / 6) / 10

const watchTimeLabel = computed(() => {
  const minutes = profile.value?.stats?.totals.minutesWatched || 0
  const hours = Math.round(minutes / 60)
  if (hours >= 48) return `${Math.round((minutes / 1440) * 10) / 10}d`
  return `${hours}h`
})

const monthlyBars = computed(() => {
  const rows = profile.value?.stats?.monthly || []
  const max = Math.max(1, ...rows.map((row) => row.minutes))
  return rows.map((row) => {
    const [year, month] = row.month.split('-').map(Number)
    const label = new Date(Date.UTC(year!, month! - 1, 1)).toLocaleDateString('en-US', {
      month: 'short',
      timeZone: 'UTC',
    })
    return {
      month: row.month,
      label,
      hours: toHours(row.minutes),
      percent: (row.minutes / max) * 100,
    }
  })
})

const genreBars = computed(() => {
  const rows = profile.value?.stats?.genres || []
  const max = Math.max(1, ...rows.map((row) => row.minutes))
  return rows.map((row) => ({
    name: row.name,
    hours: toHours(row.minutes),
    percent: Math.max(4, (row.minutes / max) * 100),
  }))
})

const statusSegments = computed(() => {
  const totals = profile.value?.stats?.totals
  if (!totals) return []
  return [
    { key: 'watching', label: 'Watching', count: totals.watching },
    { key: 'completed', label: 'Completed', count: totals.completed },
    { key: 'plan_to_watch', label: 'Planned', count: totals.planToWatch },
    { key: 'dropped', label: 'Dropped', count: totals.dropped },
  ]
})

const ratingPercent = (count: number) => {
  const max = Math.max(1, ...(profile.value?.stats?.ratingDistribution || [0]))
  return (count / max) * 100
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

const shareProfile = async () => {
  if (!profile.value) return
  const url = `${window.location.origin}/u/${encodeURIComponent(profile.value.user.username)}`
  try {
    await navigator.clipboard.writeText(url)
    toast.success(
      profile.value.settings.isPublic
        ? 'Profile link copied!'
        : 'Link copied. Your profile is private, so only you can open it.',
    )
  } catch {
    window.prompt('Copy your profile link:', url)
  }
}

const openCustomize = () => {
  if (!profile.value) return
  draft.value = {
    ...profile.value.settings,
    tabOrder: [...profile.value.settings.tabOrder],
    hiddenTabs: [...profile.value.settings.hiddenTabs],
  }
  draftBio.value = profile.value.user.bio || ''
  draftGenres.value = [...profile.value.user.preferences.favoriteGenres]
  showCustomize.value = true
}

/** Picture uploads apply immediately; mirror them in the hero. */
const onPictureChanged = (profilePicture: string | null) => {
  if (profile.value) profile.value.user.profilePicture = profilePicture
}

const visibleDraftTabs = computed(() =>
  draft.value ? draft.value.tabOrder.filter((tab) => !draft.value!.hiddenTabs.includes(tab)) : [],
)

const moveTab = (index: number, delta: number) => {
  if (!draft.value) return
  const order = [...draft.value.tabOrder]
  const [tab] = order.splice(index, 1)
  order.splice(index + delta, 0, tab!)
  draft.value.tabOrder = order
}

const toggleTabVisibility = (tab: ProfileTab) => {
  if (!draft.value) return
  const hidden = draft.value.hiddenTabs
  draft.value.hiddenTabs = hidden.includes(tab)
    ? hidden.filter((row) => row !== tab)
    : [...hidden, tab]
  if (!visibleDraftTabs.value.includes(draft.value.defaultTab)) {
    draft.value.defaultTab = visibleDraftTabs.value[0]!
  }
}

const saveCustomize = async () => {
  if (!draft.value || !profile.value) return
  isSaving.value = true
  try {
    const preferences = { favoriteGenres: draftGenres.value }
    const [response] = await Promise.all([
      profileAPI.updateSettings({ settings: draft.value, bio: draftBio.value }),
      authStore.updateProfile({ preferences }),
    ])
    const { settings, bio } = response.data.data as { settings: ProfileSettings; bio: string }
    profile.value.settings = settings
    profile.value.user.bio = bio
    profile.value.user.preferences = preferences
    profile.value.tabs = settings.tabOrder
    showCustomize.value = false
    toast.success('Profile updated!')
  } catch (err) {
    console.error('Failed to save profile settings:', err)
    toast.error('Could not save your profile')
  } finally {
    isSaving.value = false
  }
}

const openContent = (item: UnifiedContent) => {
  router.push({ name: getDetailsRouteName(item), params: { id: item._id } })
}

const openEntity = (entity: CatalogEntity) => {
  router.push({ name: getDetailsRouteName(entity), params: { id: entity._id } })
}

const formatDate = (dateString: string | undefined) => {
  if (!dateString) return 'Unknown'
  const date = new Date(dateString)
  if (isNaN(date.getTime())) return 'Unknown'
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

/** Swap in the placeholder once; a failing placeholder must not retrigger `error` forever. */
const handleImageError = (event: Event) => {
  const img = event.target as HTMLImageElement
  if (img.dataset.fallback) return
  img.dataset.fallback = 'true'
  img.src = '/placeholder-movie.jpg'
}
</script>

<style scoped>
.profile-page {
  --profile-accent: var(--coral-primary);
  padding: 2rem 0 3rem;
  min-height: calc(100vh - 140px);
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1rem;
}

.profile-status {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 5rem 1rem;
  text-align: center;
  color: var(--text-secondary);
}

.profile-status h2 {
  color: var(--text-primary);
  margin: 0;
}

/* Hero */
.profile-hero {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  box-shadow: var(--shadow-sm);
  overflow: hidden;
  margin-bottom: 1.5rem;
}

.hero-banner {
  height: 120px;
  background:
    radial-gradient(circle at 20% 20%, rgba(255, 255, 255, 0.25), transparent 55%),
    linear-gradient(
      135deg,
      var(--profile-accent),
      color-mix(in srgb, var(--profile-accent) 55%, #152238)
    );
}

.hero-body {
  display: flex;
  align-items: flex-start;
  gap: 1.5rem;
  padding: 0 2rem 1.75rem;
}

.avatar {
  flex-shrink: 0;
  margin-top: -56px;
}

.profile-picture {
  border: 4px solid var(--bg-card);
  box-shadow: var(--shadow-md);
}

.hero-info {
  flex: 1;
  min-width: 0;
  padding-top: 1rem;
}

.hero-name-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

/* Sit the creator/admin badge on the name's cap height rather than its baseline. */
.hero-info h1 .badge-group {
  vertical-align: 0em;
}

.hero-info h1 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 2rem;
  font-weight: 650;
  color: var(--text-primary);
  letter-spacing: -0.02em;
}

.private-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 0.8rem;
  font-weight: 600;
}

.headline {
  margin: 0.2rem 0 0;
  color: var(--profile-accent);
  font-weight: 600;
}

.bio {
  margin: 0.5rem 0 0;
  color: var(--text-secondary);
  white-space: pre-line;
  max-width: 60ch;
}

.member-since {
  margin: 0.4rem 0 0;
  color: var(--text-muted);
  font-size: 0.85rem;
}

.badges-section {
  margin-top: 0.9rem;
}

.badges-title {
  margin: 0 0 0.5rem;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.badge-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}

.badge-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  min-width: 5.5rem;
  padding: 0.7rem 0.6rem 0.55rem;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  background: var(--bg-parchment);
}

.badge-card.featured {
  border-color: var(--border-hover);
  box-shadow: 0 0 0 3px rgba(224, 122, 95, 0.12);
}

.badge-name {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--text-primary);
}

.badge-featured {
  position: absolute;
  top: 0.3rem;
  right: 0.45rem;
  font-size: 0.75rem;
  color: var(--coral-primary);
}

.emblem-picker {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.7rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.emblem-select {
  width: auto;
  padding: 0.35rem 0.6rem;
  font-size: 0.85rem;
}

.genre-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.75rem;
}

.genre-tag {
  padding: 0.2rem 0.7rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--profile-accent) 14%, transparent);
  color: var(--text-primary);
  font-size: 0.8rem;
  font-weight: 600;
}

.hero-actions {
  display: flex;
  gap: 0.5rem;
  flex-shrink: 0;
  padding-top: 1rem;
}

.hero-actions .btn {
  gap: 0.4rem;
}

.btn-primary {
  background: var(--profile-accent);
  border-color: var(--profile-accent);
}

/* Tabs */
.profile-tabs {
  display: flex;
  gap: 0.25rem;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 1.5rem;
  overflow-x: auto;
}

.profile-tab {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.75rem 1.1rem;
  border: none;
  border-bottom: 3px solid transparent;
  background: transparent;
  color: var(--text-secondary);
  font-weight: 600;
  font-size: 0.95rem;
  cursor: pointer;
  white-space: nowrap;
}

.profile-tab:hover {
  color: var(--text-primary);
}

.profile-tab.active {
  color: var(--text-primary);
  border-bottom-color: var(--profile-accent);
}

.hidden-tab-note {
  padding: 0.05rem 0.4rem;
  border-radius: 4px;
  background: var(--bg-secondary);
  color: var(--text-muted);
  font-size: 0.7rem;
  font-weight: 600;
}

.tab-panel {
  display: grid;
  gap: 2rem;
}

.empty-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 3rem 1rem;
  color: var(--text-muted);
  text-align: center;
}

/* Poster grids */
.favorite-group h3 {
  margin: 0 0 0.9rem;
  font-family: var(--font-display);
  font-size: 1.2rem;
  color: var(--text-primary);
}

.poster-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 1rem;
}

.entity-grid {
  grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
}

.favorite-title-card,
.favorite-entity-card {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
  color: var(--text-primary);
}

.poster {
  position: relative;
  aspect-ratio: 2 / 3;
  border-radius: 10px;
  overflow: hidden;
  background: var(--bg-secondary);
  box-shadow: var(--shadow-sm);
  transition:
    transform 0.15s ease,
    box-shadow 0.15s ease;
}

.favorite-title-card:hover .poster {
  transform: translateY(-3px);
  box-shadow: var(--shadow-md);
}

.poster img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.favorite-entity-card img,
.favorite-entity-placeholder {
  width: 100%;
  aspect-ratio: 4 / 5;
  object-fit: cover;
  border-radius: 10px;
  background: var(--bg-secondary);
}

.favorite-entity-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: 1.5rem;
}

.studio-card img,
.studio-card .favorite-entity-placeholder {
  aspect-ratio: 1;
  object-fit: contain;
  padding: 0.6rem;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
}

.card-title {
  font-size: 0.88rem;
  font-weight: 600;
  line-height: 1.25;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-muted);
  font-size: 0.78rem;
}

.card-rating {
  padding: 0 0.35rem;
  font-weight: 700;
}

/* Watchlist */
.status-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.status-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.85rem;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-card);
  color: var(--text-secondary);
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
}

.status-chip.active {
  background: var(--profile-accent);
  border-color: var(--profile-accent);
  color: #fff;
}

.chip-count {
  opacity: 0.75;
  font-weight: 500;
}

.status-tag {
  position: absolute;
  left: 6px;
  top: 6px;
  padding: 0.1rem 0.45rem;
  border-radius: 4px;
  color: #fff;
  font-size: 0.7rem;
  font-weight: 700;
}

.status-watching {
  background: var(--tv-badge);
}

.status-completed {
  background: var(--teal-primary);
}

.status-plan_to_watch {
  background: var(--text-muted);
}

.status-dropped {
  background: var(--movie-badge);
}

/* Stats */
.stat-tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 1rem;
}

.stat-tile,
.stat-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: var(--shadow-sm);
}

.stat-tile {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 1.1rem 1.25rem;
}

.stat-number {
  font-family: var(--font-display);
  font-size: 1.9rem;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.1;
}

.stat-label {
  color: var(--text-secondary);
  font-size: 0.85rem;
}

.stat-cards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.stat-card {
  padding: 1.25rem 1.4rem;
}

.stat-card.wide {
  grid-column: 1 / -1;
}

.stat-card h3 {
  margin: 0 0 0.25rem;
  font-size: 1.05rem;
  color: var(--text-primary);
}

.stat-card .sub-heading {
  margin-top: 1.5rem;
}

.stat-note {
  margin: 0 0 1rem;
  color: var(--text-muted);
  font-size: 0.8rem;
}

.month-chart,
.rating-chart {
  display: grid;
  gap: 0.5rem;
  align-items: end;
}

.month-chart {
  grid-template-columns: repeat(12, minmax(0, 1fr));
  height: 190px;
}

.rating-chart {
  grid-template-columns: repeat(10, minmax(0, 1fr));
  height: 110px;
  margin-top: 0.75rem;
}

.month-col,
.rating-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
  height: 100%;
  min-width: 0;
}

.month-track,
.rating-track {
  flex: 1;
  width: 100%;
  display: flex;
  align-items: flex-end;
}

.month-bar,
.rating-bar {
  width: 100%;
  min-height: 2px;
  border-radius: 4px 4px 0 0;
  background: var(--profile-accent);
  transition: height 0.3s ease;
}

.rating-bar {
  background: color-mix(in srgb, var(--profile-accent) 70%, var(--teal-primary));
}

.month-value {
  font-size: 0.7rem;
  color: var(--text-secondary);
  min-height: 1em;
}

.month-label {
  font-size: 0.72rem;
  color: var(--text-muted);
}

.bar-list {
  display: grid;
  gap: 0.6rem;
  margin-top: 0.75rem;
}

.bar-row {
  display: grid;
  grid-template-columns: 110px 1fr 48px;
  align-items: center;
  gap: 0.6rem;
  font-size: 0.85rem;
}

.bar-name {
  color: var(--text-primary);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bar-track {
  height: 10px;
  border-radius: 999px;
  background: var(--bg-secondary);
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 999px;
  background: var(--profile-accent);
}

.bar-value {
  text-align: right;
  color: var(--text-secondary);
}

.stack-bar {
  display: flex;
  height: 14px;
  border-radius: 999px;
  overflow: hidden;
  background: var(--bg-secondary);
  margin-top: 0.75rem;
}

.stack-segment {
  flex-basis: 0;
}

.legend {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.4rem 1rem;
  list-style: none;
  padding: 0;
  margin: 0.75rem 0 0;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.legend li {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.legend strong {
  margin-left: auto;
  color: var(--text-primary);
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

/* Customize */
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(21, 34, 56, 0.45);
}

.customize-panel {
  width: min(520px, 100%);
  max-height: calc(100vh - 2rem);
  overflow-y: auto;
  display: grid;
  gap: 1.1rem;
  padding: 1.5rem;
  background: var(--bg-card);
  border-radius: 14px;
  box-shadow: var(--shadow-lg);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.panel-header h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.4rem;
  color: var(--text-primary);
}

.icon-btn {
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-secondary);
  cursor: pointer;
}

.icon-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.toggle-row {
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
  cursor: pointer;
}

.toggle-row input {
  margin-top: 0.3rem;
}

.toggle-row span {
  display: grid;
  gap: 0.15rem;
  color: var(--text-primary);
}

.toggle-row small {
  color: var(--text-muted);
}

.field {
  display: grid;
  gap: 0.4rem;
}

.field-label {
  display: flex;
  justify-content: space-between;
  font-weight: 600;
  color: var(--text-primary);
  font-size: 0.9rem;
}

.field-label small {
  color: var(--text-muted);
  font-weight: 500;
}

.form-control {
  width: 100%;
  padding: 0.55rem 0.7rem;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font: inherit;
}

textarea.form-control {
  resize: vertical;
}

.swatches {
  display: flex;
  gap: 0.6rem;
}

.swatch {
  width: 32px;
  height: 32px;
  padding: 0;
  border: 3px solid transparent;
  border-radius: 50%;
  cursor: pointer;
  box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.6);
}

.swatch.selected {
  border-color: var(--text-primary);
}

.tab-order {
  display: grid;
  gap: 0.4rem;
  list-style: none;
  padding: 0;
  margin: 0;
}

.tab-order-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.6rem;
  border: 1px solid var(--border-color);
  border-radius: 8px;
}

.tab-order-name {
  flex: 1;
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  font-weight: 600;
  color: var(--text-primary);
}

.inline-check {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.panel-footer {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.settings-link {
  margin-right: auto;
  color: var(--text-secondary);
  font-size: 0.85rem;
}

@media (max-width: 768px) {
  .hero-body {
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 0 1rem 1.5rem;
  }

  .hero-info,
  .hero-actions {
    padding-top: 0;
  }

  .hero-name-row,
  .genre-tags {
    justify-content: center;
  }

  .bio {
    margin-left: auto;
    margin-right: auto;
  }

  .stat-cards {
    grid-template-columns: 1fr;
  }

  .month-chart {
    gap: 0.2rem;
  }

  .month-value {
    display: none;
  }

  .poster-grid {
    grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  }
}
</style>
