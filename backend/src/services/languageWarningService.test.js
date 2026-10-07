import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
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
