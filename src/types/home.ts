/**
 * home.ts — homepage feed payloads (`/home/*`).
 */

import type { WatchlistStatus } from '@/utils/watchlist'

export interface ActivityEntry {
  id: string
  user: {
    _id: string
    username: string
    profilePicture: string | null
    isSelf: boolean
  }
  /** `added` when the row was created at `at`; otherwise an edit. */
  action: 'added' | 'updated'
  status: WatchlistStatus
  currentEpisode: number
  /** Episode reached before the latest progress change (0 for a new series). */
  previousEpisode: number
  rating: number | null
  at: string
  content: {
    _id: string
    title: string
    nativeTitle?: string
    posterPath: string
    contentType: 'movie' | 'tv' | 'special'
    episodeCount: number | null
  }
}

export interface ActivityFeed {
  personal: ActivityEntry[]
  friends: ActivityEntry[]
  friendCount: number
}

export interface ReleaseContent {
  _id: string
  title: string
  englishTitle?: string
  nativeTitle?: string
  posterPath: string
  backdropPath: string
  contentType: 'movie' | 'tv' | 'special'
  malStatus?: string
  releaseDate?: string | null
  broadcastDay?: string
  nextEpisodeAirDate?: string | null
  nextEpisodeNumber?: number | null
  episodeCount?: number | null
}

export interface ReleaseUpdate {
  kind: 'episode' | 'premiere'
  /** Next episode or premiere instant; null for weekly slots and undated premieres. */
  at: string | null
  reason: 'watchlist' | 'related' | 'trending'
  /** Watchlist title a related update was found through. */
  via: { _id: string; title: string } | null
  content: ReleaseContent
}

export interface ReleaseUpdates {
  source: 'watchlist' | 'trending'
  items: ReleaseUpdate[]
}
