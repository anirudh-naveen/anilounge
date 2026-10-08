import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { aiQuota } from './aiUsageService.js'

describe('aiQuota', () => {
  it('counts signed-in calls per account and signed-out calls per IP', () => {
    const user = aiQuota({ user: { _id: 'abc' }, ip: '198.51.100.2' })
    const anon = aiQuota({ user: null, ip: '198.51.100.2' })
    assert.equal(user.subject, 'u:abc')
    assert.equal(anon.subject, 'ip:198.51.100.2')
    assert.ok(user.limit > anon.limit)
  })
})
