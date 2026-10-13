<!--
  Profile.vue — user profile view.

  Serves both `/profile` (the signed-in user) and the shareable `/u/:username`.
  A customizable hero (accent, headline, bio) sits above Favorites, Watchlist,
  Stats, and Forum (the user's posts and comments) tabs whose order, default, and
  visibility the owner controls from the Customize panel (ProfileCustomizePanel),
  which also edits the picture, badge, avatar frame, and favorite genres. Favorite
  studios come only from hearting a studio's page. Data comes from `/users/:username`,
  which hides private profiles and hidden tabs from visitors.
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
        <h2>Profile Unavailable</h2>
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
                :accent="profile.settings.accent"
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
                    tabindex="0"
                    :aria-label="badge.label"
                  >
                    <BadgeEmblem :badge="badge.id" size="md" :tooltip="false" />
                    <!-- Shown on hover / keyboard focus. -->
                    <span class="badge-tooltip" role="tooltip">
                      <span class="badge-name">{{ badge.label }}</span>
                      <span v-if="badge.description" class="badge-desc">{{
                        badge.description
                      }}</span>
                    </span>
                  </li>
                </ul>
              </section>
            </div>

            <!-- Title: Name and Bio -->
            <div class="hero-info">
              <div class="hero-name-row">
                <h1 data-testid="profile-username">
                  {{ profile.user.username }}
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

              <!-- Title: Connected Accounts -->
              <ul
                v-if="profile.connections?.length"
                class="connection-links"
                data-testid="profile-connections"
              >
                <li v-for="link in profile.connections" :key="link.provider">
                  <a
                    :href="link.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="connection-link"
                    :title="`${link.username} on ${link.label}`"
                    :aria-label="`${link.username} on ${link.label}`"
                  >
                    <img
                      :src="`/${CONNECTION_LOGOS[link.provider]}`"
                      alt=""
                      class="connection-logo"
                    />
                    <span class="connection-name">{{ link.username }}</span>
                  </a>
                </li>
              </ul>
            </div>

            <!-- Title: Actions -->
            <div class="hero-actions">
              <button
                type="button"
                class="btn btn-secondary share-btn"
                data-testid="share-profile"
                @click="shareProfile"
              >
                Share
              </button>
              <FriendButton
                v-if="profile.relationship && !profile.blocked && !profile.isBot"
                :user-id="profile.user.id"
                :username="profile.user.username"
                :relationship="profile.relationship"
                @update:relationship="(value) => profile && (profile.relationship = value)"
              />
              <router-link
                v-if="
                  (profile.canMessage ?? profile.relationship === 'friends') && !profile.blocked
                "
                :to="{ name: 'friends', query: { user: profile.user.id } }"
                class="btn btn-secondary"
                data-testid="message-friend"
              >
                Message
              </router-link>
              <button
                v-if="profile.relationship && !profile.isBot && !authStore.isDemoUser"
                type="button"
                class="btn btn-secondary"
                :disabled="blocking"
                data-testid="block-user"
                @click="toggleBlock"
              >
                {{ profile.blocked ? 'Unblock' : 'Block' }}
              </button>
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
              Tap Favorite on a title's page, or the heart on your watchlist, to start collecting
              favorites.
            </p>
            <p v-else>No favorites yet.</p>
          </div>

          <div
            v-for="group in favoriteGroups"
            :key="group.key"
            class="favorite-group"
            :data-testid="`favorites-${group.key}`"
          >
            <div class="favorite-group-head">
              <h3>
                {{ group.label }}
                <span v-if="profile.isOwner" class="favorite-count"
                  >{{ group.items.length }}/{{ FAVORITES_MAX }}</span
                >
              </h3>
              <div v-if="profile.isOwner" class="favorite-group-actions">
                <template v-if="reordering === group.key">
                  <button
                    type="button"
                    class="btn btn-secondary btn-small"
                    :disabled="savingOrder"
                    @click="cancelReorder"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    class="btn btn-primary btn-small"
                    :disabled="savingOrder"
                    data-testid="favorites-save-order"
                    @click="saveOrder(group.key)"
                  >
                    Save order
                  </button>
                </template>
                <button
                  v-else-if="group.items.length > 1"
                  type="button"
                  class="btn btn-secondary btn-small"
                  :disabled="Boolean(reordering)"
                  :data-testid="`favorites-reorder-${group.key}`"
                  @click="startReorder(group.key)"
                >
                  Reorder
                </button>
              </div>
            </div>
            <p v-if="reordering === group.key" class="favorite-note">
              Drag to reorder, or use the arrows.
              <template v-if="group.items.length > FAVORITES_MAX">
                Only the first {{ FAVORITES_MAX }} show on your profile.
              </template>
            </p>
            <p
              v-else-if="profile.isOwner && group.items.length > FAVORITES_MAX"
              class="favorite-note"
            >
              {{ group.items.length - FAVORITES_MAX }} more over the top-{{ FAVORITES_MAX }} limit
              {{ group.items.length - FAVORITES_MAX === 1 ? "isn't" : "aren't" }} shown. Reorder to
              pick which show, or remove some.
            </p>

            <div
              class="favorite-grid"
              :class="{
                'entity-grid': !isTitleGroup(group.key),
                reordering: reordering === group.key,
              }"
            >
              <div
                v-for="(item, index) in shownFavorites(group)"
                :key="item._id"
                class="favorite-slot"
                :class="{
                  dragging: reordering === group.key && dragIndex === index,
                  'over-limit': index >= FAVORITES_MAX,
                }"
                :draggable="reordering === group.key"
                :data-slot-index="index"
                data-testid="favorite-slot"
                @dragstart="onDragStart(index, $event)"
                @dragover="onDragOver(index, $event)"
                @dragend="dragIndex = null"
                @touchstart="onTouchStart(index, $event)"
                @touchmove="onTouchMove"
                @touchend="onTouchEnd"
                @touchcancel="onTouchEnd"
              >
                <span class="slot-rank-badge" data-testid="favorite-rank">#{{ index + 1 }}</span>
                <div
                  v-if="isTitleGroup(group.key)"
                  class="favorite-title-card"
                  @click="reordering !== group.key && openContent(asTitle(item))"
                >
                  <div class="poster">
                    <img
                      :src="getPosterUrl(asTitle(item).posterPath || '')"
                      :alt="getDisplayTitle(asTitle(item))"
                      @error="handleImageError"
                    />
                  </div>
                  <span class="card-title">{{ getDisplayTitle(asTitle(item)) }}</span>
                  <span class="card-meta">{{
                    getContentTypeDisplay(asTitle(item).contentType)
                  }}</span>
                </div>
                <button
                  v-else
                  type="button"
                  class="favorite-entity-card"
                  :class="{ 'studio-card': group.key === 'studios' }"
                  @click="reordering !== group.key && openEntity(asEntity(item))"
                >
                  <img
                    v-if="asEntity(item).imagePath"
                    :src="getPosterUrl(asEntity(item).imagePath || '')"
                    :alt="asEntity(item).name"
                    referrerpolicy="no-referrer"
                  />
                  <div v-else class="favorite-entity-placeholder">
                    {{ asEntity(item).name.charAt(0) }}
                  </div>
                  <span class="card-title">{{ asEntity(item).name }}</span>
                </button>

                <div v-if="reordering === group.key" class="slot-controls">
                  <button
                    type="button"
                    class="slot-move"
                    :disabled="index === 0"
                    :aria-label="`Move ${favoriteName(item)} earlier`"
                    @click="moveFavorite(index, -1)"
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    class="slot-move"
                    :disabled="index === orderDraft.length - 1"
                    :aria-label="`Move ${favoriteName(item)} later`"
                    @click="moveFavorite(index, 1)"
                  >
                    →
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Title: Watchlist Tab -->
        <section
          v-else-if="activeTab === 'watchlist' && profile.watchlist"
          class="tab-panel"
          data-testid="panel-watchlist"
        >
          <WatchlistFilters
            v-model:status="watchlistFilter"
            v-model:type="watchlistTypeFilter"
            :rows="watchlistFilterRows"
          />

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
              :options="watchlistSortOptions"
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
              <span class="stat-number">{{ profile.stats.totals.completedMovies }}</span>
              <span class="stat-label">Movies completed</span>
            </div>
            <div class="stat-tile">
              <span class="stat-number">{{ profile.stats.totals.completedSeries }}</span>
              <span class="stat-label">Series completed</span>
            </div>
            <div class="stat-tile">
              <span class="stat-number">{{ profile.stats.totals.episodesWatched }}</span>
              <span class="stat-label">Episodes watched</span>
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
                {{ visibleCalendarYear.totalLabel }} Watched In {{ visibleCalendarYear.year }}
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
              <h3>Most Watched Genres</h3>
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
              <h3>Watchlist Breakdown</h3>
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

              <h3 class="sub-heading">Ratings Given</h3>
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

        <!-- Title: Forum Tab -->
        <section v-else-if="activeTab === 'forum'" class="tab-panel" data-testid="panel-forum">
          <ProfileForum :username="profile.user.username" />
        </section>

        <!-- Title: Friends Tab -->
        <section
          v-else-if="activeTab === 'friends' && profile.friends"
          class="tab-panel"
          data-testid="panel-friends"
        >
          <ul v-if="profile.friends.length" class="friends-grid">
            <li v-for="friend in profile.friends" :key="friend.user.id">
              <router-link
                :to="{ name: 'publicProfile', params: { username: friend.user.username } }"
                class="friend-card"
                data-testid="profile-friend"
              >
                <UserAvatar
                  :src="friend.user.profilePicture"
                  :name="friend.user.username"
                  :size="48"
                />
                <span class="friend-name">{{ friend.user.username }}</span>
              </router-link>
            </li>
          </ul>
          <div v-else class="empty-panel">
            <p>{{ profile.isOwner ? 'No friends yet.' : 'No friends to show yet.' }}</p>
            <router-link
              v-if="profile.isOwner"
              :to="{ name: 'friends', query: { tab: 'friends' } }"
              class="btn btn-secondary btn-small"
              >Find people</router-link
            >
          </div>
        </section>
      </template>
    </div>

    <!-- Customize -->
    <!-- Title: Customize Panel -->
    <ProfileCustomizePanel
      v-if="showCustomize && profile"
      :settings="profile.settings"
      :bio="profile.user.bio || ''"
      :genres="profile.user.preferences.favoriteGenres"
      :emblem-badges="emblemBadges"
      :username="profile.user.username"
      :picture="profile.user.profilePicture ?? null"
      :tab-labels="TAB_LABELS"
      :saving="isSaving"
      :is-demo-user="authStore.isDemoUser"
      @close="showCustomize = false"
      @save="saveCustomize"
      @picture="onPictureChanged"
    />
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
  blocksAPI,
  getContentTypeDisplay,
  getDetailsRouteName,
  getPosterUrl,
  profileAPI,
} from '@/services/api'
import { getRatingColor, getRatingTextStyle } from '@/utils/ratingColors'
import { getDisplayTitle } from '@/utils/titles'
import {
  getWatchlistStatusLabel,
  matchesStatusChips,
  matchesTypeChips,
  type WatchlistStatus,
  type WatchlistTypeChoice,
} from '@/utils/watchlist'
import WatchlistFilters from '@/components/WatchlistFilters.vue'
import SortByControls from '@/components/SortByControls.vue'
import ListSearch from '@/components/ListSearch.vue'
import { applySort, type SortByOption, type SortDirection } from '@/utils/sorting'
import { getTotalVoteCount } from '@/utils/ratings'
import { getSearchCategoryDate } from '@/utils/searchFilters'
import ProfileCustomizePanel, { type CustomizeResult } from '@/components/ProfileCustomizePanel.vue'
import UserAvatar from '@/components/UserAvatar.vue'
import BadgeEmblem from '@/components/BadgeEmblem.vue'
import { useBadgesStore } from '@/stores/badges'
import { badgeInfo } from '@/utils/badges'
import { accentColor, readableOn } from '@/utils/accent'
import FriendButton from '@/components/FriendButton.vue'
import { haptic, shareLink } from '@/utils/nativeApp'
import ProfileForum from '@/components/ProfileForum.vue'
import { apiErrorMessage } from '@/utils/social'
import type { CatalogEntity, UnifiedContent } from '@/types/content'
import type {
  ProfileSettings,
  ProfileTab,
  PublicProfile,
  PublicWatchlistEntry,
} from '@/types/profile'
import { usePageTitle } from '@/composables/usePageMeta'

defineOptions({ name: 'ProfilePage' })

const TAB_LABELS: Record<ProfileTab, string> = {
  favorites: 'Favorites',
  watchlist: 'Watchlist',
  stats: 'Stats',
  forum: 'Forum',
  friends: 'Friends',
}

const route = useRoute()
const router = useRouter()
const toast = useToast()
const authStore = useAuthStore()
const favoritesStore = useFavoritesStore()

const profile = ref<PublicProfile | null>(null)
const isLoading = ref(true)
const activeTab = ref<ProfileTab>('favorites')
const watchlistFilter = ref<WatchlistStatus[]>([])
const watchlistTypeFilter = ref<WatchlistTypeChoice[]>([])
const watchlistQuery = ref('')
const watchlistSortBy = ref<SortByOption>('relevance')
const watchlistSortDirection = ref<SortDirection>('desc')
/**
 * "Relevance" here is recency: the order titles were last updated. The rating is the
 * profile owner's: "Your rating" on your own profile, "<name>'s rating" on someone else's.
 */
const watchlistSortOptions = computed<{ value: SortByOption; label: string }[]>(() => [
  { value: 'relevance', label: 'Last updated' },
  { value: 'alphabetical', label: 'Alphabetical' },
  {
    value: 'rating',
    label: profile.value?.isOwner
      ? 'Your rating'
      : `${profile.value?.user.username ?? 'Their'}'s rating`,
  },
  { value: 'popularity', label: 'Popularity' },
  { value: 'date', label: 'Release date' },
])

const showCustomize = ref(false)
const isSaving = ref(false)

const username = computed(() =>
  typeof route.params.username === 'string' ? route.params.username : authStore.user?.username,
)
usePageTitle(() => username.value ?? 'Profile')

const accentStyle = computed(() => {
  const accent = profile.value?.settings.accent
  return { '--profile-accent': accentColor(accent), '--profile-on-accent': readableOn(accent) }
})

const CONNECTION_LOGOS = {
  anilist: 'anilist-logo.svg',
  mal: 'mal-logo.svg',
  tmdb: 'tmdb-logo.svg',
} as const

const favoriteGenres = computed(() => profile.value?.user.preferences.favoriteGenres || [])

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

const isTab = (value: unknown): value is ProfileTab =>
  typeof value === 'string' && value in TAB_LABELS

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

/** Favorites shown per category: a ranked top 10 (the server enforces the same cap). */
const FAVORITES_MAX = 10

type FavoriteKey = 'movies' | 'series' | 'characters' | 'voiceActors' | 'studios'
type FavoriteItem = UnifiedContent | CatalogEntity
/** Movies and series are both ranked from `favorites.content`, split by type. */
const isTitleGroup = (key: FavoriteKey) => key === 'movies' || key === 'series'
const sourceKey = (key: FavoriteKey) => (isTitleGroup(key) ? 'content' : key)
interface FavoriteGroup {
  key: FavoriteKey
  label: string
  items: FavoriteItem[]
}

const favoriteGroups = computed<FavoriteGroup[]>(() => {
  const favorites = profile.value?.favorites
  if (!favorites) return []
  const groups: FavoriteGroup[] = [
    {
      key: 'movies',
      label: 'Movies',
      items: favoriteTitles.value.filter((item) => item.contentType === 'movie'),
    },
    {
      key: 'series',
      label: 'Series',
      items: favoriteTitles.value.filter((item) => item.contentType !== 'movie'),
    },
    { key: 'characters', label: 'Characters', items: favorites.characters },
    { key: 'voiceActors', label: 'Voice Actors', items: favorites.voiceActors },
    { key: 'studios', label: 'Studios', items: favorites.studios },
  ]
  return groups.filter((group) => group.items.length)
})

const hasAnyFavorites = computed(() => favoriteGroups.value.length > 0)

const asTitle = (item: FavoriteItem) => item as UnifiedContent
const asEntity = (item: FavoriteItem) => item as CatalogEntity
const favoriteName = (item: FavoriteItem) =>
  'name' in item && item.name ? item.name : getDisplayTitle(asTitle(item))

// Reordering (owner only): one category at a time, as a draft of ids until saved.
const reordering = ref<FavoriteKey | null>(null)
const orderDraft = ref<string[]>([])
const dragIndex = ref<number | null>(null)
const savingOrder = ref(false)

/** The top 10, or every favorite in draft order while that category is being reordered. */
const shownFavorites = (group: FavoriteGroup) => {
  if (reordering.value !== group.key) return group.items.slice(0, FAVORITES_MAX)
  const byId = new Map(group.items.map((item) => [item._id, item]))
  return orderDraft.value.map((id) => byId.get(id)).filter((item) => item !== undefined)
}

const startReorder = (key: FavoriteKey) => {
  const group = favoriteGroups.value.find((entry) => entry.key === key)
  if (!group) return
  orderDraft.value = group.items.map((item) => item._id)
  reordering.value = key
}

const cancelReorder = () => {
  reordering.value = null
  dragIndex.value = null
}

const moveFavorite = (from: number, step: number) => {
  const to = from + step
  if (to < 0 || to >= orderDraft.value.length) return
  const next = [...orderDraft.value]
  const [id] = next.splice(from, 1)
  next.splice(to, 0, id!)
  orderDraft.value = next
}

const onDragStart = (index: number, event: DragEvent) => {
  if (!reordering.value) return
  dragIndex.value = index
  event.dataTransfer?.setData('text/plain', String(index))
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

/** Live reorder: the dragged card takes the slot it's over. */
const onDragOver = (index: number, event: DragEvent) => {
  if (!reordering.value || dragIndex.value === null) return
  event.preventDefault()
  if (index === dragIndex.value) return
  moveFavorite(dragIndex.value, index - dragIndex.value)
  dragIndex.value = index
}

// Touch screens have no drag-and-drop events: a short press picks a card up (a quick
// swipe still scrolls), then it takes the slot under the finger.
const TOUCH_HOLD_MS = 200
const TOUCH_SLOP_PX = 10
let touchTimer: ReturnType<typeof setTimeout> | null = null
let touchStartPoint: { x: number; y: number } | null = null

const clearTouchTimer = () => {
  if (touchTimer) clearTimeout(touchTimer)
  touchTimer = null
}

const onTouchStart = (index: number, event: TouchEvent) => {
  const touch = event.touches[0]
  if (!reordering.value || !touch || event.touches.length > 1) return
  if ((event.target as Element | null)?.closest('button')) return
  touchStartPoint = { x: touch.clientX, y: touch.clientY }
  clearTouchTimer()
  touchTimer = setTimeout(() => {
    dragIndex.value = index
    haptic()
  }, TOUCH_HOLD_MS)
}

const onTouchMove = (event: TouchEvent) => {
  const touch = event.touches[0]
  if (!touch) return
  if (dragIndex.value === null) {
    // Moving before the hold: the finger is scrolling, not dragging.
    const start = touchStartPoint
    if (start && Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > TOUCH_SLOP_PX) {
      clearTouchTimer()
    }
    return
  }
  event.preventDefault()
  const slot = document
    .elementFromPoint(touch.clientX, touch.clientY)
    ?.closest<HTMLElement>('[data-slot-index]')
  const index = Number(slot?.dataset.slotIndex)
  if (!slot || Number.isNaN(index) || index === dragIndex.value) return
  moveFavorite(dragIndex.value, index - dragIndex.value)
  dragIndex.value = index
}

const onTouchEnd = () => {
  clearTouchTimer()
  touchStartPoint = null
  dragIndex.value = null
}

const saveOrder = async (key: FavoriteKey) => {
  const favorites = profile.value?.favorites
  if (!favorites) return
  // Titles un-hearted on this page are already gone server-side; leave them out.
  const ids = orderDraft.value.filter(
    (id) => !isTitleGroup(key) || !favoritesStore.isLoaded || favoritesStore.isFavorite(id),
  )
  savingOrder.value = true
  try {
    await profileAPI.reorderFavorites(ids)
    const source = sourceKey(key)
    const list = favorites[source] as FavoriteItem[]
    const byId = new Map(list.map((item) => [item._id, item]))
    const ordered = ids.map((id) => byId.get(id)).filter((item) => item !== undefined)
    const rest = list.filter((item) => !ids.includes(item._id))
    ;(favorites[source] as FavoriteItem[]) = [...ordered, ...rest]
    cancelReorder()
    toast.success('Favorites reordered')
  } catch (error) {
    toast.error(apiErrorMessage(error, 'Could not save the new order'))
  } finally {
    savingOrder.value = false
  }
}

// ---------------------------------------------------------------------------
// Watchlist
// ---------------------------------------------------------------------------

const watchlistFilterRows = computed(() =>
  (profile.value?.watchlist || []).map((row) => ({
    status: row.status,
    contentType: row.content.contentType,
  })),
)

const filteredWatchlist = computed(() => {
  const query = watchlistQuery.value.trim().toLowerCase()
  const rows = (profile.value?.watchlist || []).filter((row) => {
    if (!matchesStatusChips(row.status, watchlistFilter.value)) return false
    if (!matchesTypeChips(row.content.contentType, watchlistTypeFilter.value)) return false
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
  const { username } = profile.value.user
  const url = `${window.location.origin}/u/${encodeURIComponent(username)}`
  const result = await shareLink({ title: `${username} on AniLounge`, url })
  if (result === 'copied') {
    toast.success(
      profile.value.settings.isPublic
        ? 'Profile link copied!'
        : 'Link copied. Your profile is private, so only you can open it.',
    )
  }
  if (result === 'failed') window.prompt('Copy your profile link:', url)
}

const blocking = ref(false)

/** Block or unblock this profile's owner. Blocking also ends any friendship or request. */
const toggleBlock = async () => {
  const current = profile.value
  if (!current || blocking.value) return
  const name = current.user.username
  if (
    !current.blocked &&
    !window.confirm(
      `Block ${name}? You'll stop being friends, neither of you can send the other a ` +
        `request, and you won't see their forum posts or comments. They won't be told.`,
    )
  ) {
    return
  }
  blocking.value = true
  try {
    if (current.blocked) {
      await blocksAPI.unblock(current.user.id)
      current.blocked = false
      toast.success(`${name} is unblocked.`)
    } else {
      await blocksAPI.block(current.user.id)
      current.blocked = true
      current.relationship = 'none'
      toast.success(`${name} is blocked.`)
    }
  } catch (err) {
    toast.error(apiErrorMessage(err, `Couldn't update the block on ${name}. Try again.`))
  } finally {
    blocking.value = false
  }
}

const openCustomize = () => {
  if (profile.value) showCustomize.value = true
}

/** Picture uploads apply immediately; mirror them in the hero. */
const onPictureChanged = (profilePicture: string | null) => {
  if (profile.value) profile.value.user.profilePicture = profilePicture
}

const saveCustomize = async (result: CustomizeResult) => {
  if (!profile.value) return
  isSaving.value = true
  try {
    const preferences = { favoriteGenres: result.genres }
    const genresChanged =
      result.genres.join('|') !== profile.value.user.preferences.favoriteGenres.join('|')
    // The frame and its accent show on avatars everywhere, from the badges list.
    const frameChanged =
      result.settings.accent !== profile.value.settings.accent ||
      result.settings.frame !== profile.value.settings.frame
    // One at a time: each save rewrites the whole user row, so running them together let
    // a stale copy of one overwrite the other's change.
    const response = await profileAPI.updateSettings({
      settings: result.settings,
      bio: result.bio,
    })
    if (genresChanged) await authStore.updateProfile({ preferences })
    if (frameChanged) await badgesStore.load(true)
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
  min-width: 128px;
  margin-top: -56px;
}

.profile-picture {
  border: 4px solid var(--bg-card);
  box-shadow: var(--shadow-md);
}

/* A badge ring keeps its glow alongside the card shadow. */
.profile-picture.ringed {
  box-shadow:
    var(--shadow-md),
    0 0 18px var(--ring-glow);
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
  margin: 0 auto;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.4rem;
  /* Up to five per row. */
  max-width: calc(5 * 2.5rem + 4 * 0.4rem);
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

/* The hero clips overflow: the end badges' tooltips open inward, arrow still on the badge. */
.badge-card:first-child .badge-tooltip {
  left: 0;
  transform: translate(0, 4px);
}

.badge-card:last-child:not(:first-child) .badge-tooltip {
  left: auto;
  right: 0;
  transform: translate(0, 4px);
}

.badge-card:first-child:hover .badge-tooltip,
.badge-card:first-child:focus-visible .badge-tooltip,
.badge-card:last-child:hover .badge-tooltip,
.badge-card:last-child:focus-visible .badge-tooltip {
  transform: translate(0, 0);
}

.badge-card:first-child .badge-tooltip::after {
  left: 1.25rem;
}

.badge-card:last-child:not(:first-child) .badge-tooltip::after {
  left: auto;
  right: 1.25rem;
  margin-left: 0;
  margin-right: -5px;
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

.connection-links {
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin: 0.75rem 0 0;
  padding: 0;
}

.connection-link {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  max-width: 14rem;
  padding: 0.25rem 0.7rem 0.25rem 0.3rem;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 0.8rem;
  font-weight: 600;
  text-decoration: none;
  transition:
    border-color 0.15s ease,
    color 0.15s ease;
}

.connection-link:hover,
.connection-link:focus-visible {
  border-color: var(--border-hover);
  color: var(--text-primary);
}

.connection-logo {
  width: 1.3rem;
  height: 1.3rem;
  flex-shrink: 0;
  border-radius: 50%;
  object-fit: contain;
}

.connection-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.friends-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 0.75rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.friend-card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
  color: var(--text-primary);
  text-decoration: none;
  transition: border-color 0.15s ease;
}

.friend-card:hover {
  border-color: var(--profile-accent);
}

.friend-name {
  min-width: 0;
  overflow: hidden;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
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
.favorite-group-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem 1rem;
  margin-bottom: 0.9rem;
}

.favorite-group h3 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.2rem;
  color: var(--text-primary);
}

.favorite-count {
  margin-left: 0.35rem;
  font-family: var(--font-body);
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted);
}

.favorite-group-actions {
  display: flex;
  gap: 0.5rem;
}

.favorite-note {
  margin: -0.4rem 0 0.9rem;
  color: var(--text-muted);
  font-size: 0.85rem;
}

/* Favorites: a ranked top 10 as a 5 by 2 grid. */
.favorite-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 1rem;
}

.favorite-slot {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-width: 0;
}

.favorite-grid.reordering .favorite-slot {
  cursor: grab;
  /* A held card is picked up, not selected or offered as an image to save. */
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
}

.favorite-grid.reordering .favorite-title-card,
.favorite-grid.reordering .favorite-entity-card {
  cursor: grab;
  pointer-events: none;
}

.favorite-slot.dragging {
  opacity: 0.4;
}

.favorite-slot.over-limit {
  opacity: 0.55;
}

.slot-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
}

/* The slot's place in the ranking, over the card's top-left corner. */
.slot-rank-badge {
  position: absolute;
  top: 0.35rem;
  left: 0.35rem;
  z-index: 2;
  min-width: 1.6rem;
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
  background: rgba(10, 14, 24, 0.78);
  box-shadow: 0 0 0 1px var(--profile-accent, var(--coral-primary));
  color: #fff;
  font-size: 0.72rem;
  font-weight: 700;
  line-height: 1.3;
  text-align: center;
  pointer-events: none;
}

.slot-move {
  width: 1.9rem;
  height: 1.6rem;
  padding: 0;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 0.85rem;
  cursor: pointer;
}

.slot-move:disabled {
  opacity: 0.35;
  cursor: default;
}

.poster-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 1rem;
}

/* Narrower people and studio cards: the 5 by 2 grid holds them at a smaller size. */
.favorite-grid.entity-grid {
  max-width: 720px;
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
.tab-panel :deep(.watchlist-filters) {
  --filter-accent: var(--profile-accent);
  --filter-on-accent: var(--profile-on-accent, #fff);
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
  .genre-tags,
  .connection-links {
    justify-content: center;
  }

  .avatar {
    min-width: 0;
  }

  /* Full width here: one centered row, wrapping only when it runs out of room. */
  .badge-list {
    max-width: none;
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

  .favorite-grid {
    gap: 0.5rem;
  }

  .favorite-grid .card-title {
    font-size: 0.75rem;
  }

  .favorite-grid .card-meta {
    display: none;
  }
}
</style>
