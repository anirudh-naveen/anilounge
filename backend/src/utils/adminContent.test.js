import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  applyAdminOverrides,
  fieldsForKind,
  mergeOverrides,
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

  it('gives people and studios their own fields', () => {
    assert.deepEqual(fieldsForKind('character'), [
      'name',
      'englishName',
      'nativeName',
      'about',
      'imagePath',
    ])
    assert.deepEqual(fieldsForKind('studio'), ['name', 'nativeName', 'about', 'imagePath'])
    assert.deepEqual(fieldsForKind('franchise'), ['name', 'nicknames'])
    assert.ok(fieldsForKind('series').includes('nicknames'))
    assert.ok(!fieldsForKind('movie').includes('name'))
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

  it('parses nicknames from text or a list, dropping blanks and repeats', () => {
    assert.deepEqual(parseContentEdits({ nicknames: ' KonoSuba, konosuba,,\nKS ' }, 'series'), {
      values: { nicknames: ['KonoSuba', 'KS'] },
      errors: [],
    })
    assert.deepEqual(parseContentEdits({ nicknames: ['MHA'] }, 'franchise').values, {
      nicknames: ['MHA'],
    })
    assert.deepEqual(parseContentEdits({ nicknames: '' }, 'movie').values, { nicknames: [] })
    assert.equal(parseContentEdits({ nicknames: [1] }, 'movie').errors.length, 1)
    assert.equal(parseContentEdits({ nicknames: 'x' }, 'studio').errors.length, 1)
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

describe('mergeOverrides', () => {
  it('keeps the old name as an alias when renaming, and unlocks fields', () => {
    const next = mergeOverrides(
      { about: 'old', name: 'Mappa' },
      { values: { name: 'MAPPA' }, unlock: ['about'], kind: 'studio', oldName: 'Mappa' },
    )
    assert.deepEqual(next, { name: 'MAPPA', _aliases: ['Mappa'] })
  })

  it('drops an alias that becomes the name again', () => {
    const next = mergeOverrides(
      { title: 'B', _aliases: ['A'] },
      { values: { title: 'A' }, unlock: [], kind: 'movie', oldName: 'B' },
    )
    assert.deepEqual(next._aliases, ['B'])
  })

  it('drops a nickname list when it is cleared', () => {
    const next = mergeOverrides(
      { nicknames: ['MHA'], title: 'My Hero Academia' },
      { values: { nicknames: [] }, unlock: [], kind: 'series' },
    )
    assert.deepEqual(next, { title: 'My Hero Academia' })
  })

  it('adds nicknames to the alternative titles the sync writes', () => {
    const doc = applyAdminOverrides(
      { title: 'Kono Subarashii Sekai ni Shukufuku wo!', alternativeTitles: ['God\'s Blessing'] },
      { nicknames: ['KonoSuba'], _aliases: ['Old Name'] },
      'series',
    )
    assert.deepEqual(doc.alternativeTitles, ['God\'s Blessing', 'Old Name', 'KonoSuba'])
    assert.deepEqual(doc.nicknames, ['KonoSuba'])
  })

  it('re-applies aliases to the sync document', () => {
    const doc = applyAdminOverrides(
      { name: 'Mappa', alternativeNames: ['M'] },
      { name: 'MAPPA', _aliases: ['Mappa'] },
      'studio',
    )
    assert.equal(doc.name, 'MAPPA')
    assert.deepEqual(doc.alternativeNames, ['M', 'Mappa'])
  })
})
