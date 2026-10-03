import assert from 'node:assert/strict'
import { gzipSync } from 'node:zlib'
import { describe, it } from 'node:test'
import {
  ImportError,
  combineStatus,
  mapAnilistEntry,
  mapMalApiEntry,
  mapTmdbLists,
  matchEntries,
  mergeByTitle,
  parseMalExport,
  prepareImport,
  readMalExportFile,
  toDate,
  toRating,
  toWatchlistRow,
} from './watchlistImportService.js'

describe('toRating', () => {
  it('rounds 10-point scores and treats 0 as unrated', () => {
    assert.equal(toRating(8.6), 9)
    assert.equal(toRating(0.4), 1)
    assert.equal(toRating(0), null)
    assert.equal(toRating(null), null)
    assert.equal(toRating(12), 10)
  })
})

describe('toDate', () => {
  it('keeps full and year-month dates, drops vague or invalid ones', () => {
    assert.equal(toDate(2021, 4, 9), '2021-04-09')
    assert.equal(toDate(2021, 4, null), '2021-04-01')
    assert.equal(toDate(2021, null, null), null)
    assert.equal(toDate(0, 0, 0), null)
    assert.equal(toDate(2021, 2, 31), null)
  })
})

describe('mapAnilistEntry', () => {
  it('maps status, progress, score, dates, rewatches, and notes', () => {
    const entry = mapAnilistEntry({
      status: 'PAUSED',
      score: 7.5,
      progress: 5,
      repeat: 2,
      notes: ' great ',
      updatedAt: 1700000000,
      startedAt: { year: 2023, month: 1, day: 2 },
      completedAt: { year: null, month: null, day: null },
      media: { id: 21, idMal: 20, title: { romaji: 'Naruto', english: null } },
    })
    assert.equal(entry.anilistId, 21)
    assert.equal(entry.malId, 20)
    assert.equal(entry.status, 'on_hold')
    assert.equal(entry.score, 8)
    assert.equal(entry.progress, 5)
    assert.equal(entry.rewatchCount, 2)
    assert.equal(entry.startedOn, '2023-01-02')
    assert.equal(entry.completedOn, null)
    assert.equal(entry.notes, 'great')
    assert.equal(entry.title, 'Naruto')
    assert.equal(entry.updatedAt, new Date(1700000000 * 1000).toISOString())
  })

  it('treats a rewatch as watching and skips entries without media', () => {
    assert.equal(mapAnilistEntry({ status: 'REPEATING', media: { id: 1 } }).status, 'watching')
    assert.equal(mapAnilistEntry({ status: 'CURRENT' }), null)
  })
})

describe('mapMalApiEntry', () => {
  it('maps MAL list_status fields', () => {
    const entry = mapMalApiEntry({
      node: { id: 5114, title: 'Fullmetal Alchemist: Brotherhood' },
      list_status: {
        status: 'completed',
        score: 10,
        num_episodes_watched: 64,
        is_rewatching: false,
        start_date: '2019-06',
        finish_date: '2019-08-30',
        num_times_rewatched: 1,
        updated_at: '2019-08-30T12:00:00+00:00',
      },
    })
    assert.equal(entry.malId, 5114)
    assert.equal(entry.status, 'completed')
    assert.equal(entry.score, 10)
    assert.equal(entry.progress, 64)
    assert.equal(entry.startedOn, '2019-06-01')
    assert.equal(entry.completedOn, '2019-08-30')
    assert.equal(entry.rewatchCount, 1)
  })
})

const MAL_EXPORT = `<?xml version="1.0" encoding="UTF-8" ?>
<myanimelist>
  <myinfo><user_name>someone</user_name></myinfo>
  <anime>
    <series_animedb_id>1535</series_animedb_id>
    <series_title><![CDATA[Death Note]]></series_title>
    <my_watched_episodes>37</my_watched_episodes>
    <my_start_date>2020-01-05</my_start_date>
    <my_finish_date>0000-00-00</my_finish_date>
    <my_score>9</my_score>
    <my_status>Completed</my_status>
    <my_comments><![CDATA[L &amp; Light]]></my_comments>
    <my_times_watched>1</my_times_watched>
    <my_rewatching>0</my_rewatching>
  </anime>
  <anime>
    <series_animedb_id>30</series_animedb_id>
    <series_title>Neon Genesis Evangelion</series_title>
    <my_watched_episodes>3</my_watched_episodes>
    <my_score>0</my_score>
    <my_status>On-Hold</my_status>
  </anime>
</myanimelist>`

describe('parseMalExport', () => {
  it('reads anime entries from a MAL XML export', () => {
    const [deathNote, eva] = parseMalExport(MAL_EXPORT)
    assert.equal(deathNote.malId, 1535)
    assert.equal(deathNote.title, 'Death Note')
    assert.equal(deathNote.status, 'completed')
    assert.equal(deathNote.score, 9)
    assert.equal(deathNote.startedOn, '2020-01-05')
    assert.equal(deathNote.completedOn, null)
    assert.equal(deathNote.notes, 'L &amp; Light')
    assert.equal(deathNote.rewatchCount, 1)
    assert.equal(eva.status, 'on_hold')
    assert.equal(eva.score, null)
  })

  it('rejects files that are not MAL exports', () => {
    assert.throws(() => parseMalExport('<html></html>'), ImportError)
  })

  it('reads a gzipped export', () => {
    const gzipBase64 = gzipSync(Buffer.from(MAL_EXPORT)).toString('base64')
    assert.equal(parseMalExport(readMalExportFile({ gzipBase64 })).length, 2)
  })
})

describe('mapTmdbLists', () => {
  it('marks rated titles completed and lets ratings win over the watchlist', () => {
    const entries = mapTmdbLists({
      watchlist: { movies: [{ id: 129, title: 'Spirited Away' }], tv: [{ id: 1429, name: 'AoT' }] },
      rated: { movies: [{ id: 129, title: 'Spirited Away', rating: 9.5 }], tv: [] },
    })
    assert.equal(entries.length, 2)
    const movie = entries.find((entry) => entry.tmdbType === 'movie')
    assert.equal(movie.status, 'completed')
    assert.equal(movie.score, 10)
    const show = entries.find((entry) => entry.tmdbType === 'tv')
    assert.equal(show.status, 'plan_to_watch')
    assert.equal(show.score, null)
  })
})

const entry = (overrides) => ({
  source: 'mal',
  anilistId: null,
  malId: null,
  tmdbId: null,
  tmdbType: null,
  title: 'x',
  status: 'plan_to_watch',
  progress: 0,
  score: null,
  startedOn: null,
  completedOn: null,
  rewatchCount: 0,
  notes: null,
  updatedAt: null,
  ...overrides,
})

describe('matchEntries', () => {
  const titles = [
    { id: 'a', kind: 'series', anilistId: 1, malId: 10, tmdbId: 100, episodeCount: 12 },
    { id: 'b', kind: 'movie', anilistId: null, malId: 20, tmdbId: 100, episodeCount: null },
  ]

  it('matches by AniList, MAL, and TMDB id of the right kind', () => {
    const { matched, unmatched } = matchEntries(
      [
        entry({ anilistId: 1 }),
        entry({ malId: 20 }),
        entry({ tmdbId: 100, tmdbType: 'movie' }),
        entry({ tmdbId: 100, tmdbType: 'tv' }),
        entry({ malId: 999 }),
      ],
      titles,
    )
    assert.deepEqual(
      matched.map((pair) => pair.title.id),
      ['a', 'b', 'b', 'a'],
    )
    assert.equal(unmatched.length, 1)
  })
})

describe('combineStatus and mergeByTitle', () => {
  it('combines season entries that share one catalog title', () => {
    assert.equal(combineStatus('completed', 'completed'), 'completed')
    assert.equal(combineStatus('completed', 'plan_to_watch'), 'watching')
    assert.equal(combineStatus('completed', 'dropped'), 'dropped')
    const title = { id: 'a', kind: 'series', episodeCount: 24 }
    const [merged] = mergeByTitle([
      { entry: entry({ status: 'completed', progress: 12, score: 7, startedOn: '2020-01-01' }), title },
      { entry: entry({ status: 'watching', progress: 4, score: 9, startedOn: '2021-01-01' }), title },
    ])
    assert.equal(merged.entry.status, 'watching')
    assert.equal(merged.entry.progress, 16)
    assert.equal(merged.entry.score, 9)
    assert.equal(merged.entry.startedOn, '2020-01-01')
  })
})

describe('toWatchlistRow', () => {
  it('fills completed titles and caps progress at the episode count', () => {
    const series = { id: 'a', kind: 'series', episodeCount: 12 }
    assert.equal(toWatchlistRow(entry({ status: 'completed' }), series).current_episode, 12)
    assert.equal(toWatchlistRow(entry({ status: 'watching', progress: 30 }), series).current_episode, 12)
    const movie = { id: 'b', kind: 'movie', episodeCount: null }
    assert.equal(toWatchlistRow(entry({ status: 'completed' }), movie).current_episode, 1)
    assert.equal(
      toWatchlistRow(entry({ status: 'watching', completedOn: '2020-01-01' }), series).completed_on,
      null,
    )
  })
})

describe('prepareImport', () => {
  it('rejects bad usernames and unknown sources before starting a job', () => {
    assert.throws(() => prepareImport('anilist', { username: 'bad name!' }), ImportError)
    assert.throws(() => prepareImport('letterboxd', {}), ImportError)
    assert.equal(typeof prepareImport('anilist', { username: 'Someone_1' }), 'function')
  })
})
