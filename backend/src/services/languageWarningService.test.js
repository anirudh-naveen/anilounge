import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  breakdown,
  excerpt,
  EXCERPT_MAX,
  maskTerm,
  WARNING_LIMIT,
  warningMessage,
} from './languageWarningService.js'

describe('maskTerm', () => {
  it('keeps the first letter', () => {
    assert.equal(maskTerm('fuck'), 'f***')
    assert.equal(maskTerm(''), '')
  })
})

describe('excerpt', () => {
  it('trims and caps the stored text', () => {
    assert.equal(excerpt('  hi  '), 'hi')
    const long = excerpt('a'.repeat(EXCERPT_MAX + 50))
    assert.equal(long.length, EXCERPT_MAX)
    assert.ok(long.endsWith('…'))
  })
})

describe('warningMessage', () => {
  it('counts down to the limit', () => {
    assert.equal(WARNING_LIMIT, 3)
    assert.match(
      warningMessage(1, 'direct message'),
      /Warning 1 of 3\. Admins are notified after 3/,
    )
    assert.match(warningMessage(1, 'direct message'), /sent with those words hidden/)
    assert.match(warningMessage(3), /Warning 3 of 3\. This is your final warning/)
  })

  it('says admins were notified past the limit', () => {
    assert.match(warningMessage(4), /admins have been notified/)
    assert.doesNotMatch(warningMessage(4), /Warning \d of/)
  })

  it('says when the text was refused instead of sent', () => {
    assert.match(warningMessage(2, 'direct message', false), /so it wasn't sent/)
  })
})

describe('warningMessage categories', () => {
  it('names slurs as never allowed', () => {
    assert.match(
      warningMessage(1, 'direct message', true, 'slur'),
      /a slur, which is never allowed/,
    )
    assert.match(warningMessage(1, 'direct message', true, 'curse'), /language that isn't allowed/)
  })
})

describe('breakdown', () => {
  it('counts each category', () => {
    assert.equal(breakdown(3, 1), '3 curses, 1 slur')
    assert.equal(breakdown(1, 0), '1 curse, 0 slurs')
  })
})
