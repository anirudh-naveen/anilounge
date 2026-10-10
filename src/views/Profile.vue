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
                    tabindex="0"
                    :aria-label="badge.label"
                  >
                    <BadgeEmblem :badge="badge.id" size="md" :tooltip="false" />
                    <span
                      v-if="badge.id === featuredBadge"
                      class="badge-featured"
                      aria-hidden="true"
                    >
                      ★
                    </span>
                    <!-- Shown on hover / keyboard focus. -->
                    <span class="badge-tooltip" role="tooltip">
                      <span class="badge-name">{{ badge.label }}</span>
                      <span v-if="badge.description" class="badge-desc">{{
                        badge.description
                      }}</span>
                      <span v-if="badge.id === featuredBadge" class="badge-desc">
                        ★ Shown next to the name
                      </span>
                    </span>
                  </li>
                </ul>
              </section>
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
                class="btn btn-secondary share-btn"
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
              <router-link
                v-if="profile.relationship === 'friends'"
                :to="{ name: 'friends', query: { user: profile.user.id } }"
                class="btn btn-secondary"
                data-testid="message-friend"
              >
                Message
              </router-link>
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

          <!-- Title: Search and Sort -->
          <div class="watchlist-tools">
            <ListSearch
              v-model="watchlistQuery"
              placeholder="Search this watchlist"
              data-testid="profile-watchlist-search"
            />
            <SortByControls
              v-model:sort-by="watchlistSortBy"
              v-model:sort-direction="watchlistSortDirection"
              :options="WATCHLIST_SORT_OPTIONS"
            />
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
            <p>
              {{ watchlistQuery.trim() ? 'No titles match your search.' : 'Nothing here yet.' }}
            </p>
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
                    ? { color: getRatingColor(profile.stats.totals.averageRating) }
                    : undefined
                "
              >
                {{ profile.stats.totals.averageRating ?? '—' }}
              </span>
              <span class="stat-label">Avg rating ({{ profile.stats.totals.ratedCount }})</span>
            </div>
          </div>

          <div class="stat-cards">
            <!-- Title: Watch Time Calendar -->
            <div class="stat-card wide">
              <h3>
                {{ visibleCalendarYear.totalLabel }} watched in {{ visibleCalendarYear.year }}
              </h3>
              <p class="stat-note">
                Episodes count on the day they were logged. Imported titles are spread between their
                start and finish dates.
              </p>
              <div
                ref="calendarScroller"
                class="heatmap-scroll"
                data-testid="watch-calendar"
                @scroll.passive="onCalendarScroll"
              >
                <div
                  v-for="calendarYear in calendarYears"
                  :key="calendarYear.year"
                  class="heatmap"
                  :data-testid="`watch-calendar-${calendarYear.year}`"
                >
                  <span class="heatmap-year" aria-hidden="true">{{ calendarYear.year }}</span>
                  <span
                    v-for="label in calendarYear.months"
                    :key="label.text"
                    class="heatmap-month"
                    :style="{ gridColumn: label.column + 2 }"
                    >{{ label.text }}</span
                  >
                  <span class="heatmap-day" style="grid-row: 3">Mon</span>
                  <span class="heatmap-day" style="grid-row: 5">Wed</span>
                  <span class="heatmap-day" style="grid-row: 7">Fri</span>
                  <template v-for="(week, column) in calendarYear.weeks" :key="column">
                    <span
                      v-for="(day, row) in week"
                      :key="`${column}-${row}`"
                      class="heatmap-cell"
                      :class="day ? `level-${day.level}` : 'empty'"
                      :style="{ gridColumn: column + 2, gridRow: row + 2 }"
                      :title="day ? day.title : undefined"
                    ></span>
                  </template>
                </div>
              </div>
              <div class="heatmap-legend" aria-hidden="true">
                Less
                <span
                  v-for="level in 5"
                  :key="level"
                  class="heatmap-cell"
                  :class="`level-${level - 1}`"
                ></span>
                More
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
                  <span class="bar-value">{{ genre.hours }}</span>
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

        <label v-if="emblemBadges.length" class="field">
          <span class="field-label">Badge next to my name</span>
          <select v-model="draftEmblem" class="form-control" data-testid="emblem-picker">
            <option value="">Automatic ({{ emblemBadges[0]!.label }})</option>
            <option v-for="badge in emblemBadges" :key="badge.id" :value="badge.id">
              {{ badge.label }}
            </option>
            <option :value="NO_EMBLEM">No badge</option>
          </select>
        </label>

        <div class="field">
          <span class="field-label">Accent color</span>
          <div class="swatches">
            <button
              v-for="(color, name) in ACCENT_PRESETS"
              :key="name"
              type="button"
              class="swatch"
              :class="{ selected: draft.accent === name }"
              :style="{ background: color }"
              :aria-label="name"
              @click="draft.accent = name"
            ></button>
            <!-- Color wheel: any custom color. -->
            <label
              class="swatch swatch-wheel"
              :class="{ selected: isCustomAccent(draft.accent) }"
              title="Pick any color"
            >
              <span
                v-if="isCustomAccent(draft.accent)"
                class="wheel-dot"
                :style="{ background: draft.accent }"
              ></span>
              <input
                type="color"
                class="wheel-input"
                :value="customAccent"
                aria-label="Custom accent color"
                data-testid="accent-wheel"
                @input="pickCustomAccent"
              />
            </label>
            <span v-if="isCustomAccent(draft.accent)" class="custom-hex">{{ draft.accent }}</span>
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
            :disabled="authStore.isDemoUser"
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
            :disabled="authStore.isDemoUser"
          ></textarea>
          <small v-if="authStore.isDemoUser" class="field-note">
            The shared demo account's headline and bio can't change.
          </small>
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
import { showPosterPlaceholder } from '@/utils/posters'
import { computed, defineOptions, nextTick, onMounted, ref, watch } from 'vue'
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
import { getRatingColor, getRatingTextStyle } from '@/utils/ratingColors'
import { getDisplayTitle } from '@/utils/titles'
import { getWatchlistStatusLabel, WATCHLIST_STATUS_OPTIONS } from '@/utils/watchlist'
import FavoriteHeart from '@/components/FavoriteHeart.vue'
import SortByControls from '@/components/SortByControls.vue'
import ListSearch from '@/components/ListSearch.vue'
import { applySort, type SortByOption, type SortDirection } from '@/utils/sorting'
import { getTotalVoteCount } from '@/utils/ratings'
import { getSearchCategoryDate } from '@/utils/searchFilters'
import PreferencesEditor from '@/components/PreferencesEditor.vue'
import ProfilePictureEditor from '@/components/ProfilePictureEditor.vue'
import UserAvatar from '@/components/UserAvatar.vue'
import RoleBadge from '@/components/RoleBadge.vue'
import BadgeEmblem from '@/components/BadgeEmblem.vue'
import { useBadgesStore } from '@/stores/badges'
import { NO_EMBLEM, badgeInfo } from '@/utils/badges'
import { ACCENT_PRESETS, accentColor, isCustomAccent, readableOn } from '@/utils/accent'
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

const route = useRoute()
const router = useRouter()
const toast = useToast()
const authStore = useAuthStore()
const favoritesStore = useFavoritesStore()

const profile = ref<PublicProfile | null>(null)
const isLoading = ref(true)
const activeTab = ref<ProfileTab>('favorites')
const watchlistFilter = ref<'all' | PublicWatchlistEntry['status']>('all')
const watchlistQuery = ref('')
const watchlistSortBy = ref<SortByOption>('relevance')
const watchlistSortDirection = ref<SortDirection>('desc')
/** "Relevance" here is recency: the order titles were last updated. */
const WATCHLIST_SORT_OPTIONS: { value: SortByOption; label: string }[] = [
  { value: 'relevance', label: 'Last updated' },
  { value: 'alphabetical', label: 'Alphabetical' },
  { value: 'rating', label: 'Their rating' },
  { value: 'popularity', label: 'Popularity' },
  { value: 'date', label: 'Release date' },
]

const showCustomize = ref(false)
const isSaving = ref(false)
const draft = ref<ProfileSettings | null>(null)
const draftBio = ref('')
const draftGenres = ref<string[]>([])

const username = computed(() =>
  typeof route.params.username === 'string' ? route.params.username : authStore.user?.username,
)

const accentStyle = computed(() => {
  const accent = profile.value?.settings.accent
  return { '--profile-accent': accentColor(accent), '--profile-on-accent': readableOn(accent) }
})

/** Color wheel value: the custom accent, or the current preset's color to start from. */
const customAccent = computed(() => (draft.value ? accentColor(draft.value.accent) : '#e07a5f'))

const pickCustomAccent = (event: Event) => {
  if (draft.value)
    draft.value.accent = (event.target as HTMLInputElement).value.toLowerCase() as ProfileAccent
}

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
const profileUsername = computed(() => profile.value?.user.username)
const profileBadges = computed(() => badgesStore.badgesFor(profileUsername.value).map(badgeInfo))
const emblemBadges = computed(() => profileBadges.value.filter((badge) => badge.emblem))
const featuredBadge = computed(() => badgesStore.featuredFor(profileUsername.value))
/** Select value: '' = automatic, a badge id, or 'none'. */
const emblemChoice = computed(() => badgesStore.choiceFor(profileUsername.value) ?? '')

/** Customize panel's pick for the badge next to the name ('' = automatic). */
const draftEmblem = ref('')

onMounted(() => {
  badgesStore.load()
})

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
  const query = watchlistQuery.value.trim().toLowerCase()
  const rows = (profile.value?.watchlist || []).filter((row) => {
    if (watchlistFilter.value !== 'all' && row.status !== watchlistFilter.value) return false
    if (!query) return true
    const { title, englishTitle, originalTitle } = row.content
    return [getDisplayTitle(row.content), title, englishTitle, originalTitle].some((name) =>
      name?.toLowerCase().includes(query),
    )
  })
  return applySort(
    rows,
    watchlistSortBy.value,
    watchlistSortDirection.value,
    (row) => getDisplayTitle(row.content),
    (row) => row.rating ?? 0,
    (row) => getTotalVoteCount(row.content),
    (row) => new Date(row.updatedAt).getTime() || 0,
    (row) => getSearchCategoryDate(row.content)?.getTime() ?? 0,
  )
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

/** Whole hours up to 100, then days: `0.4h`, `42h`, `4.5d`. */
const formatWatchTime = (minutes: number) => {
  const hours = minutes / 60
  if (hours > 100) return `${Math.round((minutes / 1440) * 10) / 10}d`
  if (hours > 0 && hours < 1) return `${Math.round(hours * 10) / 10}h`
  return `${Math.round(hours)}h`
}

const watchTimeLabel = computed(() =>
  formatWatchTime(profile.value?.stats?.totals.minutesWatched || 0),
)

/** Columns per year: a year touches at most 54 Sunday-first weeks. */
const CALENDAR_WEEKS = 54
const DAY_MS = 86_400_000

type CalendarDay = { level: number; title: string } | null

/**
 * GitHub-style grids, one per calendar year from the first year with watch time to
 * this one: a column per week (Sunday first), days outside the year or still to come
 * left blank. Levels are scaled across the whole history so years compare. Days are
 * UTC to match the server's `daily` keys.
 */
const calendarYears = computed(() => {
  const daily = profile.value?.stats?.daily || {}
  const now = new Date()
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const thisYear = now.getUTCFullYear()
  const firstYear = Math.min(
    thisYear,
    ...Object.keys(daily)
      .map((key) => Number(key.slice(0, 4)))
      .filter(Number.isFinite),
  )
  const max = Math.max(1, ...Object.values(daily))

  const years = []
  for (let year = firstYear; year <= thisYear; year += 1) {
    const jan1 = Date.UTC(year, 0, 1)
    const start = jan1 - new Date(jan1).getUTCDay() * DAY_MS
    let total = 0
    const weeks: CalendarDay[][] = []
    const months: Array<{ column: number; text: string }> = []
    for (let column = 0; column < CALENDAR_WEEKS; column += 1) {
      const week: CalendarDay[] = []
      for (let row = 0; row < 7; row += 1) {
        const time = start + (column * 7 + row) * DAY_MS
        const date = new Date(time)
        if (date.getUTCFullYear() !== year || time > today) {
          week.push(null)
          continue
        }
        const minutes = daily[date.toISOString().slice(0, 10)] || 0
        total += minutes
        const dateLabel = date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          timeZone: 'UTC',
        })
        week.push({
          level: minutes ? Math.min(4, Math.ceil((minutes / max) * 4)) : 0,
          title: minutes
            ? `${formatWatchTime(minutes)} on ${dateLabel}`
            : `Nothing on ${dateLabel}`,
        })
        if (date.getUTCDate() === 1) {
          months.push({
            column,
            text: date.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }),
          })
        }
      }
      weeks.push(week)
    }
    years.push({ year, weeks, months, totalLabel: formatWatchTime(total) })
  }
  return years
})

/** The year grid in view; the scroller holds one year per screen width. */
const calendarScroller = ref<HTMLElement | null>(null)
const visibleCalendarIndex = ref(0)
const visibleCalendarYear = computed(
  () =>
    calendarYears.value[visibleCalendarIndex.value] ??
    calendarYears.value[calendarYears.value.length - 1]!,
)

const onCalendarScroll = () => {
  const el = calendarScroller.value
  if (!el?.clientWidth) return
  const index = Math.round(el.scrollLeft / el.clientWidth)
  visibleCalendarIndex.value = Math.min(Math.max(index, 0), calendarYears.value.length - 1)
}

/** Open the calendar on the current year (the right end). */
watch(
  () => [activeTab.value, calendarYears.value.length] as const,
  async () => {
    visibleCalendarIndex.value = calendarYears.value.length - 1
    await nextTick()
    const el = calendarScroller.value
    if (el) el.scrollLeft = el.scrollWidth
  },
  { immediate: true },
)

const genreBars = computed(() => {
  const rows = profile.value?.stats?.genres || []
  const max = Math.max(1, ...rows.map((row) => row.minutes))
  return rows.map((row) => ({
    name: row.name,
    hours: formatWatchTime(row.minutes),
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
    { key: 'on_hold', label: 'On Hold', count: totals.onHold ?? 0 },
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
  draftEmblem.value = emblemChoice.value
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
    const emblemChanged = draftEmblem.value !== emblemChoice.value
    const [response] = await Promise.all([
      profileAPI.updateSettings({ settings: draft.value, bio: draftBio.value }),
      authStore.updateProfile({ preferences }),
      emblemChanged ? profileAPI.setFeaturedBadge(draftEmblem.value || null) : null,
    ])
    if (emblemChanged) await badgesStore.load(true)
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

const handleImageError = showPosterPlaceholder
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
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 128px;
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
  overflow-wrap: anywhere;
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
  width: 100%;
  margin-top: 1rem;
}

.badges-title {
  margin: 0 0 0.45rem;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  text-align: center;
  color: var(--text-muted);
}

.badge-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.4rem;
}

.badge-card {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-parchment);
  font-size: 1.1rem;
  cursor: default;
  outline: none;
  transition:
    transform 0.15s ease,
    border-color 0.15s ease;
}

.badge-card:hover,
.badge-card:focus-visible {
  transform: translateY(-2px);
  border-color: var(--border-hover);
}

.badge-card.featured {
  border-color: var(--border-hover);
  box-shadow: 0 0 0 3px rgba(224, 122, 95, 0.12);
}

.badge-featured {
  position: absolute;
  top: -0.35rem;
  right: -0.3rem;
  font-size: 0.65rem;
  line-height: 1;
  color: var(--coral-primary);
}

.badge-tooltip {
  position: absolute;
  bottom: calc(100% + 0.5rem);
  left: 50%;
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.1rem;
  min-width: max-content;
  max-width: 14rem;
  padding: 0.4rem 0.65rem;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: var(--navbar-primary);
  box-shadow: var(--shadow-md);
  text-align: center;
  opacity: 0;
  visibility: hidden;
  transform: translate(-50%, 4px);
  transition:
    opacity 0.15s ease,
    transform 0.15s ease,
    visibility 0.15s;
  pointer-events: none;
}

.badge-tooltip::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  margin-left: -5px;
  border: 5px solid transparent;
  border-top-color: var(--navbar-primary);
}

.badge-card:hover .badge-tooltip,
.badge-card:focus-visible .badge-tooltip {
  opacity: 1;
  visibility: visible;
  transform: translate(-50%, 0);
}

.badge-name {
  font-size: 0.8rem;
  font-weight: 700;
  color: #fff;
}

.badge-desc {
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.75);
}

.share-btn,
.share-btn:hover {
  color: #2f7fd6;
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
  color: var(--profile-on-accent, #fff);
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
  grid-template-columns: minmax(0, 1fr);
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

.watchlist-tools {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.75rem;
  margin: 1rem 0;
}

.watchlist-tools {
  --list-search-accent: var(--profile-accent);
}

.watchlist-tools :deep(.sort-by-controls) {
  min-width: 220px;
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
  color: var(--profile-on-accent, #fff);
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

.status-on_hold {
  background: var(--warning-color);
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
  min-width: 0;
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

.heatmap-scroll {
  display: flex;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  overscroll-behavior-x: contain;
  padding-bottom: 0.6rem;
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--profile-accent) 55%, transparent) transparent;
}

.heatmap-scroll::-webkit-scrollbar {
  height: 4px;
}

.heatmap-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.heatmap-scroll::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: color-mix(in srgb, var(--profile-accent) 55%, transparent);
}

.heatmap {
  position: relative;
  flex: 0 0 max(100%, 560px);
  scroll-snap-align: start;
  display: grid;
  grid-template-columns: 2rem repeat(54, minmax(0, 1fr));
  grid-template-rows: auto repeat(7, auto);
  gap: 3px;
  isolation: isolate;
}

/* Shadow year: a large, faint numeral behind each year's grid. */
.heatmap-year {
  position: absolute;
  inset: 1.1rem 0 0 2rem;
  z-index: -1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-display);
  font-size: clamp(4rem, 14vw, 9rem);
  font-weight: 800;
  letter-spacing: 0.04em;
  line-height: 1;
  color: color-mix(in srgb, var(--profile-accent) 14%, transparent);
  pointer-events: none;
  user-select: none;
}

.heatmap-month,
.heatmap-day {
  font-size: 0.72rem;
  color: var(--text-muted);
  line-height: 1;
}

.heatmap-month {
  grid-row: 1;
  white-space: nowrap;
  padding-bottom: 0.3rem;
}

.heatmap-day {
  grid-column: 1;
  align-self: center;
}

.heatmap-cell {
  aspect-ratio: 1;
  border-radius: 3px;
  /* Translucent so the shadow year shows through empty days. */
  background: color-mix(in srgb, var(--bg-muted, var(--bg-hover)) 70%, transparent);
  outline: 1px solid color-mix(in srgb, var(--border-color) 60%, transparent);
  outline-offset: -1px;
}

.heatmap-cell.empty {
  visibility: hidden;
}

.heatmap-cell.level-1 {
  background: color-mix(in srgb, var(--profile-accent) 30%, transparent);
}

.heatmap-cell.level-2 {
  background: color-mix(in srgb, var(--profile-accent) 55%, transparent);
}

.heatmap-cell.level-3 {
  background: color-mix(in srgb, var(--profile-accent) 78%, transparent);
}

.heatmap-cell.level-4 {
  background: var(--profile-accent);
}

.heatmap-legend {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  margin-top: 0.6rem;
  font-size: 0.72rem;
  color: var(--text-muted);
}

.heatmap-legend .heatmap-cell {
  width: 11px;
}

.rating-chart {
  display: grid;
  gap: 0.5rem;
  align-items: end;
  grid-template-columns: repeat(10, minmax(0, 1fr));
  height: 110px;
  margin-top: 0.75rem;
}

.rating-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
  height: 100%;
  min-width: 0;
}

.rating-track {
  flex: 1;
  width: 100%;
  display: flex;
  align-items: flex-end;
}

.rating-bar {
  width: 100%;
  min-height: 2px;
  border-radius: 4px 4px 0 0;
  background: color-mix(in srgb, var(--profile-accent) 70%, var(--teal-primary));
  transition: height 0.3s ease;
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

.field-note {
  color: var(--text-muted);
  font-size: 0.8rem;
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

.swatches {
  flex-wrap: wrap;
  align-items: center;
}

.swatch-wheel {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: conic-gradient(
    #ff4d4d,
    #ffb84d,
    #f5f54d,
    #4dff88,
    #4dd8ff,
    #6d6dff,
    #d64dff,
    #ff4d4d
  );
  overflow: hidden;
}

.wheel-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid #fff;
  pointer-events: none;
}

/* The native picker covers the swatch invisibly so a click opens it. */
.wheel-input {
  position: absolute;
  inset: -4px;
  width: calc(100% + 8px);
  height: calc(100% + 8px);
  opacity: 0;
  cursor: pointer;
}

.custom-hex {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.8rem;
  color: var(--text-secondary);
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

  .hero-info {
    align-self: stretch;
  }

  .hero-info h1 {
    font-size: clamp(1.5rem, 7vw, 2rem);
  }

  .hero-name-row,
  .genre-tags {
    justify-content: center;
  }

  .avatar {
    width: auto;
  }

  .bio {
    margin-left: auto;
    margin-right: auto;
  }

  .stat-cards {
    grid-template-columns: minmax(0, 1fr);
  }

  .poster-grid {
    grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  }
}
</style>
