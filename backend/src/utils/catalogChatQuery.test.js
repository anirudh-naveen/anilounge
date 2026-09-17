import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildCatalogChatQuery,
  escapeRegex,
  hasCatalogIntent,
  inferCatalogFiltersFromMessage,
  matchChatContentType,
} from './catalogChatQuery.js'

describe('escapeRegex', () => {
  it('escapes regex metacharacters', () => {
    assert.equal(escapeRegex('Naruto (TV)'), 'Naruto \\(TV\\)')
  })
})

describe('matchChatContentType', () => {
  it('treats movie as movies plus specials', () => {
    assert.deepEqual(matchChatContentType('movie'), { contentType: { $in: ['movie', 'special'] } })
    assert.deepEqual(matchChatContentType('tv'), { contentType: 'tv' })
    assert.deepEqual(matchChatContentType('all'), {})
  })
})

describe('buildCatalogChatQuery', () => {
  const from = new Date('2026-09-16T12:00:00.000Z')

  it('matches title fields, genre, studio, and Japan including MAL-only rows', () => {
    const query = buildCatalogChatQuery(
      {
        query: 'nausicaa',
        genre: 'Adventure',
        studio: 'Ghibli',
        originCountry: 'jp',
        contentType: 'movie',
      },
      from,
    )

    assert.equal(query.$and.length >= 4, true)
    assert.deepEqual(query.$and[0], { contentType: { $in: ['movie', 'special'] } })
    const titleClause = query.$and.find((part) => Array.isArray(part.$or) && part.$or[0]?.title)
    assert.equal(titleClause.$or[0].title.$regex, 'nausicaa')
    assert.deepEqual(query.$and.find((part) => part['genres.name']), {
      'genres.name': { $regex: '^Adventure$', $options: 'i' },
    })
  })

  it('filters currently airing TV the same way as the TV catalog tab', () => {
    const query = buildCatalogChatQuery({ status: 'airing' }, from)
    assert.equal(query.contentType, 'tv')
    assert.deepEqual(query.$or[0], { malStatus: 'currently_airing' })
  })

  it('matches a calendar year via release date or start season year', () => {
    const query = buildCatalogChatQuery({ year: 2024 }, from)
    assert.deepEqual(query.$or[1], { startSeasonYear: 2024 })
    assert.deepEqual(query.$or[0].releaseDate.$gte, new Date(Date.UTC(2024, 0, 1)))
  })

  it('returns an empty filter when nothing is set', () => {
    assert.deepEqual(buildCatalogChatQuery({}, from), {})
  })
})

describe('inferCatalogFiltersFromMessage', () => {
  it('reads genre, Japanese origin, and movie type', () => {
    const filters = inferCatalogFiltersFromMessage('Find me some action anime movies')
    assert.equal(filters.genre, 'Action')
    assert.equal(filters.originCountry, 'JP')
    assert.equal(filters.contentType, 'movie')
  })

  it('reads Studio Ghibli and currently airing', () => {
    assert.equal(inferCatalogFiltersFromMessage('Best Studio Ghibli films').studio, 'Ghibli')
    assert.equal(inferCatalogFiltersFromMessage('What is currently airing?').status, 'airing')
  })

  it('extracts similar-to and lookup titles', () => {
    assert.equal(inferCatalogFiltersFromMessage('Something like Naruto').similarTo, 'Naruto')
    assert.equal(
      inferCatalogFiltersFromMessage('Tell me about Spirited Away').lookupTitle,
      'Spirited Away',
    )
  })

  it('does not treat greetings as catalog queries', () => {
    const filters = inferCatalogFiltersFromMessage('hello')
    assert.equal(filters.query, undefined)
    assert.equal(hasCatalogIntent('hello'), false)
    assert.equal(hasCatalogIntent('Find me some action anime'), true)
  })
})
