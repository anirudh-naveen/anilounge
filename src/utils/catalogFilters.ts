/**
 * catalogFilters.ts — the Search filter panel's fields and matching.
 *
 * Genre, language, country, year, season, airing status, and rating range, shared by
 * the Search page and the Watchlist page.
 */

import type { UnifiedContent } from '@/types/content'
import { ratingMatchesFilter } from '@/utils/ratings'
import {
  matchesCountryFilter,
  matchesSeasonFilter,
  matchesStatusFilter,
  matchesYearFilter,
} from '@/utils/searchFilters'

export type CatalogFilters = {
  ratingMin: number
  ratingMax: number
  year: string
  season: string
  status: string
  genre: string
  language: string
  country: string
}

export const GENRE_FILTER_OPTIONS = [
  'Action',
  'Adventure',
  'Comedy',
  'Drama',
  'Fantasy',
  'Mystery',
  'Sci-Fi',
  'Supernatural',
  'Historical',
  'Military',
  'Psychological',
  'Mecha',
  'Samurai',
  'Vampire',
]

export const LANGUAGE_FILTER_OPTIONS = ['Japanese', 'English', 'Korean', 'Chinese']

/** Every filter at Any (1–10 rating). A fresh object each call. */
export const defaultCatalogFilters = (): CatalogFilters => ({
  ratingMin: 1,
  ratingMax: 10,
  year: 'all',
  season: 'all',
  status: 'all',
  genre: 'all',
  language: 'all',
  country: 'all',
})

/** Whether any filter differs from `defaultCatalogFilters()`. */
export const hasActiveCatalogFilters = (filters: CatalogFilters): boolean => {
  const defaults = defaultCatalogFilters()
  return (Object.keys(defaults) as (keyof CatalogFilters)[]).some(
    (key) => filters[key] !== defaults[key],
  )
}

/** Saved filters, keeping each field only when it has the right type (else its default). */
export function readCatalogFilters(saved: unknown): CatalogFilters {
  const filters = defaultCatalogFilters()
  if (!saved || typeof saved !== 'object') return filters
  const raw = saved as Record<string, unknown>
  for (const key of Object.keys(filters) as (keyof CatalogFilters)[]) {
    const value = raw[key]
    if (typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))) {
      if (typeof value === typeof filters[key]) Object.assign(filters, { [key]: value })
    }
  }
  filters.ratingMin = Math.min(10, Math.max(1, Math.round(filters.ratingMin)))
  filters.ratingMax = Math.min(10, Math.max(filters.ratingMin, Math.round(filters.ratingMax)))
  return filters
}

/** Whether a title passes every filter. The full 1–10 rating span includes unrated titles. */
export function matchesCatalogFilters(item: UnifiedContent, filters: CatalogFilters): boolean {
  if (
    !(filters.ratingMin === 1 && filters.ratingMax === 10) &&
    !ratingMatchesFilter(item, filters.ratingMin, filters.ratingMax)
  ) {
    return false
  }
  if (filters.year !== 'all' && !matchesYearFilter(item, filters.year)) return false
  if (filters.season !== 'all' && !matchesSeasonFilter(item, filters.season)) return false
  if (filters.status !== 'all' && !matchesStatusFilter(item, filters.status)) return false

  if (filters.genre !== 'all') {
    if (!Array.isArray(item.genres)) return false
    const hasGenre = item.genres.some(
      (genre) => (typeof genre === 'string' ? genre : genre.name) === filters.genre,
    )
    if (!hasGenre) return false
  }

  // Language is a rough guess: Japanese titles are the ones with MAL data or a Japanese
  // studio; other languages aren't detected yet, so they keep every title.
  if (filters.language === 'Japanese') {
    const japanese =
      item.malId != null ||
      item.studios?.some(
        (studio) =>
          studio.toLowerCase().includes('japan') ||
          studio.toLowerCase().includes('toei') ||
          studio.toLowerCase().includes('madhouse') ||
          studio.toLowerCase().includes('studio ghibli'),
      )
    if (!japanese) return false
  }

  if (filters.country !== 'all' && !matchesCountryFilter(item, filters.country)) return false
  return true
}
