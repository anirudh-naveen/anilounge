import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import {
  anilistFullName,
  anilistImage,
  anilistRequest,
  anilistStatus,
  anilistToNewContent,
  cleanAnilistText,
  convertAnilistToContent,
  fetchAnilistMediaBatch,
  fetchAnilistPopular,
  getAnilistMedia,
  mapAnilistCharacterEdge,
  pickAnilistMatch,
  resetAnilistState,
} from './anilistService.js'
import { pickTmdbMatch } from './anilistImport.js'

describe('AniList import', () => {
  beforeEach(resetAnilistState)

  const donghua = {
    id: 101,
    idMal: null,
    format: 'ONA',
    countryOfOrigin: 'CN',
    title: { romaji: 'Tian Guan Ci Fu', english: "Heaven Official's Blessing", native: '天官赐福' },
    synonyms: ['TGCF'],
    startDate: { year: 2020, month: 10, day: 31 },
    endDate: { year: 2021, month: 2, day: 6 },
    season: 'FALL',
    seasonYear: 2020,
    episodes: 11,
    genres: ['Adventure', 'Fantasy'],
    averageScore: 83,
    description: 'A god <i>ascends</i> again.',
    coverImage: { large: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/tgcf.jpg' },
    studios: { edges: [{ isMain: true, node: { id: 9, name: 'Haoliners Animation League', isAnimationStudio: true } }] },
  }

  it('builds a full catalog title for an AniList-only anime', () => {
    const content = anilistToNewContent(donghua)
    assert.equal(content.title, "Heaven Official's Blessing")
    assert.equal(content.nativeTitle, '天官赐福')
    assert.ok(content.alternativeTitles.includes('Tian Guan Ci Fu'))
    assert.equal(content.contentType, 'tv')
    assert.equal(content.episodeCount, 11)
    assert.equal(content.releaseDate.toISOString().slice(0, 10), '2020-10-31')
    assert.equal(content.startSeason, 'fall')
    assert.deepEqual(content.originCountries, ['CN'])
    assert.deepEqual(content.genres, [{ name: 'Adventure' }, { name: 'Fantasy' }])
    assert.equal(content.unifiedScore, 8.3)
    assert.deepEqual(content.studioRefs, [{ name: 'Haoliners Animation League', anilistId: 9 }])
    assert.equal(content.overview, 'A god ascends again.')
  })

  it('refuses music videos', () => {
    assert.equal(anilistToNewContent({ ...donghua, format: 'MUSIC' }), null)
  })

  it('pages the popularity ranking and caches each anime', async () => {
    const { fetchImpl, calls } = fakeFetch([
      { status: 200, body: { data: { Page: { pageInfo: { hasNextPage: true }, media: [donghua] } } } },
    ])
    const page = await fetchAnilistPopular({ page: 2, perPage: 50 }, { fetchImpl })
    assert.equal(page.hasNextPage, true)
    assert.equal(page.media[0].id, 101)
    assert.equal(calls[0].variables.page, 2)
    assert.ok(!calls[0].variables.formats.includes('MUSIC'))
    assert.equal((await getAnilistMedia({ anilistId: 101 }, { fetchImpl })).id, 101)
  })

  it('links TMDB only for one same-name title from the same year', () => {
    const content = { title: 'Frieren', englishTitle: 'Frieren', releaseDate: '2023-09-29' }
    const hit = (tmdbId, title, date) => ({ tmdbId, title, releaseDate: date })
    assert.equal(pickTmdbMatch(content, [hit(209867, 'Frieren', '2023-09-29')]).tmdbId, 209867)
    assert.equal(pickTmdbMatch(content, [hit(1, 'Frieren', '2010-01-01')]), null)
    assert.equal(pickTmdbMatch(content, [hit(2, 'Frieren Recap', '2023-09-29')]), null)
    assert.equal(
      pickTmdbMatch(content, [hit(3, 'Frieren', '2023-01-01'), hit(4, 'Frieren', '2024-01-01')]),
      null,
    )
    assert.equal(pickTmdbMatch({ title: 'Frieren' }, [hit(5, 'Frieren', '2023-09-29')]), null)
  })
})

function fakeFetch(responses) {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push(JSON.parse(init.body))
    const next = responses.shift()
    return {
      status: next.status,
      headers: new Headers(next.headers || {}),
      json: async () => next.body,
    }
  }
  return { fetchImpl, calls }
}

const voice = (id, name, languageV2, native = null) => ({
  voiceActor: { id, name: { full: name, native }, image: { large: `https://s4.anilist.co/staff/${id}.jpg` }, languageV2 },
})

describe('mapAnilistCharacterEdge', () => {
  it('maps role, portrait, and Japanese then English voice actors', () => {
    const payload = mapAnilistCharacterEdge(
      {
        role: 'MAIN',
        node: {
          id: 130102,
          name: { full: 'Denji', native: 'デンジ', alternative: ['Chainsaw Man', 'Denji'] },
          image: { large: 'https://s4.anilist.co/file/anilistcdn/character/large/b130102.png' },
          favourites: 21013,
        },
        voiceActorRoles: [
          voice(1, 'Ryan Levy', 'English'),
          voice(2, 'Erick Bougleux', 'Portuguese'),
          voice(3, 'Kikunosuke Toya', 'Japanese', '戸谷菊之介'),
          voice(4, 'Second English', 'English'),
          voice(5, 'Third English', 'English'),
        ],
      },
      'work-1',
    )
    assert.equal(payload.anilistId, 130102)
    assert.equal(payload.name, 'Denji')
    assert.equal(payload.nativeName, 'デンジ')
    assert.deepEqual(payload.alternativeNames, ['Chainsaw Man'])
    assert.equal(payload.appearance.role, 'Main')
    assert.equal(payload.appearance.content, 'work-1')
    assert.deepEqual(
      payload.appearance.voiceActors.map((va) => [va.name, va.language, va.anilistId]),
      [
        ['Kikunosuke Toya', 'Japanese', 3],
        ['Ryan Levy', 'English', 1],
        ['Second English', 'English', 4],
      ],
    )
    assert.equal(payload.appearance.voiceActors[0].nativeName, '戸谷菊之介')
  })

  it('drops the AniList placeholder portrait and maps background roles to cameo', () => {
    const payload = mapAnilistCharacterEdge(
      {
        role: 'BACKGROUND',
        node: {
          id: 9,
          name: { full: 'Kobeni Higashiyama' },
          image: { large: 'https://s4.anilist.co/file/anilistcdn/character/large/default.jpg' },
        },
        voiceActorRoles: [],
      },
      'work-1',
    )
    assert.equal(payload.imagePath, '')
    assert.equal(payload.appearance.role, 'Cameo')
  })

  it('skips rows without an id or a usable name', () => {
    assert.equal(mapAnilistCharacterEdge({ node: { name: { full: 'Denji' } } }, 'w'), null)
    assert.equal(mapAnilistCharacterEdge({ node: { id: 1, name: { full: '' } } }, 'w'), null)
  })
})

describe('pickAnilistMatch', () => {
  const hxh1999 = {
    id: 136,
    format: 'TV',
    title: { romaji: 'HUNTER×HUNTER', english: 'Hunter x Hunter' },
    startDate: { year: 1999 },
  }
  const hxh2011 = {
    id: 11061,
    format: 'TV',
    title: { romaji: 'HUNTER×HUNTER (2011)', english: 'Hunter x Hunter' },
    startDate: { year: 2011 },
  }
  const movie = {
    id: 1,
    format: 'MOVIE',
    title: { english: 'Hunter x Hunter' },
    startDate: { year: 2011 },
  }

  it('picks the entry whose start year matches', () => {
    const match = pickAnilistMatch([hxh1999, hxh2011, movie], {
      titles: ['Hunter x Hunter'],
      contentType: 'tv',
      year: 2011,
    })
    assert.equal(match.id, 11061)
  })

  it('requires a compatible format', () => {
    const match = pickAnilistMatch([movie], {
      titles: ['Hunter x Hunter'],
      contentType: 'tv',
      year: 2011,
    })
    assert.equal(match, null)
  })

  it('refuses ambiguous matches without a year', () => {
    const match = pickAnilistMatch([hxh1999, hxh2011], {
      titles: ['Hunter x Hunter'],
      contentType: 'tv',
      year: null,
    })
    assert.equal(match, null)
  })

  it('refuses titles that do not match any AniList title', () => {
    const match = pickAnilistMatch([hxh2011], { titles: ['Naruto'], contentType: 'tv', year: 2011 })
    assert.equal(match, null)
  })
})

describe('AniList text and images', () => {
  it('strips spoilers, markup, and entities', () => {
    assert.equal(
      cleanAnilistText('__Height:__ 173 cm<br><br>~!He dies.!~ A &quot;devil&quot; hunter.'),
      'Height: 173 cm\n\n A "devil" hunter.',
    )
  })

  it('ignores placeholder images', () => {
    assert.equal(anilistImage('https://s4.anilist.co/file/anilistcdn/staff/large/default.jpg'), '')
    assert.equal(anilistImage('https://s4.anilist.co/x.png'), 'https://s4.anilist.co/x.png')
  })

  it('credits only animation studios on the title, keeping all studio refs', () => {
    const content = convertAnilistToContent({
      id: 5,
      idMal: 6,
      format: 'MOVIE',
      title: { romaji: 'Kimi no Na wa.', english: 'Your Name.', native: '君の名は。' },
      studios: {
        edges: [
          { isMain: false, node: { id: 10, name: 'Toho', isAnimationStudio: false } },
          { isMain: true, node: { id: 291, name: 'CoMix Wave Films', isAnimationStudio: true } },
        ],
      },
    })
    assert.equal(content.contentType, 'movie')
    assert.equal(content.malId, 6)
    assert.deepEqual(content.studios, ['CoMix Wave Films'])
    assert.deepEqual(
      content.allStudioRefs.map((ref) => ref.name),
      ['CoMix Wave Films', 'Toho'],
    )
  })
})

describe('anilistRequest', () => {
  beforeEach(() => resetAnilistState())

  it('waits for Retry-After on 429, then returns data', async () => {
    const { fetchImpl, calls } = fakeFetch([
      { status: 429, headers: { 'retry-after': '0.01' }, body: null },
      { status: 200, body: { data: { Media: { id: 1 } } } },
    ])
    const data = await anilistRequest('query { Media { id } }', {}, { fetchImpl })
    assert.deepEqual(data, { Media: { id: 1 } })
    assert.equal(calls.length, 2)
  })

  it('returns null for Not Found without retrying', async () => {
    const { fetchImpl, calls } = fakeFetch([
      { status: 404, body: { errors: [{ message: 'Not Found.' }], data: { Media: null } } },
    ])
    assert.equal(await anilistRequest('query { Media { id } }', {}, { fetchImpl }), null)
    assert.equal(calls.length, 1)
    assert.equal(anilistStatus().consecutiveFailures, 0)
  })

  it('stops calling AniList after repeated server errors', async () => {
    const { fetchImpl, calls } = fakeFetch(
      Array.from({ length: 10 }, () => ({ status: 500, body: null })),
    )
    for (let i = 0; i < 5; i += 1) {
      assert.equal(await anilistRequest('query { x }', {}, { fetchImpl }), null)
    }
    assert.equal(calls.length, 10)
    assert.equal(anilistStatus().available, false)
    assert.equal(await anilistRequest('query { x }', {}, { fetchImpl }), null)
    assert.equal(calls.length, 10)
  })
})

describe('fetchAnilistMediaBatch', () => {
  beforeEach(() => resetAnilistState())

  it('caches hits and misses so later lookups skip the API', async () => {
    const { fetchImpl, calls } = fakeFetch([
      { status: 200, body: { data: { Page: { media: [{ id: 127230, idMal: 44511 }] } } } },
    ])
    const media = await fetchAnilistMediaBatch({ malIds: [44511, 999999] }, { fetchImpl })
    assert.deepEqual(media.map((item) => item.id), [127230])
    assert.deepEqual(calls[0].variables, { ids: [44511, 999999] })

    assert.equal((await getAnilistMedia({ malId: 44511 }, { fetchImpl })).id, 127230)
    assert.equal((await getAnilistMedia({ anilistId: 127230 }, { fetchImpl })).id, 127230)
    assert.equal(await getAnilistMedia({ malId: 999999 }, { fetchImpl }), null)
    assert.equal(calls.length, 1)
  })

  it('does not reuse a cached entry without characters for a character request', async () => {
    const { fetchImpl, calls } = fakeFetch([
      { status: 200, body: { data: { Page: { media: [{ id: 1, idMal: 2 }] } } } },
      { status: 200, body: { data: { Page: { media: [{ id: 1, idMal: 2, characters: { edges: [] } }] } } } },
    ])
    await fetchAnilistMediaBatch({ malIds: [2] }, { fetchImpl })
    await fetchAnilistMediaBatch({ malIds: [2] }, { fetchImpl, withCharacters: true })
    assert.equal(calls.length, 2)
    assert.match(calls[1].query, /characters\(/)
  })
})

describe('anilistFullName', () => {
  it('keeps the middle name AniList drops from `full`', () => {
    assert.equal(
      anilistFullName({ first: 'Luffy', middle: 'D.', last: 'Monkey', full: 'Luffy Monkey' }),
      'Luffy D. Monkey',
    )
  })

  it('uses `full` when it already has the middle name or there is none', () => {
    assert.equal(
      anilistFullName({ first: 'Ace', middle: 'D.', last: 'Portgas', full: 'Ace D. Portgas' }),
      'Ace D. Portgas',
    )
    assert.equal(anilistFullName({ first: 'Subaru', last: 'Natsuki', full: 'Subaru Natsuki' }), 'Subaru Natsuki')
    assert.equal(anilistFullName({ full: 'Pikachu' }), 'Pikachu')
  })
})
