import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { sendAnnouncement } from './announcementService.js'
import {
  unsubscribeToken,
  unsubscribeUrl,
  verifyUnsubscribeToken,
} from './emailPreferenceService.js'

const USER_ID = '6f1c2a4e-8b3d-4c5e-9f70-1a2b3c4d5e6f'
const OTHER_ID = '0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d'
const env = { ...process.env }

beforeEach(() => {
  process.env.JWT_SECRET = 'test-secret'
  process.env.PUBLIC_APP_URL = 'https://anilounge.net'
})

afterEach(() => {
  process.env = { ...env }
})

describe('unsubscribe links', () => {
  it('accepts only the token signed for that user', () => {
    const token = unsubscribeToken(USER_ID)
    assert.equal(verifyUnsubscribeToken(USER_ID, token), true)
    assert.equal(verifyUnsubscribeToken(OTHER_ID, token), false)
    assert.equal(verifyUnsubscribeToken(USER_ID, `${token}x`), false)
    assert.equal(verifyUnsubscribeToken(USER_ID, undefined), false)
    assert.equal(verifyUnsubscribeToken('not-a-uuid', token), false)
  })

  it('changes when the signing secret changes', () => {
    const token = unsubscribeToken(USER_ID)
    process.env.JWT_SECRET = 'rotated'
    assert.equal(verifyUnsubscribeToken(USER_ID, token), false)
  })

  it('points at the site domain with the user and token', () => {
    const url = new URL(unsubscribeUrl(USER_ID))
    assert.equal(url.origin + url.pathname, 'https://anilounge.net/api/email/unsubscribe')
    assert.equal(url.searchParams.get('u'), USER_ID)
    assert.equal(verifyUnsubscribeToken(USER_ID, url.searchParams.get('t')), true)
  })
})

describe('sendAnnouncement', () => {
  it('sends to everyone, records failures, and keeps going', async () => {
    const calls = []
    const send = async (user, announcement, link) => {
      calls.push({ email: user.email, subject: announcement.subject, link })
      if (user.email === 'b@x.co') throw new Error('rejected')
    }
    const recipients = [
      { id: USER_ID, email: 'a@x.co', username: 'a' },
      { id: OTHER_ID, email: 'b@x.co', username: 'b' },
    ]
    const result = await sendAnnouncement({ subject: 'News', bodyText: 'Hi' }, recipients, {
      delayMs: 0,
      send,
    })

    assert.deepEqual(result, { sent: 1, failed: [{ email: 'b@x.co', error: 'rejected' }] })
    assert.deepEqual(
      calls.map((call) => call.email),
      ['a@x.co', 'b@x.co'],
    )
    assert.ok(calls[0].link.includes(`u=${USER_ID}`))
    assert.ok(calls[1].link.includes(`u=${OTHER_ID}`))
  })
})
