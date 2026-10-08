/**
 * index.ts — shared frontend types.
 *
 * Domain and API request/response shapes used by Pinia stores, the Axios
 * client, and Vue views.
 */

import type { UnifiedContent } from './content'
import type { WatchlistStatus } from '@/utils/watchlist'

export interface WatchlistItem {
  content: UnifiedContent
  status: WatchlistStatus
  rating?: number
  currentEpisode: number
  currentSeason?: number
  totalEpisodes?: number
  totalSeasons?: number
  notes?: string
  /** `YYYY-MM-DD` the user started / finished the title (imported lists carry these). */
  startedOn?: string | null
  completedOn?: string | null
  rewatchCount?: number
  addedAt: string
  updatedAt: string
}

export interface User {
  id: string
  username: string
  email: string
  isDemoAccount?: boolean
  isAdmin?: boolean
  /** Admins and Developer-badge holders can edit catalog content. */
  canEditContent?: boolean
  role?: 'user' | 'admin' | 'creator'
  profilePicture?: string
  createdAt?: string
  /** When the user last finished a watchlist import; null if they never have. */
  watchlistImportedAt?: string | null
  preferences?: {
    favoriteGenres: string[]
  }
  watchlist?: WatchlistItem[]
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface RegisterData {
  username: string
  email: string
  password: string
}

export interface UpdateProfileData {
  username?: string
  email?: string
  /** Required by the server when `email` changes. */
  currentPassword?: string
  profilePicture?: string | null
  preferences?: {
    favoriteGenres: string[]
  }
}

export interface WatchlistData {
  contentId: string
  status?: WatchlistStatus
  rating?: number
  currentEpisode?: number
  currentSeason?: number
  notes?: string
  startedOn?: string | null
  completedOn?: string | null
  rewatchCount?: number
}

export type WatchlistImportSource = 'anilist' | 'mal' | 'mal_file' | 'tmdb'

/** One site to import: the connected account, a username, or a MAL export file. */
export interface WatchlistImportSourceRequest {
  source: WatchlistImportSource
  /** Read the user's connected account on that site (TMDB can only be read this way). */
  connected?: boolean
  username?: string
  /** MAL export: the XML text, or the `.xml.gz` as base64. */
  file?: { xml?: string; gzipBase64?: string }
}

export type ConnectionProvider = 'anilist' | 'mal' | 'tmdb'

/** A site the user can link, and their link to it if any. */
export interface AccountConnection {
  provider: ConnectionProvider
  label: string
  /** `two-way`: changes flow both ways; `push`: AniLounge only sends changes to it. */
  sync: 'two-way' | 'push'
  /** False when the server has no keys for this site. */
  available: boolean
  connected: boolean
  username: string | null
  externalId: string | null
  connectedAt: string | null
  lastSyncedAt: string | null
  lastError: string | null
  /** AniList sign-ins last a year; after this the user reconnects. */
  expiresAt: string | null
}

export interface WatchlistImportRequest {
  /** Run AniList, then MyAnimeList, then TMDB, whatever order they're sent in. */
  sources: WatchlistImportSourceRequest[]
  addMissing?: boolean
}

export interface WatchlistImportResult {
  total: number
  matched: number
  added: number
  unchanged: number
  /** Titles held back for the user to pick a version. */
  conflicts: number
  rated: number
  catalogAdded: number
  /** Titles AniLounge already had under another id, now linked to AniList. */
  catalogLinked?: number
  notFound: number
  notFoundTitles: string[]
}

export interface WatchlistImportJob {
  sources: WatchlistImportSource[]
  /** The source being read right now (or last read). */
  source: WatchlistImportSource | null
  state: 'running' | 'done' | 'failed'
  phase: 'reading' | 'matching' | 'adding' | 'saving' | null
  done: number
  total: number
  sourceResults: { source: WatchlistImportSource; entries: number; error: string | null }[]
  result: WatchlistImportResult | null
  error: string | null
  startedAt: string
  finishedAt: string | null
}

/** One version of a clashing title: what one or more sources say. */
export interface ImportConflictOption {
  /** Sources joined with `+`, e.g. `anilist+mal`; send it back to pick this version. */
  key: string
  sources: WatchlistImportSource[]
  status: WatchlistStatus
  currentEpisode: number
  score: number | null
  startedOn: string | null
  completedOn: string | null
  rewatchCount: number
}

export interface ImportConflict {
  contentId: string
  title: string
  posterPath: string
  contentType: string
  episodeCount: number | null
  /** The user's watchlist row now, or null when the title isn't on it. */
  current: { status: WatchlistStatus; currentEpisode: number; score: number | null } | null
  options: ImportConflictOption[]
}

export interface UpdateWatchlistData {
  status?: WatchlistStatus
  rating?: number
  currentEpisode?: number
  currentSeason?: number
  notes?: string
  startedOn?: string | null
  completedOn?: string | null
  rewatchCount?: number
}

export interface ContentParams {
  page?: number
  limit?: number
  type?: string
  tab?: string
}
