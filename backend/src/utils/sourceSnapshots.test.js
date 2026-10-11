import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  anilistKeyStaff,
  anilistSnapshot,
  compactSnapshot,
  dateString,
  isPlaceholderTitle,
  malSnapshot,
  mergeEpisodes,
  tmdbSnapshot,
} from './sourceSnapshots.js'

describe('anilistSnapshot', () => {
  const media = {
    id: 189123,
    idMal: 61323,
    format: 'TV',
    status: 'RELEASING',
    countryOfOrigin: 'JP',
    title: {
      english: 'Blue Box Season 2',
      romaji: 'Ao no Hako 2nd Season',
      native: 'アオのハコ 第2期',
    },
    synonyms: ['Ao no Hako 2'],
    startDate: { year: 2026, month: 10, day: 2 },
    endDate: { year: null },
    season: 'FALL',
    seasonYear: 2026,
    episodes: 12,
    duration: 24,
    genres: ['Romance', 'Sports'],
    averageScore: 81,
    description: 'Taiki and Chinatsu...<br><br>(Source: Crunchyroll)',
    coverImage: { extraLarge: 'https://img/cover.jpg', color: '#1a5ee4' },
    bannerImage: 'https://img/banner.jpg',
    source: 'MANGA',
    trailer: { id: 'abc123', site: 'youtube' },
    nextAiringEpisode: { airingAt: 1791158400, episode: 3 },
    tags: [{ name: 'Badminton', category: 'Theme-Game-Sport', rank: 94, isMediaSpoiler: false }],
    studios: {
      edges: [
        { node: { id: 1, name: 'Telecom Animation Film', isAnimationStudio: true } },
        { node: { id: 2, name: 'Shueisha', isAnimationStudio: false } },
      ],
    },
    staff: {
      edges: [
        { role: 'Episode Director (ep 3)', node: { id: 9, name: { full: 'A' } } },
        { role: 'Director', node: { id: 10, name: { full: 'Yuuta Yabuuchi' } } },
        { role: 'Original Creator', node: { id: 11, name: { full: 'Kouji Miura' } } },
      ],
    },
  }

  it('maps titles, art, airing, and season', () => {
    const snapshot = anilistSnapshot(media)
    assert.equal(snapshot.title, 'Blue Box Season 2')
    assert.equal(snapshot.romajiTitle, 'Ao no Hako 2nd Season')
    assert.equal(snapshot.overview, 'Taiki and Chinatsu...\n\n(Source: Crunchyroll)')
    assert.equal(snapshot.bannerPath, 'https://img/banner.jpg')
    assert.equal(snapshot.coverColor, '#1a5ee4')
    assert.equal(snapshot.releaseDate, '2026-10-02')
    assert.equal(snapshot.endDate, null)
    assert.equal(snapshot.airingStatus, 'airing')
    assert.equal(snapshot.startSeason, 'fall')
    assert.equal(snapshot.startYear, 2026)
    assert.equal(snapshot.episodeCount, 12)
    assert.equal(snapshot.episodeRuntime, 24)
    assert.equal(snapshot.nextEpisodeNumber, 3)
    assert.equal(snapshot.sourceMaterial, 'manga')
    assert.deepEqual(snapshot.trailer, { site: 'youtube', key: 'abc123' })
    assert.equal(snapshot.score, 8.1)
    assert.deepEqual(snapshot.studios, [{ name: 'Telecom Animation Film', anilistId: 1 }])
    assert.equal(snapshot.tags[0].rank, 94)
  })

  it('keeps key staff only, ordered by role', () => {
    assert.deepEqual(
      anilistKeyStaff(media.staff.edges).map(({ name, role }) => [name, role]),
      [
        ['Kouji Miura', 'Original Creator'],
        ['Yuuta Yabuuchi', 'Director'],
      ],
    )
  })
})

describe('malSnapshot', () => {
  it('maps a MAL document, with scores and broadcast', () => {
    const snapshot = malSnapshot({
      id: 61323,
      title: 'Ao no Hako 2nd Season',
      alternative_titles: { en: 'Blue Box Season 2', ja: 'アオのハコ 第2期', synonyms: [] },
      synopsis: 'Second season.\n\n[Written by MAL Rewrite]',
      main_picture: { medium: 'm.jpg', large: 'l.jpg' },
      start_date: '2026-10',
      status: 'currently_airing',
      media_type: 'tv',
      num_episodes: 12,
      average_episode_duration: 1420,
      start_season: { year: 2026, season: 'fall' },
      broadcast: { day_of_the_week: 'thursday', start_time: '23:45' },
      rating: 'pg_13',
      source: 'manga',
      mean: 8.3,
      num_scoring_users: 40000,
      rank: 210,
      genres: [{ name: 'Romance' }],
      studios: [{ id: 103, name: 'Telecom Animation Film' }],
    })
    assert.equal(snapshot.title, 'Blue Box Season 2')
    assert.equal(snapshot.overview, 'Second season.')
    assert.equal(snapshot.posterPath, 'l.jpg')
    assert.equal(snapshot.releaseDate, '2026-10-01')
    assert.equal(snapshot.airingStatus, 'airing')
    assert.equal(snapshot.episodeRuntime, 24)
    assert.equal(snapshot.broadcastDay, 'thursday')
    assert.equal(snapshot.ageRating, 'pg_13')
    assert.deepEqual([snapshot.score, snapshot.votes, snapshot.rank], [8.3, 40000, 210])
  })
})

describe('tmdbSnapshot', () => {
  it('maps a TV show with ids, trailer, and age rating', () => {
    const snapshot = tmdbSnapshot(
      {
        id: 207347,
        name: 'Blue Box',
        original_name: 'アオのハコ',
        first_air_date: '2024-10-03',
        last_air_date: '2026-10-11',
        status: 'Returning Series',
        next_episode_to_air: { air_date: '2026-10-18', episode_number: 28, season_number: 1 },
        number_of_episodes: 37,
        number_of_seasons: 1,
        vote_average: 8.5,
        vote_count: 300,
        popularity: 42.5,
        origin_country: ['JP'],
        external_ids: { imdb_id: 'tt3', tvdb_id: 440000, wikidata_id: 'Q1' },
        videos: {
          results: [
            { site: 'YouTube', key: 'teaser', type: 'Teaser' },
            { site: 'YouTube', key: 'trail', type: 'Trailer', official: true },
          ],
        },
        content_ratings: { results: [{ iso_3166_1: 'US', rating: 'TV-14' }] },
      },
      'tv',
    )
    assert.equal(snapshot.airingStatus, 'airing')
    assert.equal(snapshot.seasonCount, 1)
    assert.equal(snapshot.ageRating, 'TV-14')
    assert.deepEqual(snapshot.trailer, { site: 'youtube', key: 'trail' })
    assert.deepEqual(snapshot.externalIds, { imdb: 'tt3', tvdb: '440000', wikidata: 'Q1' })
    assert.equal(snapshot.originCountry, 'JP')
  })
})

describe('isPlaceholderTitle', () => {
  it('spots number-only titles', () => {
    assert.equal(isPlaceholderTitle('Episode 28'), true)
    assert.equal(isPlaceholderTitle('第3話'), true)
    assert.equal(isPlaceholderTitle(''), true)
    assert.equal(isPlaceholderTitle('Déjà Vu'), false)
  })
})

describe('dateString', () => {
  it('fills a missing month or day', () => {
    assert.equal(dateString('2024'), '2024-01-01')
    assert.equal(dateString('2024-10'), '2024-10-01')
    assert.equal(dateString('nope'), null)
  })
})

describe('mergeEpisodes', () => {
  const tmdb = [
    { number: 1, title: 'Déjà Vu', stillPath: '/1.jpg', airDate: '2026-10-04', tmdbEpisodeId: 1 },
    { number: 2, title: 'Episode 27', stillPath: '/2.jpg', airDate: '2026-10-11' },
  ]
  const jikan = [
    { mal_id: 1, title: 'Deja Vu', title_romanji: 'Déjà vu', title_japanese: 'デジャヴ' },
    { mal_id: 2, title: 'Rally', recap: false, filler: true },
  ]

  it("takes anime titles from MAL, stills from TMDB, and AniList's exact air times", () => {
    const episodes = mergeEpisodes({
      anime: true,
      count: 12,
      tmdb,
      jikan,
      schedule: [
        { episode: 3, airingAt: 1791158400 },
        { episode: 13, airingAt: 1800000000 },
      ],
    })
    assert.deepEqual(
      episodes.map(({ number, title, stillPath, isFiller }) => [
        number,
        title,
        stillPath,
        isFiller,
      ]),
      [
        [1, 'Deja Vu', '/1.jpg', false],
        [2, 'Rally', '/2.jpg', true],
        [3, 'Episode 3', null, false],
      ],
    )
    assert.equal(episodes[0].titleNative, 'デジャヴ')
    assert.equal(episodes[2].airAt, new Date(1791158400 * 1000).toISOString())
  })

  it('takes TMDB titles first for other shows, skipping placeholders', () => {
    const episodes = mergeEpisodes({ anime: false, tmdb, jikan })
    assert.deepEqual(
      episodes.map(({ title }) => title),
      ['Déjà Vu', 'Rally'],
    )
  })
})

describe('compactSnapshot', () => {
  it('drops missing values and empty ids', () => {
    assert.deepEqual(
      compactSnapshot({
        title: 'A',
        overview: '',
        genres: [],
        score: 0,
        externalIds: { imdb: undefined },
      }),
      { title: 'A', score: 0 },
    )
  })
})
