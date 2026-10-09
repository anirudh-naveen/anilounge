import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { indexableSql } from './seoIndexing.js'

describe('indexableSql', () => {
  it('combines per-kind rules and rejects unknown kinds', () => {
    assert.equal(indexableSql(['movie', 'series']), "(c.kind = 'movie' OR c.kind = 'series')")
    assert.match(indexableSql(['character']), /a\.role = 'main'/)
    assert.throws(() => indexableSql(['user']))
  })
})
