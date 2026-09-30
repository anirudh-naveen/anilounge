import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isBanned, isMuted, muteEndsAt, mutedMessage } from './accountStatus.js'

const NOW = Date.UTC(2026, 8, 29, 12, 0)

describe('mutes', () => {
  it('is muted only until the end time', () => {
    assert.equal(isMuted({ mutedUntil: new Date(NOW + 1000) }, NOW), true)
    assert.equal(isMuted({ mutedUntil: new Date(NOW - 1000) }, NOW), false)
    assert.equal(isMuted({ mutedUntil: null }, NOW), false)
    assert.equal(isMuted(undefined, NOW), false)
  })

  it('computes end times and rejects unknown durations', () => {
    assert.equal(muteEndsAt('24h', NOW).getTime(), NOW + 24 * 3600 * 1000)
    assert.equal(muteEndsAt('permanent', NOW).getUTCFullYear(), 9999)
    assert.equal(muteEndsAt('forever', NOW), null)
  })

  it('explains the mute', () => {
    const permanent = mutedMessage({ mutedUntil: muteEndsAt('permanent', NOW), muteReason: 'Spam' })
    assert.match(permanent, /until a moderator lifts it/)
    assert.match(permanent, /Reason: Spam/)
    assert.match(mutedMessage({ mutedUntil: new Date(NOW) }), /until .*2026/)
  })
})

describe('isBanned', () => {
  it('reads bannedAt', () => {
    assert.equal(isBanned({ bannedAt: new Date() }), true)
    assert.equal(isBanned({ bannedAt: null }), false)
  })
})
