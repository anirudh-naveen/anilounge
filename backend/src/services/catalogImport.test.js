import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { applyResolvedFields, seriesTotals, tmdbEpisodesForSeason } from './catalogImport.js'

describe('tmdbEpisodesForSeason', () => {
  // Blue Box: TMDB's season 1 holds both seasons; season 2 starts after episode 25.
  const tmdbEpisodes = Array.from({ length: 37 }, (_, index) => ({
    seasonNumber: 1,
    episodeNumber: index + 1,
    title: `T${index + 1}`,
  }))
  const s1 = { tmdbSeasonNumber: 1, tmdbEpisodeOffset: 0 }
  const s2 = { tmdbSeasonNumber: 1, tmdbEpisodeOffset: 25 }

  it("cuts a shared TMDB season at the next row's offset and renumbers", () => {
    const first = tmdbEpisodesForSeason(s1, [s1, s2], tmdbEpisodes)
    assert.equal(first.length, 25)
    const second = tmdbEpisodesForSeason(s2, [s1, s2], tmdbEpisodes)
    assert.deepEqual(
      second.slice(0, 2).map(({ number, title }) => [number, title]),
      [
        [1, 'T26'],
        [2, 'T27'],
      ],
    )
    assert.equal(second.length, 12)
  })

  it('gives nothing to a season with no TMDB season', () => {
    assert.deepEqual(tmdbEpisodesForSeason({ tmdbSeasonNumber: null }, [], tmdbEpisodes), [])
  })
})

describe('seriesTotals', () => {
  it('sums counts, averages scores, and takes the soonest next episode', () => {
    const totals = seriesTotals([
      {
        seasonNumber: 1,
        episodeCount: 25,
        malScore: 8.0,
        unifiedScore: 8.1,
        malStatus: 'finished_airing',
        releaseDate: '2024-10-03',
      },
      {
        seasonNumber: 2,
        episodeCount: 12,
        malScore: 8.4,
        unifiedScore: 8.5,
        malStatus: 'currently_airing',
        nextEpisodeAirDate: '2026-10-18T14:45:00Z',
        nextEpisodeNumber: 3,
        releaseDate: '2026-10-02',
      },
    ])
    assert.equal(totals.seasonCount, 2)
    assert.equal(totals.episodeCount, 37)
    assert.equal(totals.malStatus, 'currently_airing')
    assert.equal(totals.nextEpisodeNumber, 3)
    assert.equal(totals.nextEpisodeSeason, 2)
    assert.equal(totals.releaseDate, '2024-10-03')
    assert.equal(totals.malScore, 8.2)
    assert.equal(totals.unifiedScore, 8.3)
  })

  it('counts a season split into parts once', () => {
    assert.equal(
      seriesTotals([{ seasonNumber: 1 }, { seasonNumber: 1, partNumber: 2 }]).seasonCount,
      1,
    )
  })
})

describe('applyResolvedFields', () => {
  it('maps resolved fields onto a Content document and keeps every name searchable', () => {
    const doc = applyResolvedFields(
      { title: 'Old', alternativeTitles: ['Old Alias'] },
      {
        title: 'Blue Box Season 2',
        airingStatus: 'airing',
        nextEpisodeAt: '2026-10-18T14:45:00Z',
        nextEpisodeNumber: 3,
        genres: ['Romance'],
        startYear: 2026,
        malScore: 8.3,
        malVotes: 40000,
      },
      {
        anilist: {
          title: 'Blue Box Season 2',
          romajiTitle: 'Ao no Hako 2nd Season',
          malId: 61323,
          anilistId: 189123,
        },
      },
    )
    assert.equal(doc.englishTitle, 'Blue Box Season 2')
    assert.equal(doc.malStatus, 'currently_airing')
    assert.equal(doc.nextEpisodeNumber, 3)
    assert.deepEqual(doc.genres, [{ name: 'Romance' }])
    assert.equal(doc.startSeasonYear, 2026)
    assert.equal(doc.malId, 61323)
    assert.deepEqual(doc.alternativeTitles, ['Old Alias', 'Ao no Hako 2nd Season'])
    assert.equal(doc.unifiedScore, 8.3)
  })
})
