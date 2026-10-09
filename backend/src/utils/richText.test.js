import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { stripFormatting } from './richText.js'

describe('stripFormatting', () => {
  it('removes inline and line marks', () => {
    assert.equal(
      stripFormatting('## Big **news**\n- [one](https://a.test)\n1. ***two***\n> ~~old~~ _new_'),
      'Big news\none\ntwo\nold new',
    )
  })

  it('keeps text that only looks like marks', () => {
    assert.equal(stripFormatting('2 * 3 * 4 and snake_case_name'), '2 * 3 * 4 and snake_case_name')
    assert.equal(stripFormatting('[x](javascript:alert(1))'), '[x](javascript:alert(1))')
  })
})
