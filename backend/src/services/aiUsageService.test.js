import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { GLOBAL_SUBJECT, aiQuota, globalAiLimit } from './aiUsageService.js'

describe('aiQuota', () => {
  it('counts signed-in calls per account and signed-out calls per IP', () => {
    const user = aiQuota({ user: { _id: 'abc' }, ip: '198.51.100.2' })
    const anon = aiQuota({ user: null, ip: '198.51.100.2' })
    assert.equal(user.subject, 'u:abc')
    assert.equal(anon.subject, 'ip:198.51.100.2')
    assert.ok(user.limit > anon.limit)
  })
})

describe('globalAiLimit', () => {
  it('defaults above the per-account cap and follows AI_DAILY_LIMIT_GLOBAL', () => {
    const saved = process.env.AI_DAILY_LIMIT_GLOBAL
    delete process.env.AI_DAILY_LIMIT_GLOBAL
    assert.ok(globalAiLimit() > aiQuota({ user: { _id: 'abc' } }).limit)
    process.env.AI_DAILY_LIMIT_GLOBAL = '50'
    assert.equal(globalAiLimit(), 50)
    if (saved === undefined) delete process.env.AI_DAILY_LIMIT_GLOBAL
    else process.env.AI_DAILY_LIMIT_GLOBAL = saved
  })

  it('uses a subject no account or IP can collide with', () => {
    assert.ok(!GLOBAL_SUBJECT.startsWith('u:') && !GLOBAL_SUBJECT.startsWith('ip:'))
  })
})
