/**
 * content.ts — unified catalog content types.
 *
 * Shared TypeScript shapes for movies, TV, and specials used by stores,
 * views, and display helpers.
 */

export type CatalogEntityType = 'character' | 'voice_actor' | 'studio'

export interface UnifiedContent {
  _id: string
  title: string
  englishTitle?: string
  nativeTitle?: string
  originalTitle?: string
  overview: string
  contentType: 'movie' | 'tv' | 'special' | 'character' | 'voice_actor'
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
  /** ISO 3166-1 alpha-2 origin countries (`JP`, `US`, …). */
  originCountries?: string[]
  startSeasonYear?: number
  startSeason?: 'winter' | 'spring' | 'summer' | 'fall'
  /** Last known air/end date (TMDB `last_air_date` or MAL `end_date`). */
  lastAirDate?: string | Date
  /** Chat recommendation reason grounded in catalog fields. */
  why?: string
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
  /** Present on character / voice-actor / studio search hits. */
  entityType?: CatalogEntityType
  appearances?: EntityAppearance[]
  relationships?: {
    sequels: string[]
    prequels: string[]
    related: string[]
    franchise: string
  }
}

/** Voice/acting credit on a single TV episode. */
export interface EpisodeCastMember {
  name: string
  character: string
  profilePath: string
}

/**
 * Episode card shown on a TV details page (not a standalone catalog type).
 * Expanded in place; there is no episode route.
 */
export interface Episode {
  seasonNumber: number
  episodeNumber: number
  title: string
  overview: string
  stillPath: string
  airDate?: string | null
  runtime?: number | null
  cast: EpisodeCastMember[]
}

export interface UnifiedContentWithScore extends UnifiedContent {
  unifiedScore: number
}

export interface EntityVoiceCredit {
  name: string
  language?: string
  malId?: number
  tmdbId?: number
  imagePath?: string
  entity?: string
}

export interface EntityAppearance {
  content?:
    | string
    | {
        _id: string
        title?: string
        englishTitle?: string
        nativeTitle?: string
        posterPath?: string
        contentType?: 'movie' | 'tv' | 'special'
      }
  character?:
    | string
    | {
        _id: string
        name?: string
        imagePath?: string
        entityType?: CatalogEntityType
      }
  role?: string
  importance?: number
  characterName?: string
  language?: string
  voiceActors?: EntityVoiceCredit[]
}

/** Persisted character, voice actor, or studio with its own detail screen. */
export interface CatalogEntity {
  _id: string
  entityType: CatalogEntityType
  name: string
  englishName?: string
  nativeName?: string
  alternativeNames?: string[]
  about?: string
  imagePath?: string
  malId?: number
  tmdbId?: number
  favoritesCount?: number
  isFavorited?: boolean
  appearances?: EntityAppearance[]
}
