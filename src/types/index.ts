export interface Genre {
  id: number
  name: string
  _id?: string
}

export interface User {
  id: string
  username: string
  email: string
  preferences?: {
    favoriteGenres: string[]
    favoriteStudios: string[]
  }
  watchlist?: string[]
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
  releaseDate: string
  contentType: 'movie'
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
  releaseDate: string
  contentType: 'tv'
  genres: Genre[]
  adult: boolean
  originalLanguage: string
  popularity: number
  voteAverage: number
  voteCount: number
  numberOfSeasons?: number
  numberOfEpisodes?: number
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
