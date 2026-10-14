/**
 * appReview.ts — when the iOS app asks for an App Store rating (utils).
 *
 * Apple only allows its own rating prompt, and iOS decides whether it actually shows
 * (at most three times a year, never again once they've rated). So the app only asks
 * people who have used it for a while, right after a good moment (saving to their
 * watchlist), and asks again a few months later in case they didn't rate. Usage is
 * counted per device in localStorage; utils/nativeApp.ts does the asking.
 */

/** Days since first opening the app before it asks. */
export const REVIEW_MIN_DAYS = 21
/** Different days the app was opened on before it asks. */
export const REVIEW_MIN_ACTIVE_DAYS = 10
/** Watchlist saves before it asks. */
export const REVIEW_MIN_SAVES = 5
/** Days to wait before asking again (they may not have rated). */
export const REVIEW_REASK_DAYS = 120

const DAY_MS = 24 * 60 * 60 * 1000
const STORAGE_KEY = 'anilounge:app-review'

export interface ReviewUsage {
  /** First time the app was opened (ms). */
  firstOpenedAt: number
  /** Different days the app was opened on. */
  activeDays: number
  /** The last day counted, as `YYYY-MM-DD` in local time. */
  lastActiveDay: string
  /** Watchlist saves. */
  saves: number
  /** When the app last asked for a rating (ms), or null. */
  lastAskedAt: number | null
}

const dayKey = (now: Date) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

export function readUsage(now = new Date()): ReviewUsage {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    if (saved && typeof saved.firstOpenedAt === 'number') {
      return {
        firstOpenedAt: saved.firstOpenedAt,
        activeDays: Number(saved.activeDays) || 0,
        lastActiveDay: String(saved.lastActiveDay || ''),
        saves: Number(saved.saves) || 0,
        lastAskedAt: typeof saved.lastAskedAt === 'number' ? saved.lastAskedAt : null,
      }
    }
  } catch {
    // Unreadable: start counting again.
  }
  return {
    firstOpenedAt: now.getTime(),
    activeDays: 0,
    lastActiveDay: '',
    saves: 0,
    lastAskedAt: null,
  }
}

const writeUsage = (usage: ReviewUsage) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(usage))
  } catch {
    // Storage unavailable: the app just never asks.
  }
}

/** Count today as a day the app was used (once per day). */
export function recordAppOpen(now = new Date()): ReviewUsage {
  const usage = readUsage(now)
  const today = dayKey(now)
  if (usage.lastActiveDay !== today) {
    usage.activeDays += 1
    usage.lastActiveDay = today
  }
  writeUsage(usage)
  return usage
}

/**
 * Whether to ask for a rating now: a long-time user who hasn't been asked in a while.
 * @param usage - Counted usage on this device.
 * @param now - Reference time.
 */
export function shouldAskForReview(usage: ReviewUsage, now = new Date()): boolean {
  const time = now.getTime()
  return (
    time - usage.firstOpenedAt >= REVIEW_MIN_DAYS * DAY_MS &&
    usage.activeDays >= REVIEW_MIN_ACTIVE_DAYS &&
    usage.saves >= REVIEW_MIN_SAVES &&
    (usage.lastAskedAt === null || time - usage.lastAskedAt >= REVIEW_REASK_DAYS * DAY_MS)
  )
}

/**
 * Count a watchlist save; when it makes them eligible, ask (once the caller's request
 * succeeds the ask is remembered, so a failed one is retried next time).
 * @param ask - Shows the rating prompt.
 * @returns Whether it asked.
 */
export async function noteWatchlistSave(
  ask: () => Promise<void>,
  now = new Date(),
): Promise<boolean> {
  const usage = readUsage(now)
  usage.saves += 1
  writeUsage(usage)
  if (!shouldAskForReview(usage, now)) return false
  try {
    await ask()
  } catch {
    return false
  }
  writeUsage({ ...usage, lastAskedAt: now.getTime() })
  return true
}
