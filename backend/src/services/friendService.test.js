import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  cooldownMs,
  describeWait,
  liveLinkSql,
  relationshipFromRows,
  requestExpiresAt,
} from './friendService.js'

describe('requestExpiresAt', () => {
  it('is one week after the request', () => {
    assert.equal(
      requestExpiresAt('2026-09-29T12:00:00Z').toISOString(),
      '2026-10-06T12:00:00.000Z',
    )
  })
})

describe('liveLinkSql', () => {
  it('keeps friendships and only unexpired requests', () => {
    assert.equal(
      liveLinkSql('f'),
      "(f.status = 'accepted' OR (f.status = 'pending' AND f.created_at > now() - interval '7 days'))",
    )
  })
})

describe('cooldownMs', () => {
  it('starts at 5 minutes and doubles with every strike', () => {
    const minutes = [1, 2, 3, 4].map((strikes) => cooldownMs(strikes) / 60_000)
    assert.deepEqual(minutes, [5, 10, 20, 40])
  })

  it('stays finite for huge strike counts', () => {
    assert.equal(cooldownMs(1000), cooldownMs(31))
    assert.ok(Number.isFinite(cooldownMs(1000)))
  })
})

describe('describeWait', () => {
  it('rounds up to a readable unit', () => {
    assert.equal(describeWait(30_000), '1 minute')
    assert.equal(describeWait(9.5 * 60_000), '10 minutes')
    assert.equal(describeWait(80 * 60_000), '2 hours')
    assert.equal(describeWait(3 * 24 * 60 * 60_000), '3 days')
    assert.equal(describeWait(400 * 24 * 60 * 60_000), '2 years')
  })
})

describe('relationshipFromRows', () => {
  it('reads direction from the viewer side', () => {
    assert.equal(relationshipFromRows([{ follower_id: 'a', status: 'pending' }], 'a'), 'outgoing')
    assert.equal(relationshipFromRows([{ follower_id: 'a', status: 'pending' }], 'b'), 'incoming')
    assert.equal(relationshipFromRows([{ follower_id: 'a', status: 'accepted' }], 'b'), 'friends')
    assert.equal(relationshipFromRows([], 'a'), 'none')
  })
})
