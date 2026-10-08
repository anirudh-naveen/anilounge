import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { compileMongoFilter } from './mongoFilter.js'

describe('compileMongoFilter', () => {
  it('keeps sibling fields when $or is present', () => {
    const compiled = compileMongoFilter(
      {
        entityType: 'studio',
        $or: [{ name: /ghibli/i }, { englishName: /ghibli/i }],
      },
      'entities',
    )
    assert.match(compiled.sql, /e\.kind/)
    assert.match(compiled.sql, /OR/)
    assert.equal(compiled.params[0], 'studio')
  })

  it('treats $nin as including SQL NULL', () => {
    const compiled = compileMongoFilter({
      malStatus: { $nin: ['finished_airing', 'currently_airing'] },
    })
    assert.match(compiled.sql, /IS NOT TRUE/)
    assert.deepEqual(compiled.params[0], ['finished', 'airing'])
  })

  it('combines content type with upcoming status', () => {
    const compiled = compileMongoFilter({
      contentType: 'tv',
      $or: [{ malStatus: 'not_yet_aired' }, { releaseDate: { $gt: new Date('2026-09-18') } }],
    })
    // Filters the indexed kind column: 'tv' is kind 'series'.
    assert.match(compiled.sql, /c\.kind/)
    assert.match(compiled.sql, /c\.airing_status/)
    assert.equal(compiled.params[0], 'series')
    assert.equal(compiled.params[1], 'upcoming')
  })

  it('compares $titleKey on normalized, lowercased, space-free names', () => {
    const compiled = compileMongoFilter({
      $or: [{ title: { $titleKey: 'rezero' } }, { alternativeTitles: { $titleKey: 'rezero' } }],
    })
    assert.match(compiled.sql, /regexp_replace\(lower\(normalize\(c\.title, NFKC\)\), '\\s', '', 'g'\) = \$1/)
    assert.match(compiled.sql, /content_akas ca/)
    assert.deepEqual(compiled.params, ['rezero', 'rezero'])
  })

  it('compares ids as uuids so the primary key index applies', () => {
    const id = '0b6b1a52-6f0e-4a3e-9d1c-7d2f3b9a8c11'
    assert.equal(compileMongoFilter({ _id: id }).sql, 'c.id = $1::uuid')
    assert.equal(compileMongoFilter({ _id: 'not-a-uuid' }).sql, 'FALSE')
    const many = compileMongoFilter({ _id: { $in: [id, 'bad'] } })
    assert.equal(many.sql, 'c.id = ANY($1::uuid[])')
    assert.deepEqual(many.params[0], [id])
  })

  it('maps movie content types onto kinds', () => {
    const compiled = compileMongoFilter({ contentType: { $in: ['movie', 'special'] } })
    assert.match(compiled.sql, /c\.kind = ANY/)
    assert.deepEqual(compiled.params[0], ['movie', 'special'])
  })
})
