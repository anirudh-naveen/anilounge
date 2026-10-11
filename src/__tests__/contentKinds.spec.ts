import { describe, expect, it } from 'vitest'
import { isEpisodic } from '@/utils/contentKinds'
import { getDetailsRouteName, matchesContentTypeFilter, tracksEpisodes } from '@/services/api'

describe('seasons in the catalog helpers', () => {
  it('treats series and seasons as episodic', () => {
    expect(isEpisodic('tv')).toBe(true)
    expect(isEpisodic('season')).toBe(true)
    expect(isEpisodic('movie')).toBe(false)
    expect(isEpisodic(undefined)).toBe(false)
  })

  it('opens a season on the series page and tracks its episodes', () => {
    expect(getDetailsRouteName({ contentType: 'season' })).toBe('TVShowDetails')
    expect(tracksEpisodes({ contentType: 'season' })).toBe(true)
  })

  it('keeps seasons under the TV filter only', () => {
    expect(matchesContentTypeFilter('season', 'tv')).toBe(true)
    expect(matchesContentTypeFilter('season', 'movie')).toBe(false)
    expect(matchesContentTypeFilter('tv', 'tv')).toBe(true)
  })
})
