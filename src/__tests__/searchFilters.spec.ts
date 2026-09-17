import { describe, expect, it } from 'vitest'
import {
  buildYearFilterOptions,
  getCatalogYearRange,
  getOriginCountryCodes,
  matchesCountryFilter,
  matchesSeasonFilter,
  matchesStatusFilter,
  matchesYearFilter,
  seasonFromMonth,
} from '@/utils/searchFilters'

const from = new Date('2026-09-16T12:00:00.000Z')

describe('seasonFromMonth', () => {
  it('maps months onto anime seasons', () => {
    expect(seasonFromMonth(0)).toBe('winter')
    expect(seasonFromMonth(3)).toBe('spring')
    expect(seasonFromMonth(8)).toBe('summer')
    expect(seasonFromMonth(9)).toBe('fall')
  })
})

describe('buildYearFilterOptions', () => {
  it('lists any year and every year from first to last content year', () => {
    const options = buildYearFilterOptions(
      [
        { contentType: 'movie', releaseDate: '1995-06-01' },
        { contentType: 'tv', releaseDate: '2024-01-01', lastAirDate: '2024-12-01' },
      ],
      from,
    )
    expect(options[0]).toEqual({ value: 'all', label: 'Any year' })
    expect(options.map((option) => option.value)).not.toContain('airing')
    expect(options.map((option) => option.value)).not.toContain('upcoming')
    expect(
      getCatalogYearRange([{ releaseDate: '1995-06-01' }, { releaseDate: '2024-01-01' }], from),
    ).toEqual({ min: 1995, max: 2026 })
    expect(options.map((option) => option.value)).toContain('1995')
    expect(options.map((option) => option.value)).toContain('2024')
    expect(options.map((option) => option.value)).toContain('2026')
    expect(options.filter((option) => option.value === '1995').length).toBe(1)
  })
})

describe('matchesYearFilter', () => {
  it('keeps every title when the year is all', () => {
    expect(matchesYearFilter({ contentType: 'tv' }, 'all', from)).toBe(true)
  })

  it('matches movies and series whose span overlaps the calendar year', () => {
    expect(
      matchesYearFilter({ contentType: 'movie', releaseDate: '2024-07-18' }, '2024', from),
    ).toBe(true)
    expect(
      matchesYearFilter(
        { contentType: 'tv', releaseDate: '2023-11-01', lastAirDate: '2024-03-01' },
        '2024',
        from,
      ),
    ).toBe(true)
    expect(
      matchesYearFilter({ contentType: 'movie', releaseDate: '2022-01-01' }, '2024', from),
    ).toBe(false)
  })
})

describe('matchesSeasonFilter', () => {
  it('matches anime start season and calendar release months in any year', () => {
    expect(
      matchesSeasonFilter({ startSeasonYear: 2026, startSeason: 'summer' }, 'summer', from),
    ).toBe(true)
    expect(matchesSeasonFilter({ releaseDate: '2026-08-12' }, 'summer', from)).toBe(true)
    expect(matchesSeasonFilter({ releaseDate: '2020-08-12' }, 'summer', from)).toBe(true)
    expect(matchesSeasonFilter({ releaseDate: '2026-10-01' }, 'summer', from)).toBe(false)
  })

  it('includes global movies and series whose dates fall in the season', () => {
    expect(
      matchesSeasonFilter({ contentType: 'movie', releaseDate: '2026-07-18' }, 'summer', from),
    ).toBe(true)
    expect(
      matchesSeasonFilter({ contentType: 'movie', releaseDate: '2026-07-18' }, 'spring', from),
    ).toBe(false)
    expect(
      matchesSeasonFilter(
        { contentType: 'tv', releaseDate: '2019-07-04', lastAirDate: '2019-09-01' },
        'summer',
        from,
      ),
    ).toBe(true)
  })

  it('includes titles that started earlier but are still airing in the season', () => {
    expect(
      matchesSeasonFilter(
        {
          contentType: 'tv',
          malStatus: 'currently_airing',
          releaseDate: '2026-04-08',
        },
        'summer',
        from,
      ),
    ).toBe(true)
    expect(
      matchesSeasonFilter(
        {
          contentType: 'tv',
          malStatus: 'finished_airing',
          releaseDate: '2026-04-08',
          lastAirDate: '2026-09-12',
        },
        'summer',
        from,
      ),
    ).toBe(true)
    expect(
      matchesSeasonFilter(
        {
          contentType: 'tv',
          malStatus: 'finished_airing',
          releaseDate: '2026-04-08',
          lastAirDate: '2026-06-20',
        },
        'summer',
        from,
      ),
    ).toBe(false)
  })

  it('does not stretch upcoming titles into the current season', () => {
    expect(
      matchesSeasonFilter(
        { contentType: 'tv', malStatus: 'not_yet_aired', releaseDate: '2026-10-01' },
        'summer',
        from,
      ),
    ).toBe(false)
    expect(
      matchesSeasonFilter(
        { contentType: 'tv', malStatus: 'not_yet_aired', releaseDate: '2026-10-01' },
        'fall',
        from,
      ),
    ).toBe(true)
  })
})

describe('matchesStatusFilter', () => {
  it('keeps every title when the status is all', () => {
    expect(matchesStatusFilter({ contentType: 'tv' }, 'all', from)).toBe(true)
  })

  it('separates completed, airing, and upcoming titles', () => {
    expect(
      matchesStatusFilter({ contentType: 'tv', malStatus: 'currently_airing' }, 'airing', from),
    ).toBe(true)
    expect(
      matchesStatusFilter({ contentType: 'tv', malStatus: 'currently_airing' }, 'completed', from),
    ).toBe(false)
    expect(
      matchesStatusFilter({ contentType: 'tv', malStatus: 'currently_airing' }, 'upcoming', from),
    ).toBe(false)
    expect(
      matchesStatusFilter({ contentType: 'tv', malStatus: 'not_yet_aired' }, 'upcoming', from),
    ).toBe(true)
    expect(
      matchesStatusFilter({ contentType: 'tv', malStatus: 'not_yet_aired' }, 'airing', from),
    ).toBe(false)
    expect(
      matchesStatusFilter({ contentType: 'tv', malStatus: 'finished_airing' }, 'completed', from),
    ).toBe(true)
    expect(
      matchesStatusFilter({ contentType: 'tv', malStatus: 'finished_airing' }, 'airing', from),
    ).toBe(false)
  })
})

describe('country of origin', () => {
  it('uses stored origin countries when present', () => {
    expect(getOriginCountryCodes({ originCountries: ['jp', 'US'] })).toEqual(['JP', 'US'])
    expect(matchesCountryFilter({ originCountries: ['US'] }, 'US')).toBe(true)
    expect(matchesCountryFilter({ originCountries: ['US'] }, 'JP')).toBe(false)
  })

  it('treats MAL-only titles as Japanese when origin countries are missing', () => {
    expect(getOriginCountryCodes({ malId: 1 })).toEqual(['JP'])
    expect(matchesCountryFilter({ malId: 1 }, 'JP')).toBe(true)
    expect(matchesCountryFilter({ malId: 1 }, 'US')).toBe(false)
  })

  it('does not guess a country for titles without origin data or a MAL id', () => {
    expect(getOriginCountryCodes({})).toEqual([])
    expect(matchesCountryFilter({}, 'JP')).toBe(false)
    expect(matchesCountryFilter({}, 'all')).toBe(true)
  })
})
