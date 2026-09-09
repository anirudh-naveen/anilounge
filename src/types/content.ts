// Unified content interface - shared across all components
export interface UnifiedContent {
  _id: string
  title: string
  originalTitle?: string
  overview: string
  contentType: 'movie' | 'tv' | 'special'
  posterPath?: string
  backdropPath?: string
  releaseDate?: string | Date
  genres: Array<{ id?: number; name?: string }> | string[]
  voteAverage?: number
  malScore?: number
  unifiedScore?: number // Vote-weighted average of MAL, TMDB, and Find Animation
  malStatus?: string
  voteCount?: number
  malScoredBy?: number
  userRatingAverage?: number
  userRatingCount?: number
  runtime?: number
  episodeCount?: number
  malEpisodes?: number
  malMediaType?: string
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
  franchise?: string
  source?: string // 'tmdb' or 'mal' for external search results
  relationships?: {
    sequels: string[]
    prequels: string[]
    related: string[]
    franchise: string
  }
}

// Extended interface for content with unified score
export interface UnifiedContentWithScore extends UnifiedContent {
  unifiedScore: number
}
