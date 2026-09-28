/**
 * profile.ts — public profile payloads (`/users/:username`, `/profile/settings`).
 */

import type { CatalogEntity, UnifiedContent } from '@/types/content'
import type { WatchlistStatus } from '@/utils/watchlist'

export type ProfileTab = 'favorites' | 'watchlist' | 'stats'
export type ProfileAccent = 'coral' | 'teal' | 'violet' | 'gold' | 'rose' | 'sky'

export interface ProfileSettings {
  isPublic: boolean
  accent: ProfileAccent
  headline: string
  defaultTab: ProfileTab
  tabOrder: ProfileTab[]
  hiddenTabs: ProfileTab[]
}

export interface ProfileStats {
  totals: {
    titles: number
    completed: number
    watching: number
    planToWatch: number
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
    preferences: { favoriteGenres: string[]; favoriteStudios: string[] }
  }
  settings: ProfileSettings
  isOwner: boolean
  /** Tabs in display order; hidden tabs are included only for the owner. */
  tabs: ProfileTab[]
  favorites: {
    content: UnifiedContent[]
    characters: CatalogEntity[]
    voiceActors: CatalogEntity[]
    studios: CatalogEntity[]
  } | null
  watchlist: PublicWatchlistEntry[] | null
  stats: ProfileStats | null
}
