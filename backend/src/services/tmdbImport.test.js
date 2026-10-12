import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isWesternResult } from './tmdbImport.js'

describe('isWesternResult', () => {
  it('keeps animation in any language but Japanese, Korean, or Chinese', () => {
    assert.equal(isWesternResult({ id: 1, original_language: 'en' }), true)
    assert.equal(isWesternResult({ id: 2, original_language: 'fr' }), true)
    for (const language of ['ja', 'ko', 'zh', 'cn']) {
      assert.equal(isWesternResult({ id: 3, original_language: language }), false)
    }
  })

  it('drops results without an id', () => {
    assert.equal(isWesternResult({ original_language: 'en' }), false)
  })
})
