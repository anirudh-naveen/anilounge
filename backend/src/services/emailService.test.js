import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  hasPublicAppUrl,
  sendAnnouncementEmail,
  sendEmailChangedNotice,
  sendFeedbackEmail,
  sendFriendRequestEmail,
} from './emailService.js'

const env = { ...process.env }
const realFetch = globalThis.fetch
let sent

beforeEach(() => {
  process.env.RESEND_API_KEY = 're_test'
  delete process.env.SMTP_HOST
  delete process.env.SUPPORT_EMAIL
  delete process.env.EMAIL_REPLY_TO
  sent = []
  globalThis.fetch = async (url, init) => {
    sent.push(JSON.parse(init.body))
    return { ok: true, json: async () => ({}) }
  }
})

afterEach(() => {
  process.env = { ...env }
  globalThis.fetch = realFetch
})

const feedback = (overrides = {}) => ({
  id: '1',
  type: 'bug',
  message: 'Search <b>breaks</b>',
  email: 'fan@example.com',
  timestamp: '2026-09-28T00:00:00Z',
  userAgent: 'Firefox',
  url: 'https://anilounge.net/search',
  ...overrides,
})

describe('sendFeedbackEmail', () => {
  it('goes to support@anilounge.net with replies to the submitter', async () => {
    await sendFeedbackEmail(feedback())
    assert.equal(sent.length, 1)
    assert.equal(sent[0].to, 'support@anilounge.net')
    assert.equal(sent[0].reply_to, 'fan@example.com')
    assert.equal(sent[0].subject, '[AniLounge feedback] bug')
    assert.ok(sent[0].text.includes('Search <b>breaks</b>'))
    assert.ok(sent[0].html.includes('Search &#60;b&#62;breaks&#60;/b&#62;'))
  })

  it('honors SUPPORT_EMAIL and skips reply-to for anonymous feedback', async () => {
    process.env.SUPPORT_EMAIL = 'triage@anilounge.net'
    process.env.EMAIL_REPLY_TO = 'support@anilounge.net'
    await sendFeedbackEmail(feedback({ email: 'anonymous', type: 'bug\r\nBcc: x@evil.test' }))
    assert.equal(sent[0].to, 'triage@anilounge.net')
    assert.equal(sent[0].reply_to, 'support@anilounge.net')
    assert.equal(sent[0].subject, '[AniLounge feedback] bug Bcc: x@evil.test')
  })
})

describe('sendAnnouncementEmail', () => {
  it('adds one-click unsubscribe headers and link', async () => {
    const link = 'https://anilounge.net/api/email/unsubscribe?u=1&t=abc'
    await sendAnnouncementEmail(
      { email: 'fan@example.com', username: 'fan' },
      { subject: 'Forums are live', bodyText: 'First line\nsecond\n\nNew paragraph' },
      link,
    )
    assert.equal(sent[0].to, 'fan@example.com')
    assert.equal(sent[0].headers['List-Unsubscribe'], `<${link}>`)
    assert.equal(sent[0].headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click')
    assert.ok(sent[0].text.startsWith('Hi fan,'))
    assert.ok(sent[0].text.includes(link))
    assert.ok(sent[0].html.includes('<p>First line<br>second</p>'))
    assert.ok(sent[0].html.includes('<p>New paragraph</p>'))
    assert.ok(
      sent[0].html.includes('href="https://anilounge.net/api/email/unsubscribe?u=1&#38;t=abc"'),
    )
  })

  it('uses the live logo even when the app URL is localhost', async () => {
    process.env.PUBLIC_APP_URL = 'http://localhost:5174'
    delete process.env.EMAIL_LOGO_URL
    await sendAnnouncementEmail(
      { email: 'fan@example.com', username: 'fan' },
      { subject: 'Hi', bodyText: 'Body' },
      'https://www.anilounge.net/api/email/unsubscribe',
    )
    assert.ok(sent[0].html.includes('src="https://www.anilounge.net/anilounge-logo.png"'))
  })
})

describe('hasPublicAppUrl', () => {
  it('rejects localhost and plain http', () => {
    process.env.PUBLIC_APP_URL = 'http://localhost:5174'
    assert.equal(hasPublicAppUrl(), false)
    process.env.PUBLIC_APP_URL = 'http://anilounge.net'
    assert.equal(hasPublicAppUrl(), false)
    process.env.PUBLIC_APP_URL = 'https://www.anilounge.net'
    assert.equal(hasPublicAppUrl(), true)
  })
})

describe('sendFriendRequestEmail', () => {
  it('escapes the note and names the requester and expiry', async () => {
    await sendFriendRequestEmail(
      { email: 'bob@example.com', username: 'bob' },
      { username: 'alice' },
      'Loved your <b>list</b>',
      new Date('2026-10-06T12:00:00Z'),
      'https://anilounge.net/api/email/unsubscribe?u=1&t=abc&c=friend_requests',
    )
    assert.equal(sent[0].to, 'bob@example.com')
    assert.equal(sent[0].subject, 'alice sent you a friend request on AniLounge')
    assert.ok(sent[0].text.includes('Their note: "Loved your <b>list</b>"'))
    assert.ok(sent[0].html.includes('Loved your &#60;b&#62;list&#60;/b&#62;'))
    assert.ok(sent[0].text.includes('October 6, 2026'))
    assert.equal(
      sent[0].headers['List-Unsubscribe'],
      '<https://anilounge.net/api/email/unsubscribe?u=1&t=abc&c=friend_requests>',
    )
    assert.ok(sent[0].html.includes('Stop friend request emails'))
  })

  it('gives account emails a settings link instead of an unsubscribe', async () => {
    process.env.PUBLIC_APP_URL = 'https://anilounge.net'
    await sendEmailChangedNotice({ email: 'old@example.com', username: 'fan' }, 'new@example.com')
    assert.ok(sent[0].text.includes("can't be turned off"))
    assert.ok(sent[0].html.includes('href="https://anilounge.net/settings#email"'))
  })
})
