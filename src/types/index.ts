import type { UnifiedContent } from './content'

export interface Genre {
  id: number
  name: string
  _id?: string
}

export interface WatchlistItem {
  content: UnifiedContent
  status: 'plan_to_watch' | 'watching' | 'completed' | 'dropped'
  rating?: number
  currentEpisode: number
  totalEpisodes?: number
  notes?: string
  addedAt: string
  updatedAt: string
}

export interface User {
  id: string
  username: string
  email: string
  preferences?: {
    favoriteGenres: string[]
    favoriteStudios: string[]
  }
  watchlist?: WatchlistItem[]
  ratings?: any[]
}

export interface Movie {
  _id: string
  tmdbId: number
  title: string
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
  networks: any[]
  productionCompanies: any[]
  productionCountries: any[]
  spokenLanguages: any[]
  lastUpdated: string
  createdAt: string
  updatedAt: string
  __v: number
}

export interface TVShow {
  _id: string
  tmdbId: number
  title: string
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
  networks: any[]
  productionCompanies: any[]
  productionCountries: any[]
  spokenLanguages: any[]
  lastUpdated: string
  createdAt: string
  updatedAt: string
  __v: number
}

export type Content = Movie | TVShow

// API Types
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
  preferences?: {
    favoriteGenres: string[]
    favoriteStudios: string[]
  }
}

export interface WatchlistData {
  contentId: string
  status?: 'plan_to_watch' | 'watching' | 'completed' | 'dropped'
  rating?: number
  currentEpisode?: number
  notes?: string
}

export interface UpdateWatchlistData {
  status?: 'plan_to_watch' | 'watching' | 'completed' | 'dropped'
  rating?: number
  currentEpisode?: number
  notes?: string
}

export interface RateContentData {
  contentId: string
  rating: number
  review?: string
}

export interface ContentParams {
  page?: number
  limit?: number
}
