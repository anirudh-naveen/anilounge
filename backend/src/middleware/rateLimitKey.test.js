import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import jwt from 'jsonwebtoken'
import { rateLimitKey, rateLimitMax, trustProxySetting } from './rateLimitKey.js'

const SECRET = 'test-secret-that-is-long-enough-for-hs256-use'
const request = (authorization) => ({ ip: '203.0.113.7', headers: { authorization } })

describe('rateLimitKey', () => {
  let saved
  before(() => {
    saved = process.env.JWT_SECRET
    process.env.JWT_SECRET = SECRET
  })
  after(() => {
    process.env.JWT_SECRET = saved
  })

  it('counts a valid token against the account', () => {
    const token = jwt.sign({ userId: 'user-1' }, SECRET, { algorithm: 'HS256' })
    assert.equal(rateLimitKey(request(`Bearer ${token}`)), 'u:user-1')
  })

  it('falls back to the IP for missing, forged, or expired tokens', () => {
    const forged = jwt.sign({ userId: 'user-1' }, 'some-other-secret', { algorithm: 'HS256' })
    const expired = jwt.sign({ userId: 'user-1', exp: 1 }, SECRET, { algorithm: 'HS256' })
    assert.equal(rateLimitKey(request()), 'ip:203.0.113.7')
    assert.equal(rateLimitKey(request(`Bearer ${forged}`)), 'ip:203.0.113.7')
    assert.equal(rateLimitKey(request(`Bearer ${expired}`)), 'ip:203.0.113.7')
  })

  it('gives accounts a larger budget than anonymous IPs', () => {
    const token = jwt.sign({ userId: 'user-1' }, SECRET, { algorithm: 'HS256' })
    assert.ok(rateLimitMax(request(`Bearer ${token}`)) > rateLimitMax(request()))
  })
})

describe('trustProxySetting', () => {
  it('defaults to two hops and parses counts, booleans, and lists', () => {
    assert.equal(trustProxySetting(undefined), 2)
    assert.equal(trustProxySetting(''), 2)
    assert.equal(trustProxySetting('2'), 2)
    assert.equal(trustProxySetting('true'), true)
    assert.equal(trustProxySetting('false'), false)
    assert.equal(trustProxySetting('loopback, 10.0.0.0/8'), 'loopback, 10.0.0.0/8')
  })
})
