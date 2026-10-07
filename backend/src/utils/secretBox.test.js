import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { seal, unseal } from './secretBox.js'

describe('secretBox', () => {
  const env = { CONNECTIONS_SECRET: 'one' }

  it('round-trips and never stores the plain text', () => {
    const sealed = seal('token-123', env)
    assert.ok(!sealed.includes('token-123'))
    assert.equal(unseal(sealed, env), 'token-123')
    assert.notEqual(seal('token-123', env), sealed)
  })

  it('returns null for another key, tampering, or junk', () => {
    const sealed = seal('token-123', env)
    assert.equal(unseal(sealed, { CONNECTIONS_SECRET: 'two' }), null)
    assert.equal(unseal(`${sealed.slice(0, -2)}AA`, env), null)
    assert.equal(unseal('nope', env), null)
    assert.equal(unseal(null, env), null)
  })
})
