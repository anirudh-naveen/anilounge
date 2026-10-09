import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  BATCH_MAX,
  INDEXNOW_ENDPOINT,
  indexNowEnabled,
  indexNowKey,
  submitUrls,
} from './indexNowService.js'

// Placeholder keys: repeated characters, so secret scanners (gitleaks) don't read them
// as real credentials.
const TEST_KEY = 'testkey-'.padEnd(16, '0')

describe('indexNowKey', () => {
  it('uses INDEXNOW_KEY when valid, else a stable key derived from JWT_SECRET', () => {
    assert.equal(indexNowKey({ INDEXNOW_KEY: TEST_KEY }), TEST_KEY)
    const derived = indexNowKey({ INDEXNOW_KEY: 'bad key!', JWT_SECRET: 'secret-a' })
    assert.match(derived, /^[0-9a-f]{32}$/)
    assert.equal(indexNowKey({ JWT_SECRET: 'secret-a' }), derived)
    assert.notEqual(indexNowKey({ JWT_SECRET: 'secret-b' }), derived)
    assert.ok(!derived.includes('secret'))
    assert.equal(indexNowKey({}), null)
  })
})

describe('indexNowEnabled', () => {
  it('is on in production unless turned off, and can be forced on', () => {
    assert.equal(indexNowEnabled({ NODE_ENV: 'production' }), true)
    assert.equal(indexNowEnabled({ NODE_ENV: 'development' }), false)
    assert.equal(indexNowEnabled({ NODE_ENV: 'production', INDEXNOW_ENABLED: 'false' }), false)
    assert.equal(indexNowEnabled({ NODE_ENV: 'development', INDEXNOW_ENABLED: 'true' }), true)
  })
})

describe('submitUrls', () => {
  it('posts the IndexNow payload in batches', async () => {
    const calls = []
    const fetchImpl = async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body) })
      return { status: 202 }
    }
    const urls = Array.from({ length: BATCH_MAX + 2 }, (_, i) => `https://www.site.test/p/${i}`)
    const statuses = await submitUrls(urls, {
      base: 'https://www.site.test',
      key: TEST_KEY,
      fetchImpl,
    })
    assert.deepEqual(statuses, [202, 202])
    assert.equal(calls[0].url, INDEXNOW_ENDPOINT)
    assert.deepEqual(
      { ...calls[0].body, urlList: calls[0].body.urlList.length },
      {
        host: 'www.site.test',
        key: TEST_KEY,
        keyLocation: 'https://www.site.test/indexnow-key.txt',
        urlList: BATCH_MAX,
      },
    )
    assert.equal(calls[1].body.urlList.length, 2)
  })

  it('sends nothing without a key or URLs', async () => {
    const fetchImpl = async () => assert.fail('should not send')
    assert.deepEqual(
      await submitUrls(['https://x.test/a'], { base: 'https://x.test', key: null, fetchImpl }),
      [],
    )
    assert.deepEqual(await submitUrls([], { base: 'https://x.test', key: TEST_KEY, fetchImpl }), [])
  })
})
