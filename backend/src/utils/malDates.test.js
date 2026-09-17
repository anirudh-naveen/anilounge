import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseMalDate } from './malDates.js'

describe('parseMalDate', () => {
  it('parses full and partial start dates as UTC', () => {
    assert.equal(parseMalDate('2011-07-16')?.toISOString(), '2011-07-16T00:00:00.000Z')
    assert.equal(parseMalDate('2011-07')?.toISOString(), '2011-07-01T00:00:00.000Z')
    assert.equal(parseMalDate('2011')?.toISOString(), '2011-01-01T00:00:00.000Z')
  })

  it('uses the end of a partial date when bound is end', () => {
    assert.equal(
      parseMalDate('2011-07', { bound: 'end' })?.toISOString(),
      '2011-07-31T23:59:59.999Z',
    )
    assert.equal(parseMalDate('2011', { bound: 'end' })?.toISOString(), '2011-12-31T23:59:59.999Z')
  })

  it('returns null for missing or invalid values', () => {
    assert.equal(parseMalDate(null), null)
    assert.equal(parseMalDate('soon'), null)
  })
})
