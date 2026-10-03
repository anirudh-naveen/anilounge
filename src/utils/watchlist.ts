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
