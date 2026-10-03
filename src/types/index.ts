/**
 * index.ts — shared frontend types.
 *
 * Domain and API request/response shapes used by Pinia stores, the Axios
 * client, and Vue views.
 */

import type { UnifiedContent } from './content'
import type { WatchlistStatus } from '@/utils/watchlist'

export interface Network {
  id: number
  name: string
  logoPath?: string
  originCountry?: string
}

export interface ProductionCompany {
  id: number
  name: string
  logoPath?: string
  originCountry?: string
}

export interface ProductionCountry {
  iso_3166_1: string
  name: string
}

export interface SpokenLanguage {
  iso_639_1: string
  name: string
  englishName?: string
}

export interface UserRating {
  content: string
  rating: number
  review?: string
  createdAt: string
  updatedAt: string
}

export interface Genre {
  id: number
  name: string
  _id?: string
}

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
  preferences?: {
    favoriteGenres: string[]
  }
  watchlist?: WatchlistItem[]
  ratings?: UserRating[]
}

export interface Movie {
  _id: string
  tmdbId: number
  title: string
  englishTitle?: string
  nativeTitle?: string
  originalTitle: string
  overview: string
  posterPath: string
  backdropPath: string
  releaseDate: string | Date
  contentType: 'movie'
  typeIcon?: string
  genres: Genre[]
  adult: boolean
  originalLanguage: string
  popularity: number
  voteAverage: number
  voteCount: number
  runtime?: number
  isAnimated: boolean
  animationType: string
  ageRating: string
  averageUserRating: number
  totalUserRatings: number
  networks: Network[]
  productionCompanies: ProductionCompany[]
  productionCountries: ProductionCountry[]
  spokenLanguages: SpokenLanguage[]
  lastUpdated: string
  createdAt: string
  updatedAt: string
  __v: number
}

export interface TVShow {
  _id: string
  tmdbId: number
  title: string
  englishTitle?: string
  nativeTitle?: string
  originalTitle: string
  overview: string
  posterPath: string
  backdropPath: string
  releaseDate: string | Date
  contentType: 'tv'
  typeIcon?: string
  genres: Genre[]
  adult: boolean
  originalLanguage: string
  popularity: number
  voteAverage: number
  voteCount: number
  numberOfSeasons?: number
  numberOfEpisodes?: number
  status?: string
  createdBy?: Array<{ id: number; name: string }>
  isAnimated: boolean
  animationType: string
  ageRating: string
  averageUserRating: number
  totalUserRatings: number
  networks: Network[]
  productionCompanies: ProductionCompany[]
  productionCountries: ProductionCountry[]
  spokenLanguages: SpokenLanguage[]
  lastUpdated: string
  createdAt: string
  updatedAt: string
  __v: number
}

export type Content = Movie | TVShow

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

export interface WatchlistImportRequest {
  source: WatchlistImportSource
  username?: string
  /** MAL export: the XML text, or the `.xml.gz` as base64. */
  file?: { xml?: string; gzipBase64?: string }
  requestToken?: string
  overwrite?: boolean
  addMissing?: boolean
}

export interface WatchlistImportResult {
  total: number
  matched: number
  added: number
  updated: number
  unchanged: number
  rated: number
  catalogAdded: number
  notFound: number
  notFoundTitles: string[]
}

export interface WatchlistImportJob {
  source: WatchlistImportSource
  state: 'running' | 'done' | 'failed'
  phase: 'reading' | 'matching' | 'adding' | 'saving' | null
  done: number
  total: number
  result: WatchlistImportResult | null
  error: string | null
  startedAt: string
  finishedAt: string | null
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

export interface RateContentData {
  contentId: string
  rating: number
  review?: string
}

export interface ContentParams {
  page?: number
  limit?: number
  type?: string
  tab?: string
}
