import { describe, expect, it } from 'vitest'
import {
  formatAiringStatus,
  formatCountdown,
  getAiringTimerLabel,
  getNextAirInfo,
  isCurrentlyAiring,
  nextWeeklyAirDate,
  type AiringFields,
} from '@/utils/airing'

const airingShow = (overrides: Partial<AiringFields> = {}): AiringFields => ({
  contentType: 'tv',
  malStatus: 'currently_airing',
  ...overrides,
})

describe('formatAiringStatus', () => {
  it('formats MAL snake_case statuses', () => {
    expect(formatAiringStatus('currently_airing')).toBe('Currently Airing')
    expect(formatAiringStatus('finished_airing')).toBe('Finished Airing')
    expect(formatAiringStatus('not_yet_aired')).toBe('Not Yet Aired')
  })
})

describe('isCurrentlyAiring', () => {
  it('is true for TV with currently_airing status', () => {
    expect(isCurrentlyAiring(airingShow())).toBe(true)
  })

  it('is false for movies and finished shows', () => {
    expect(isCurrentlyAiring(airingShow({ contentType: 'movie' }))).toBe(false)
    expect(isCurrentlyAiring(airingShow({ malStatus: 'finished_airing' }))).toBe(false)
  })

  it('falls back to a future TMDB next episode when MAL status is missing', () => {
    const from = new Date('2026-09-16T12:00:00.000Z')
    expect(
      isCurrentlyAiring(
        {
          contentType: 'tv',
          nextEpisodeAirDate: '2026-09-20',
        },
        from,
      ),
    ).toBe(true)
  })
})

describe('nextWeeklyAirDate', () => {
  it('returns the next JST weekly slot', () => {
    // Wednesday 12:00 UTC = Wednesday 21:00 JST. Sunday 01:00 JST is 4 days later.
    const from = new Date('2026-09-16T12:00:00.000Z')
    const next = nextWeeklyAirDate('sunday', '01:00', from)
    expect(next?.toISOString()).toBe('2026-09-19T16:00:00.000Z')
  })

  it('rolls forward a week when this week\'s slot already passed', () => {
    // Sunday 02:00 JST, slot is Sunday 01:00 JST → next Sunday.
    const from = new Date('2026-09-19T17:00:00.000Z')
    const next = nextWeeklyAirDate('sunday', '01:00', from)
    expect(next?.toISOString()).toBe('2026-09-26T16:00:00.000Z')
  })
})

describe('getNextAirInfo', () => {
  it('prefers a future TMDB date and applies MAL JST time to date-only values', () => {
    const from = new Date('2026-09-16T12:00:00.000Z')
    const next = getNextAirInfo(
      airingShow({
        nextEpisodeAirDate: '2026-09-20',
        nextEpisodeNumber: 8,
        broadcastTime: '01:25',
      }),
      from,
    )
    expect(next?.at.toISOString()).toBe('2026-09-19T16:25:00.000Z')
    expect(next?.episodeNumber).toBe(8)
  })

  it('falls back to the weekly MAL slot when TMDB date is in the past', () => {
    const from = new Date('2026-09-16T12:00:00.000Z')
    const next = getNextAirInfo(
      airingShow({
        nextEpisodeAirDate: '2026-09-10',
        broadcastDay: 'sunday',
        broadcastTime: '01:00',
      }),
      from,
    )
    expect(next?.at.toISOString()).toBe('2026-09-19T16:00:00.000Z')
    expect(next?.episodeNumber).toBeUndefined()
  })
})

describe('formatCountdown', () => {
  it('formats remaining time by magnitude', () => {
    expect(formatCountdown(0)).toBe('Airing now')
    expect(formatCountdown(2 * 86400 * 1000 + 5 * 3600 * 1000 + 12 * 60 * 1000)).toBe('2d 5h 12m')
    expect(formatCountdown(5 * 3600 * 1000 + 12 * 60 * 1000 + 3 * 1000)).toBe('5h 12m 03s')
    expect(formatCountdown(12 * 60 * 1000 + 3 * 1000)).toBe('12m 03s')
  })
})

describe('getAiringTimerLabel', () => {
  it('includes the episode number when TMDB supplies one', () => {
    const from = new Date('2026-09-16T12:00:00.000Z')
    expect(
      getAiringTimerLabel(
        airingShow({
          nextEpisodeAirDate: '2026-09-20',
          nextEpisodeNumber: 8,
          broadcastTime: '01:25',
        }),
        from,
      ),
    ).toBe('Episode 8 in 3d 4h 25m')
  })
})
