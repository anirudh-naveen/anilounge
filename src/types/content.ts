/**
 * content.ts — unified catalog content types.
 *
 * Shared TypeScript shapes for movies, TV, and specials used by stores,
 * views, and display helpers.
 */

export interface UnifiedContent {
  _id: string
  title: string
  englishTitle?: string
  nativeTitle?: string
  originalTitle?: string
  overview: string
  contentType: 'movie' | 'tv' | 'special'
  posterPath?: string
  backdropPath?: string
  releaseDate?: string | Date
  genres: Array<{ id?: number; name?: string }> | string[]
  voteAverage?: number
  malScore?: number
  /** Vote-weighted average of MAL, TMDB, and Find Animation. */
  unifiedScore?: number
  malStatus?: string
  /** MAL weekly air day (`sunday` … `saturday`, or `other`). */
  broadcastDay?: string
  /** MAL weekly air time (`HH:MM`) in JST. */
  broadcastTime?: string
  nextEpisodeAirDate?: string | Date
  nextEpisodeNumber?: number
  nextEpisodeSeason?: number
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
  /** `'tmdb'` or `'mal'` on external search results. */
  source?: string
  relationships?: {
    sequels: string[]
    prequels: string[]
    related: string[]
    franchise: string
  }
}

export interface UnifiedContentWithScore extends UnifiedContent {
  unifiedScore: number
}
