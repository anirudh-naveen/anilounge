import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { withAdminOrder } from './franchiseService.js'

const ids = (works) => works.map((work) => work._id)
const works = ['a', 'b', 'c', 'd'].map((_id) => ({ _id }))

describe('withAdminOrder', () => {
  it('keeps the computed order without an admin order', () => {
    assert.deepEqual(ids(withAdminOrder(works, null)), ['a', 'b', 'c', 'd'])
  })

  it('puts placed titles in the admin order and later additions after them', () => {
    assert.deepEqual(ids(withAdminOrder(works, ['c', 'a', 'gone', 'b'])), ['c', 'a', 'b', 'd'])
  })
})
