/**
 * searchFilters.ts — Search year, season, status, and country-of-origin matching.
 *
 * Year and season can be combined. Status is completed / airing / upcoming.
 * Movies and series both match via an airing/release span.
 */

import { isCurrentlyAiring, isUpcoming, type AiringFields } from '@/utils/airing'

export const ANIME_SEASONS = ['winter', 'spring', 'summer', 'fall'] as const

export type AnimeSeason = (typeof ANIME_SEASONS)[number]

export const ANIME_SEASON_LABELS: Record<AnimeSeason, string> = {
  winter: 'Winter',
  spring: 'Spring',
  summer: 'Summer',
  fall: 'Fall',
}

export type YearSeasonOption = {
  value: string
  label: string
}

export const SEASON_FILTER_OPTIONS: YearSeasonOption[] = [
  { value: 'all', label: 'Any season' },
  ...ANIME_SEASONS.map((season) => ({
    value: season,
    label: ANIME_SEASON_LABELS[season],
  })),
]

export const STATUS_FILTER_OPTIONS: YearSeasonOption[] = [
  { value: 'all', label: 'Any status' },
  { value: 'completed', label: 'Completed' },
  { value: 'airing', label: 'Airing' },
  { value: 'upcoming', label: 'Upcoming' },
]

export const ORIGIN_COUNTRY_OPTIONS = [
  { value: 'JP', label: 'Japan' },
  { value: 'US', label: 'United States' },
  { value: 'KR', label: 'South Korea' },
  { value: 'CN', label: 'China' },
  { value: 'FR', label: 'France' },
  { value: 'CA', label: 'Canada' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'DE', label: 'Germany' },
  { value: 'IT', label: 'Italy' },
  { value: 'ES', label: 'Spain' },
  { value: 'AU', label: 'Australia' },
] as const

export type PeriodFilterFields = AiringFields & {
  releaseDate?: string | Date | null
  lastAirDate?: string | Date | null
  startSeasonYear?: number | null
  startSeason?: string | null
}

const SEASON_START_MONTH: Record<AnimeSeason, number> = {
  winter: 0,
  spring: 3,
  summer: 6,
  fall: 9,
}

const isAnimeSeason = (value: string | null | undefined): value is AnimeSeason =>
  value === 'winter' || value === 'spring' || value === 'summer' || value === 'fall'

export type CountryFilterFields = {
  originCountries?: string[] | null
  malId?: number | null
}

/**
 * Anime season for a 0-based month (Jan–Mar winter, Apr–Jun spring, Jul–Sep summer, Oct–Dec fall).
 * @param month - 0-based month.
 */
export const seasonFromMonth = (month: number): AnimeSeason => {
  if (month <= 2) return 'winter'
  if (month <= 5) return 'spring'
  if (month <= 8) return 'summer'
  return 'fall'
}

/**
 * Parse a catalog date (`YYYY`, `YYYY-MM`, `YYYY-MM-DD`, or Date) as UTC.
 * @param raw - Stored release or last-air value.
 */
export const parseCatalogDate = (raw: string | Date | null | undefined): Date | null => {
  if (!raw) return null
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : raw
  }
  const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?/.exec(String(raw).trim())
  if (!match) {
    const date = new Date(raw)
    return Number.isNaN(date.getTime()) ? null : date
  }
  const year = Number(match[1])
  const month = match[2] ? Number(match[2]) - 1 : 0
  const day = match[3] ? Number(match[3]) : 1
  return new Date(Date.UTC(year, month, day))
}

/**
 * Calendar year/month from a catalog release date. Prefers `YYYY-MM` in date strings.
 * @param item - Catalog fields with an optional release date.
 */
export const getReleaseYearMonth = (
  item: Pick<PeriodFilterFields, 'releaseDate'>,
): { year: number; month: number } | null => {
  const date = parseCatalogDate(item.releaseDate)
  if (!date) return null
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() }
}

function seasonStartDate(year: number, season: AnimeSeason): Date {
  return new Date(Date.UTC(year, SEASON_START_MONTH[season], 1))
}

function seasonRange(year: number, season: AnimeSeason): { start: number; end: number } {
  const startMonth = SEASON_START_MONTH[season]
  return {
    start: Date.UTC(year, startMonth, 1),
    end: Date.UTC(year, startMonth + 3, 0, 23, 59, 59, 999),
  }
}

function rangesOverlap(start: number, end: number, rangeStart: number, rangeEnd: number): boolean {
  return start <= rangeEnd && end >= rangeStart
}

/**
 * Premiere used for Search season buckets and date sort: actual release/air date, else MAL start season.
 * @param item - Catalog date fields.
 */
export const getSearchCategoryDate = (item: PeriodFilterFields): Date | null => {
  const released = parseCatalogDate(item.releaseDate)
  if (released) return released
  if (typeof item.startSeasonYear === 'number' && Number.isFinite(item.startSeasonYear)) {
    if (isAnimeSeason(item.startSeason)) {
      return seasonStartDate(item.startSeasonYear, item.startSeason)
    }
    return new Date(Date.UTC(item.startSeasonYear, 0, 1))
  }
  return null
}

/**
 * Inclusive airing/release span used to place a title into Search season/year buckets.
 * Currently airing titles extend through `from`; upcoming titles stay a single premiere date.
 * @param item - Catalog airing/release fields.
 * @param from - Clock used for "still airing" (defaults to now).
 */
export const getSearchCategorySpan = (
  item: PeriodFilterFields,
  from = new Date(),
): { start: Date; end: Date } | null => {
  const start = getSearchCategoryDate(item)
  if (!start) return null

  if (isUpcoming(item, from) && !isCurrentlyAiring(item, from)) {
    return { start, end: start }
  }

  const lastAir = parseCatalogDate(item.lastAirDate)
  let endMs = lastAir?.getTime() ?? start.getTime()

  if (isCurrentlyAiring(item, from)) {
    const nextAir = parseCatalogDate(item.nextEpisodeAirDate)
    endMs = Math.max(endMs, from.getTime(), nextAir?.getTime() ?? 0)
  }

  if (endMs < start.getTime()) endMs = start.getTime()
  return { start, end: new Date(endMs) }
}

/**
 * Inclusive catalog year bounds from premiere/airing spans (movies and series).
 * @param items - Catalog titles.
 * @param from - Clock used for still-airing spans.
 */
export const getCatalogYearRange = (
  items: PeriodFilterFields[],
  from = new Date(),
): { min: number; max: number } => {
  let min = Infinity
  let max = -Infinity
  for (const item of items) {
    const span = getSearchCategorySpan(item, from)
    if (!span) continue
    min = Math.min(min, span.start.getUTCFullYear())
    max = Math.max(max, span.end.getUTCFullYear())
  }
  const now = from.getUTCFullYear()
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: now, max: now }
  }
  return { min, max: Math.max(max, now) }
}

/**
 * Year dropdown: Any year, then every catalog year newest first.
 * @param items - Catalog titles used to find the first and last years.
 * @param from - Clock used for still-airing spans and the current year.
 */
export const buildYearFilterOptions = (
  items: PeriodFilterFields[],
  from = new Date(),
): YearSeasonOption[] => {
  const { min, max } = getCatalogYearRange(items, from)
  const years: YearSeasonOption[] = []
  for (let year = max; year >= min; year--) {
    years.push({ value: String(year), label: String(year) })
  }
  return [{ value: 'all', label: 'Any year' }, ...years]
}

function matchesDateRange(
  item: PeriodFilterFields,
  rangeStart: number,
  rangeEnd: number,
  from: Date,
): boolean {
  const span = getSearchCategorySpan(item, from)
  if (!span) return false
  return rangesOverlap(span.start.getTime(), span.end.getTime(), rangeStart, rangeEnd)
}

/**
 * Whether a title matches the Search year filter. Movies and series both use the airing/release span.
 * @param item - Catalog airing/release fields.
 * @param year - `all` or a calendar year string.
 * @param from - Clock for still-airing spans.
 */
export const matchesYearFilter = (
  item: PeriodFilterFields,
  year: string,
  from = new Date(),
): boolean => {
  if (!year || year === 'all') return true
  const parsed = Number(year)
  if (!Number.isFinite(parsed)) return true
  return matchesDateRange(
    item,
    Date.UTC(parsed, 0, 1),
    Date.UTC(parsed, 11, 31, 23, 59, 59, 999),
    from,
  )
}

/**
 * Whether a title overlaps the chosen season in any year. Movies use release date; series use the airing span.
 * @param item - Catalog airing/release fields.
 * @param season - `all` or `winter` / `spring` / `summer` / `fall`.
 * @param from - Clock for still-airing spans.
 */
export const matchesSeasonFilter = (
  item: PeriodFilterFields,
  season: string,
  from = new Date(),
): boolean => {
  if (!season || season === 'all') return true
  if (!isAnimeSeason(season)) return true
  const span = getSearchCategorySpan(item, from)
  if (!span) return false
  const startYear = span.start.getUTCFullYear()
  const endYear = span.end.getUTCFullYear()
  for (let year = startYear; year <= endYear; year++) {
    const range = seasonRange(year, season)
    if (rangesOverlap(span.start.getTime(), span.end.getTime(), range.start, range.end)) {
      return true
    }
  }
  return false
}

/**
 * Whether a title matches Completed, Airing, or Upcoming.
 * @param item - Catalog airing/release fields.
 * @param status - `all`, `completed`, `airing`, or `upcoming`.
 * @param from - Clock for currently-airing / upcoming.
 */
export const matchesStatusFilter = (
  item: PeriodFilterFields,
  status: string,
  from = new Date(),
): boolean => {
  if (!status || status === 'all') return true
  if (status === 'airing') return isCurrentlyAiring(item, from)
  if (status === 'upcoming') return isUpcoming(item, from)
  if (status === 'completed') {
    return !isCurrentlyAiring(item, from) && !isUpcoming(item, from)
  }
  return true
}

/**
 * ISO origin codes for a catalog title. Stored TMDB/MAL countries win; MAL-only titles default to Japan.
 * @param item - Catalog origin fields.
 */
export const getOriginCountryCodes = (item: CountryFilterFields): string[] => {
  const stored = (item.originCountries || [])
    .map((code) =>
      String(code || '')
        .trim()
        .toUpperCase(),
    )
    .filter(Boolean)
  if (stored.length > 0) return [...new Set(stored)]
  if (item.malId != null) return ['JP']
  return []
}

/**
 * Whether a catalog title matches the Search country-of-origin filter.
 * @param item - Catalog origin fields.
 * @param country - ISO 3166-1 alpha-2 code, or `all`.
 */
export const matchesCountryFilter = (item: CountryFilterFields, country: string): boolean => {
  if (!country || country === 'all') return true
  return getOriginCountryCodes(item).includes(country.toUpperCase())
}
