export type WatchlistStatus = 'plan_to_watch' | 'watching' | 'completed' | 'on_hold' | 'dropped'

export const WATCHLIST_STATUS_OPTIONS: { value: WatchlistStatus; label: string }[] = [
  { value: 'plan_to_watch', label: 'Planned' },
  { value: 'watching', label: 'Watching' },
  { value: 'completed', label: 'Completed' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'dropped', label: 'Dropped' },
]

export const WATCHLIST_STATUS_FILTER_OPTIONS: { value: 'all' | WatchlistStatus; label: string }[] =
  [{ value: 'all', label: 'All' }, ...WATCHLIST_STATUS_OPTIONS]

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
const SERIES_STATUS_ORDER: WatchlistStatus[] = [
  'watching',
  'on_hold',
  'plan_to_watch',
  'completed',
  'dropped',
]

/**
 * One status for a series tracked season by season: Completed only when every season
 * is (Watching while some are done and others are not on the list yet), otherwise the
 * most active status any season has.
 * @param statuses - The tracked seasons' statuses.
 * @param totalSeasons - How many seasons the series has; when unknown, only tracked ones count.
 * @returns The summary, or undefined when no season is tracked.
 */
export const summarizeSeasonStatuses = (
  statuses: WatchlistStatus[],
  totalSeasons?: number,
): WatchlistStatus | undefined => {
  if (!statuses.length) return undefined
  if (statuses.every((status) => status === 'completed')) {
    return totalSeasons && statuses.length < totalSeasons ? 'watching' : 'completed'
  }
  return SERIES_STATUS_ORDER.find((status) => status !== 'completed' && statuses.includes(status))
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

/** Order of the watchlist page's status sections: active titles first. */
export const WATCHLIST_STATUS_ORDER: WatchlistStatus[] = [
  'watching',
  'on_hold',
  'plan_to_watch',
  'completed',
  'dropped',
]

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

export type WatchlistTypeFilter = 'all' | 'movie' | 'series' | 'season'

/** Type chips on the watchlist and profile pages; values match `matchesContentTypeFilter`. */
export const WATCHLIST_TYPE_FILTER_OPTIONS: { value: WatchlistTypeFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'movie', label: 'Movies' },
  { value: 'series', label: 'Series' },
  { value: 'season', label: 'Seasons' },
]
