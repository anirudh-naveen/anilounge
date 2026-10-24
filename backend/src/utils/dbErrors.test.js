import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isConnectionError } from './dbErrors.js'

describe('isConnectionError', () => {
  it('spots dropped and unreachable connections', () => {
    assert.equal(isConnectionError(new Error('Connection terminated unexpectedly')), true)
    assert.equal(isConnectionError(Object.assign(new Error('x'), { code: 'ENOTFOUND' })), true)
    assert.equal(isConnectionError(Object.assign(new Error('x'), { code: '57P01' })), true)
    assert.equal(isConnectionError(Object.assign(new Error('x'), { code: '08006' })), true)
  })

  it('leaves statement errors to the per-row handling', () => {
    assert.equal(isConnectionError(Object.assign(new Error('dup'), { code: '23505' })), false)
    assert.equal(isConnectionError(new Error('invalid input syntax for type uuid')), false)
  })
})
