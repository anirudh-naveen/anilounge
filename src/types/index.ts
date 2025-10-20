import type { UnifiedContent } from './content'

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
  status: 'plan_to_watch' | 'watching' | 'completed' | 'dropped'
  rating?: number
  currentEpisode: number
  currentSeason?: number
  totalEpisodes?: number
  totalSeasons?: number
  notes?: string
  addedAt: string
  updatedAt: string
}

export interface User {
  id: string
  username: string
  email: string
  profilePicture?: string
  createdAt?: string
  preferences?: {
    favoriteGenres: string[]
    favoriteStudios: string[]
  }
  watchlist?: WatchlistItem[]
  ratings?: UserRating[]
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
  profilePicture?: string | null
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
  currentSeason?: number
  notes?: string
}

export interface UpdateWatchlistData {
  status?: 'plan_to_watch' | 'watching' | 'completed' | 'dropped'
  rating?: number
  currentEpisode?: number
  currentSeason?: number
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
