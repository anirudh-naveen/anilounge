import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { botName } from './botAgents.js'

const CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'

describe('botName', () => {
  it('treats ordinary browsers as people', () => {
    assert.equal(botName(CHROME), null)
    assert.equal(botName(IPHONE), null)
  })

  it('names known crawlers', () => {
    assert.equal(
      botName(
        'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1; +http://www.google.com/bot.html) Chrome/130.0 Safari/537.36',
      ),
      'Googlebot',
    )
    assert.equal(botName('Mozilla/5.0 (compatible; bingbot/2.0)'), 'Bingbot')
    assert.equal(botName('Mozilla/5.0 (compatible; GPTBot/1.2)'), 'AI crawler')
    assert.equal(botName('Discordbot/2.0; +https://discordapp.com'), 'Link preview')
    assert.equal(botName(`${CHROME.replace('Chrome/', 'HeadlessChrome/')}`), 'Headless browser')
    assert.equal(botName('curl/8.4.0'), 'Script')
    assert.equal(botName('SomethingNewBot/1.0'), 'Other bot')
  })

  it('flags automated browsers and missing user agents', () => {
    assert.equal(botName(CHROME, { automated: true }), 'Automated browser')
    assert.equal(botName(''), 'No user agent')
    assert.equal(botName(undefined), 'No user agent')
  })
})
