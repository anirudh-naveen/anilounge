import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  noteWatchlistSave,
  readUsage,
  recordAppOpen,
  REVIEW_MIN_ACTIVE_DAYS,
  REVIEW_MIN_SAVES,
  shouldAskForReview,
  type ReviewUsage,
} from '@/utils/appReview'

const DAY = 24 * 60 * 60 * 1000
const start = new Date('2026-01-01T12:00:00')
const daysLater = (days: number) => new Date(start.getTime() + days * DAY)

/** A long-time user: a month in, enough days and saves, never asked. */
const veteran = (overrides: Partial<ReviewUsage> = {}): ReviewUsage => ({
  firstOpenedAt: start.getTime(),
  activeDays: REVIEW_MIN_ACTIVE_DAYS,
  lastActiveDay: '',
  saves: REVIEW_MIN_SAVES,
  lastAskedAt: null,
  ...overrides,
})

describe('app review prompt', () => {
  beforeEach(() => localStorage.clear())

  it('counts each day the app is opened once', () => {
    recordAppOpen(start)
    recordAppOpen(new Date(start.getTime() + 60 * 60 * 1000))
    expect(readUsage().activeDays).toBe(1)
    recordAppOpen(daysLater(1))
    expect(readUsage().activeDays).toBe(2)
    expect(readUsage().firstOpenedAt).toBe(start.getTime())
  })

  it('only asks long-time users', () => {
    expect(shouldAskForReview(veteran(), daysLater(30))).toBe(true)
    // Too new, too few days, or too few saves.
    expect(shouldAskForReview(veteran(), daysLater(10))).toBe(false)
    expect(shouldAskForReview(veteran({ activeDays: 3 }), daysLater(30))).toBe(false)
    expect(shouldAskForReview(veteran({ saves: 1 }), daysLater(30))).toBe(false)
  })

  it('asks again months later, since iOS never says whether they rated', () => {
    const asked = veteran({ lastAskedAt: daysLater(30).getTime() })
    expect(shouldAskForReview(asked, daysLater(60))).toBe(false)
    expect(shouldAskForReview(asked, daysLater(151))).toBe(true)
  })

  it('asks after a save once eligible, and remembers only a successful ask', async () => {
    localStorage.setItem(
      'anilounge:app-review',
      JSON.stringify(veteran({ saves: REVIEW_MIN_SAVES - 1 })),
    )
    const failing = vi.fn().mockRejectedValue(new Error('not foreground'))
    expect(await noteWatchlistSave(failing, daysLater(30))).toBe(false)
    expect(failing).toHaveBeenCalledOnce()
    expect(readUsage().lastAskedAt).toBeNull()

    const ask = vi.fn().mockResolvedValue(undefined)
    expect(await noteWatchlistSave(ask, daysLater(30))).toBe(true)
    expect(readUsage().lastAskedAt).toBe(daysLater(30).getTime())
    expect(await noteWatchlistSave(ask, daysLater(31))).toBe(false)
    expect(ask).toHaveBeenCalledOnce()
  })
})
