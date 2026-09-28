import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { sendAnnouncementEmail, sendFeedbackEmail } from './emailService.js'

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
})
