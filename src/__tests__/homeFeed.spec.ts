import { describe, expect, it } from 'vitest'
import type { ActivityEntry, ReleaseUpdate } from '@/types/home'
import {
  characterBlurb,
  activitySubject,
  describeActivity,
  mergeActivity,
  releaseLabel,
  timeAgo,
  timeUntil,
} from '@/utils/homeFeed'

const now = new Date('2026-09-27T12:00:00Z')
const hoursFromNow = (hours: number) => new Date(now.getTime() + hours * 3600 * 1000)

describe('timeAgo / timeUntil', () => {
  it('uses coarse relative units, then a date past two weeks', () => {
    expect(timeAgo(hoursFromNow(-0.001), now)).toBe('just now')
    expect(timeAgo(hoursFromNow(-3), now)).toBe('3h ago')
    expect(timeAgo(hoursFromNow(-50), now)).toBe('2d ago')
    expect(timeAgo(hoursFromNow(-24 * 30), now)).not.toContain('ago')
    expect(timeUntil(hoursFromNow(5), now)).toBe('in 5h')
    expect(timeUntil(hoursFromNow(24 * 3), now)).toBe('in 3d')
    expect(timeUntil(hoursFromNow(24 * 40), now)).not.toContain('in ')
  })
})

describe('describeActivity', () => {
  it('conjugates for the viewer and for other people', () => {
    const watching = {
      action: 'updated' as const,
      status: 'watching' as const,
      currentEpisode: 0,
      previousEpisode: 0,
    }
    expect(describeActivity({ ...watching, user: { isSelf: true } })).toBe('are watching')
    expect(describeActivity({ ...watching, user: { isSelf: false } })).toBe('is watching')
    expect(describeActivity(watching)).toBe('is watching')
    expect(
      activitySubject({ user: { isSelf: true, username: 'ani', _id: 'me', profilePicture: null } }),
    ).toBe('You')
    expect(
      activitySubject({ user: { isSelf: false, username: 'kai', _id: 'k', profilePicture: null } }),
    ).toBe('kai')
  })

  const describe_ = (
    status: ActivityEntry['status'],
    currentEpisode = 0,
    previousEpisode = 0,
    action: ActivityEntry['action'] = 'updated',
  ) => describeActivity({ action, status, currentEpisode, previousEpisode })

  it('phrases planned, completed, and dropped titles', () => {
    expect(describe_('plan_to_watch', 0, 0, 'added')).toBe('planned to watch')
    expect(describe_('plan_to_watch')).toBe('planned to watch')
    expect(describe_('completed', 24, 20)).toBe('completed')
    expect(describe_('dropped', 3, 2)).toBe('dropped')
  })

  it('reports the episodes watched since the user left off', () => {
    expect(describe_('watching', 4, 0, 'added')).toBe('watched episodes 1–4 of')
    expect(describe_('watching', 8, 4)).toBe('watched episodes 5–8 of')
    expect(describe_('watching', 9, 8)).toBe('watched episode 9 of')
    expect(describe_('watching', 1, 0, 'added')).toBe('watched episode 1 of')
  })

  it('falls back when there is no forward progress', () => {
    expect(describe_('watching', 0, 0, 'added')).toBe('started watching')
    expect(describe_('watching', 0, 3)).toBe('is watching')
    expect(describe_('watching', 3, 6)).toBe('watched episode 3 of')
  })
})

describe('mergeActivity', () => {
  it('interleaves personal and friend entries newest first', () => {
    const entry = (id: string, at: string) => ({ id, at }) as ActivityEntry
    const merged = mergeActivity(
      [entry('mine-old', '2026-09-01T00:00:00Z'), entry('mine-new', '2026-09-20T00:00:00Z')],
      [entry('friend', '2026-09-10T00:00:00Z')],
    )
    expect(merged.map((row) => row.id)).toEqual(['mine-new', 'friend', 'mine-old'])
  })
})

describe('releaseLabel', () => {
  const update = (overrides: Partial<ReleaseUpdate>, content = {}): ReleaseUpdate => ({
    kind: 'episode',
    at: null,
    reason: 'watchlist',
    via: null,
    ...overrides,
    content: {
      _id: 'c1',
      title: 'Show',
      posterPath: '',
      backdropPath: '',
      contentType: 'tv',
      ...content,
    },
  })

  it('counts down to the next episode', () => {
    const label = releaseLabel(
      update(
        { at: hoursFromNow(5).toISOString() },
        { nextEpisodeAirDate: hoursFromNow(5).toISOString(), nextEpisodeNumber: 12 },
      ),
      now,
    )
    expect(label).toBe('Ep 12 · in 5h')
  })

  it('marks episodes that already aired', () => {
    const aired = hoursFromNow(-30).toISOString()
    expect(
      releaseLabel(update({ at: aired }, { nextEpisodeAirDate: aired, nextEpisodeNumber: 7 }), now),
    ).toBe('Ep 7 · Out now')
  })

  it('labels premieres by type and handles missing dates', () => {
    expect(releaseLabel(update({ kind: 'premiere' }, { malStatus: 'not_yet_aired' }), now)).toBe(
      'Premiere date TBA',
    )
    expect(
      releaseLabel(
        update(
          { kind: 'premiere' },
          { contentType: 'movie', releaseDate: hoursFromNow(48).toISOString() },
        ),
        now,
      ),
    ).toBe('Releases in 2d')
  })
})

describe('characterBlurb', () => {
  it('drops leading stat lines and spoiler markers', () => {
    const about = 'Height: 154 cm\nAge: 26\n\nManga and cosplay are up her alley. ~!She hides it!~'
    expect(characterBlurb(about)).toBe('Manga and cosplay are up her alley. She hides it')
  })

  it('trims long bios at a sentence boundary', () => {
    const about = `${'A sentence that goes on. '.repeat(20)}`
    const blurb = characterBlurb(about, 100)
    expect(blurb.length).toBeLessThanOrEqual(100)
    expect(blurb.endsWith('.')).toBe(true)
  })
})
