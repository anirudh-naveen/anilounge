// Unified content interface - shared across all components
export interface UnifiedContent {
  _id: string
  title: string
  originalTitle?: string
  overview: string
  contentType: 'movie' | 'tv'
  posterPath?: string
  backdropPath?: string
  releaseDate?: string | Date
  genres: Array<{ id?: number; name?: string }> | string[]
  voteAverage?: number
  malScore?: number
  voteCount?: number
  malScoredBy?: number
  runtime?: number
  episodeCount?: number
  malEpisodes?: number
  seasonCount?: number
  studios?: string[]
  productionCompanies?: string[]
  alternativeTitles?: string[]
  tmdbId?: number
  malId?: number
  dataSources?: {
    tmdb?: { hasData?: boolean }
    mal?: { hasData?: boolean }
  }
}
