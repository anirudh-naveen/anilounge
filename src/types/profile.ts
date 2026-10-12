/**
 * profile.ts — public profile payloads (`/users/:username`, `/profile/settings`).
 */

import type { CatalogEntity, UnifiedContent } from '@/types/content'
import type { WatchlistStatus } from '@/utils/watchlist'
import type { PublicUser, Relationship } from '@/types/social'

export type ProfileTab = 'favorites' | 'watchlist' | 'stats' | 'forum' | 'friends'
export type ProfilePresetAccent = 'coral' | 'teal' | 'violet' | 'gold' | 'rose' | 'sky' | 'silver'
/** A preset name, or a custom `#rrggbb` color from the color wheel. */
export type ProfileAccent = ProfilePresetAccent | `#${string}`

export interface ProfileSettings {
  isPublic: boolean
  /** null = never picked: the profile and avatar frame use the coral default. */
  accent: ProfileAccent | null
  /** Avatar frame: an emblem badge id, 'user' (plain ring), or null for automatic. */
  frame: string | null
  headline: string
  defaultTab: ProfileTab
  tabOrder: ProfileTab[]
  hiddenTabs: ProfileTab[]
  /** Show linked AniList / MyAnimeList / TMDB accounts in the hero. */
  showConnections: boolean
}

/** A linked account shown on the profile. */
export interface ProfileConnection {
  provider: 'anilist' | 'mal' | 'tmdb'
  label: string
  username: string
  url: string
}

export interface ProfileStats {
  totals: {
    titles: number
    completed: number
    watching: number
    planToWatch: number
    onHold?: number
    dropped: number
    completedSeries: number
    completedMovies: number
    episodesWatched: number
    minutesWatched: number
    averageRating: number | null
    ratedCount: number
  }
  /** Trailing 12 months, oldest first, keyed `YYYY-MM`. */
  monthly: Array<{ month: string; minutes: number }>
  /** Sparse `YYYY-MM-DD` (UTC) -> minutes over the whole watch history. */
  daily?: Record<string, number>
  genres: Array<{ name: string; titles: number; minutes: number }>
  /** Counts for ratings 1 through 10. */
  ratingDistribution: number[]
}

export interface PublicWatchlistEntry {
  content: UnifiedContent
  status: WatchlistStatus
  rating: number | null
  currentEpisode: number
  addedAt: string
  updatedAt: string
}

export interface PublicProfile {
  user: {
    id: string
    username: string
    profilePicture?: string | null
    bio: string
    createdAt?: string
    preferences: { favoriteGenres: string[] }
  }
  settings: ProfileSettings
  /** Linked accounts; empty when the owner hides them. */
  connections?: ProfileConnection[]
  isOwner: boolean
  /** Signed-in visitor's link to this user; null for the owner and guests. */
  relationship?: Relationship | null
  /** Whether the signed-in visitor blocked this user. */
  blocked?: boolean
  /** Whether the signed-in visitor can message this user (friends, or the support bot). */
  canMessage?: boolean
  /** A bot account (Lounge Keeper / Cleaner / Guide): no friending or blocking, fixed tabs. */
  isBot?: boolean
  /** Tabs in display order; hidden tabs are included only for the owner. The Forum
   * tab loads its posts and comments separately (see ProfileForum.vue). */
  tabs: ProfileTab[]
  favorites: {
    content: UnifiedContent[]
    characters: CatalogEntity[]
    voiceActors: CatalogEntity[]
    studios: CatalogEntity[]
  } | null
  watchlist: PublicWatchlistEntry[] | null
  stats: ProfileStats | null
  /** The owner's friends (Friends tab), alphabetical; null when the tab is hidden. */
  friends?: Array<{ user: PublicUser; since: string }> | null
}
