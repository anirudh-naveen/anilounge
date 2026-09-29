import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  applyAdminOverrides,
  fieldsForKind,
  parseContentEdits,
  readEditableFields,
} from './adminContent.js'

describe('fieldsForKind', () => {
  it('limits runtime to movies/specials and episode counts to series', () => {
    assert.ok(fieldsForKind('movie').includes('runtime'))
    assert.ok(!fieldsForKind('movie').includes('episodeCount'))
    assert.ok(fieldsForKind('series').includes('seasonCount'))
    assert.ok(!fieldsForKind('series').includes('runtime'))
  })
})

describe('parseContentEdits', () => {
  it('trims text, clears empty optional fields, and parses numbers', () => {
    const { values, errors } = parseContentEdits(
      { title: '  Frieren ', tagline: '', episodeCount: '28', releaseDate: '2023-09-29' },
      'series',
    )
    assert.deepEqual(errors, [])
    assert.deepEqual(values, {
      title: 'Frieren',
      tagline: null,
      episodeCount: 28,
      releaseDate: '2023-09-29',
    })
  })

  it('rejects bad values and fields that do not apply to the kind', () => {
    const { errors } = parseContentEdits(
      {
        title: '',
        runtime: 90,
        releaseDate: '29/09/2023',
        airingStatus: 'cancelled',
        posterPath: 'javascript:alert(1)',
        name: 'x',
      },
      'series',
    )
    assert.equal(errors.length, 6)
  })

  it('accepts TMDB paths and full image URLs', () => {
    const { errors } = parseContentEdits(
      { posterPath: '/abc.jpg', backdropPath: 'https://cdn.example.com/b.png' },
      'movie',
    )
    assert.deepEqual(errors, [])
  })
})

describe('applyAdminOverrides', () => {
  it('maps admin fields onto the document the sync built', () => {
    const doc = { title: 'Sousou no Frieren', englishTitle: 'Sousou no Frieren', malStatus: null }
    applyAdminOverrides(
      doc,
      { title: 'Frieren', airingStatus: 'finished', episodeCount: 28, runtime: 24 },
      'series',
    )
    assert.equal(doc.title, 'Frieren')
    assert.equal(doc.englishTitle, 'Frieren')
    assert.equal(doc.malStatus, 'finished_airing')
    assert.equal(doc.episodeCount, 28)
    assert.equal(doc.runtime, undefined)
  })

  it('round-trips through readEditableFields', () => {
    const doc = applyAdminOverrides({}, { title: 'Your Name', airingStatus: 'finished' }, 'movie')
    const values = readEditableFields({ ...doc, releaseDate: new Date(2016, 7, 26) }, 'movie')
    assert.equal(values.title, 'Your Name')
    assert.equal(values.airingStatus, 'finished')
    assert.equal(values.releaseDate, '2016-08-26')
  })
})
