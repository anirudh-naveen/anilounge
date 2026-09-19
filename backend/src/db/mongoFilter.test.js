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
    assert.match(compiled.sql, /c\.content_type/)
    assert.match(compiled.sql, /c\.airing_status/)
    assert.equal(compiled.params[0], 'tv')
    assert.equal(compiled.params[1], 'upcoming')
  })
})
