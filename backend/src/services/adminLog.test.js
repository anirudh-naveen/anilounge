import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { describeRow, quoteValue } from './adminLog.js'

describe('admin log formatting', () => {
  it('quotes, collapses whitespace, and shortens long values', () => {
    assert.equal(quoteValue('  two\n lines '), '"two lines"')
    assert.equal(quoteValue(null), '(empty)')
    const long = quoteValue('x'.repeat(300))
    assert.equal(long.length, 122)
    assert.ok(long.endsWith('…"'))
  })

  it('labels rows by kind', () => {
    assert.equal(describeRow('voice', 'Kana Ichinose'), 'voice actor "Kana Ichinose"')
    assert.equal(describeRow('series', 'Frieren'), 'series "Frieren"')
  })
})
