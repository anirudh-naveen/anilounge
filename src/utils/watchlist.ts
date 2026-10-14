import { toggleChipOfAll } from '@/utils/filterChips'
import { matchesContentTypeFilter } from '@/services/api'

export type WatchlistStatus = 'plan_to_watch' | 'watching' | 'completed' | 'on_hold' | 'dropped'

export const WATCHLIST_STATUS_OPTIONS: { value: WatchlistStatus; label: string }[] = [
  { value: 'plan_to_watch', label: 'Planned' },
  { value: 'watching', label: 'Watching' },
  { value: 'completed', label: 'Completed' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'dropped', label: 'Dropped' },
]

/** Order of the watchlist page's status sections and filter chips. */
export const WATCHLIST_STATUS_ORDER: WatchlistStatus[] = [
  'watching',
  'completed',
  'on_hold',
  'plan_to_watch',
  'dropped',
]

/** Status chips, in section order. There is no All chip: every chip picked reads as All. */
export const WATCHLIST_STATUS_FILTER_OPTIONS: { value: WatchlistStatus; label: string }[] =
  WATCHLIST_STATUS_ORDER.map(
    (status) => WATCHLIST_STATUS_OPTIONS.find((option) => option.value === status)!,
  )

/**
 * Human-readable watchlist status for buttons and filters.
 * @param status - Stored watchlist status, if any.
 * @returns Matching label, or `In Watchlist` when unknown.
 */
export const getWatchlistStatusLabel = (status?: string) => {
  const option = WATCHLIST_STATUS_FILTER_OPTIONS.find((opt) => opt.value === status)
  return option ? option.label : 'In Watchlist'
}

/** Order a series' season statuses are summed up in: the first one any season has wins. */
/** One tracked season, as a series' status is summed up from it. */
export interface SeasonStatus {
  status: WatchlistStatus
  /** The series' first season (a plan for a later one means the earlier ones are underway). */
  first: boolean
  /** Aired or airing; unreleased seasons don't count while a released one is listed. */
  released?: boolean
}

/**
 * One status for a series tracked season by season (the server keeps a series' own
 * watchlist row in step the same way: services/watchlistWrites.js `syncSeriesFromSeasons`).
 * Unreleased seasons are left out while any released season is listed.
 * 1. Completed once every released season is (when the count is unknown, every tracked one).
 * 2. Watching only while a season is being watched.
 * 3. Dropped, then On hold, when any season is.
 * 4. Planned when nothing is done yet and the first season (or only unreleased ones) is
 *    planned.
 * 5. On hold otherwise: some seasons done with others planned or not listed, or only a
 *    later season planned.
 * @param seasons - The tracked seasons' statuses.
 * @param releasedSeasons - How many released seasons the series has, when known.
 * @returns The summary, or undefined when no season is tracked.
 */
export const summarizeSeasonStatuses = (
  seasons: SeasonStatus[],
  releasedSeasons?: number,
): WatchlistStatus | undefined => {
  if (!seasons.length) return undefined
  const listed = seasons.filter((season) => season.released !== false)
  if (!listed.length) return 'plan_to_watch'
  const has = (status: WatchlistStatus) => listed.some((season) => season.status === status)
  const done = listed.filter((season) => season.status === 'completed').length
  if (done === listed.length && !(releasedSeasons && listed.length < releasedSeasons)) {
    return 'completed'
  }
  if (has('watching')) return 'watching'
  if (has('dropped')) return 'dropped'
  if (has('on_hold')) return 'on_hold'
  const firstPlanned = listed.some((season) => season.first && season.status === 'plan_to_watch')
  return done === 0 && firstPlanned ? 'plan_to_watch' : 'on_hold'
}

/**
 * A series' rating from its seasons: the average of the seasons the user rated, to the tenth.
 * @param ratings - The tracked seasons' ratings (unrated ones are skipped).
 * @returns The average, or undefined when no season is rated.
 */
export const averageSeasonRating = (ratings: (number | null | undefined)[]) => {
  const rated = ratings.filter(
    (rating): rating is number => typeof rating === 'number' && rating > 0,
  )
  if (!rated.length) return undefined
  return Math.round((rated.reduce((sum, rating) => sum + rating, 0) / rated.length) * 10) / 10
}

/**
 * Episodes watched as shown and edited: completed titles sit on their last episode when
 * the total is known (the server saves the same), whatever an older row stored.
 * @param status - Watchlist status.
 * @param currentEpisode - Saved episode progress.
 * @param totalEpisodes - The title's episode count; 0 or missing when unknown.
 */
export const watchedEpisodes = (
  status: string | undefined,
  currentEpisode: number | undefined,
  totalEpisodes: number | undefined,
) => (status === 'completed' && totalEpisodes ? totalEpisodes : currentEpisode || 0)

/** How long after sign-up new accounts are reminded that they can import a list. */
export const IMPORT_REMINDER_DAYS = 30

/**
 * Whether to remind a user about importing their list: accounts in their first
 * month that haven't finished an import (the shared demo account never is).
 * @param user - Signed-in user, if any.
 * @param now - Reference time.
 */
export function shouldShowImportReminder(
  user:
    | { createdAt?: string; watchlistImportedAt?: string | null; isDemoAccount?: boolean }
    | null
    | undefined,
  now = new Date(),
) {
  if (!user?.createdAt || user.watchlistImportedAt || user.isDemoAccount) return false
  const created = new Date(user.createdAt).getTime()
  if (Number.isNaN(created)) return false
  return now.getTime() - created < IMPORT_REMINDER_DAYS * 24 * 60 * 60 * 1000
}

/** Type chips picked on a watchlist; values match `matchesContentTypeFilter`. */
export type WatchlistTypeChoice = 'movie' | 'series' | 'season'

/** Type chips on the watchlist and profile pages (there is no All chip). */
export const WATCHLIST_TYPE_FILTER_OPTIONS: { value: WatchlistTypeChoice; label: string }[] = [
  { value: 'movie', label: 'Movies' },
  { value: 'series', label: 'Series' },
  { value: 'season', label: 'Seasons' },
]

/** Type chips picked until the user changes them: whole titles, not their seasons. */
export const DEFAULT_WATCHLIST_TYPES: WatchlistTypeChoice[] = ['movie', 'series']

/**
 * Pick or unpick a type chip. Series and Seasons exclude each other (a season row is part
 * of a series row), so picking one drops the other; the last picked chip can't be unpicked.
 * @param picked - The picked type chips.
 * @param value - The chip clicked.
 */
export function toggleTypeChip(picked: WatchlistTypeChoice[], value: WatchlistTypeChoice) {
  if (picked.includes(value)) {
    return picked.length > 1 ? picked.filter((v) => v !== value) : picked
  }
  const rival = value === 'series' ? 'season' : value === 'season' ? 'series' : null
  return [...picked.filter((v) => v !== rival), value]
}

/** Saved type chips, keeping only known values and at most one of Series and Seasons. */
export function readTypeChips(saved: unknown): WatchlistTypeChoice[] {
  if (!Array.isArray(saved)) return [...DEFAULT_WATCHLIST_TYPES]
  const known = WATCHLIST_TYPE_FILTER_OPTIONS.map((option) => option.value)
  const picked = known.filter((value) => saved.includes(value))
  const valid = picked.includes('series') ? picked.filter((v) => v !== 'season') : picked
  return valid.length ? valid : [...DEFAULT_WATCHLIST_TYPES]
}

/**
 * Pick or unpick a status chip. Every status starts picked (stored as `[]`, shown as All);
 * the last picked chip can't be unpicked, and picking every chip goes back to All.
 * @param picked - The picked statuses; empty means all of them.
 * @param value - The chip clicked.
 */
export function toggleStatusChip(picked: WatchlistStatus[], value: WatchlistStatus) {
  return toggleChipOfAll(picked, value, WATCHLIST_STATUS_ORDER)
}

/** Whether a row's status is one of the picked statuses (none picked: any). */
export const matchesStatusChips = (status: string, picked: WatchlistStatus[]) =>
  !picked.length || picked.includes(status as WatchlistStatus)

/** Whether a row's type is one of the picked types (none picked: any). */
export const matchesTypeChips = (contentType: string | undefined, picked: WatchlistTypeChoice[]) =>
  !picked.length || picked.some((type) => matchesContentTypeFilter(contentType, type))
