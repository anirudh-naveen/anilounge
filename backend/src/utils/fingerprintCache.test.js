import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { FingerprintCache } from './fingerprintCache.js'

function clock() {
  let time = 0
  return { now: () => time, advance: (ms) => (time += ms) }
}

describe('FingerprintCache', () => {
  it('hits only under the same fingerprint', () => {
    const cache = new FingerprintCache({ ttlMs: 1000, maxEntries: 10 })
    cache.set('user:tv', 'v1', ['a'])
    assert.deepEqual(cache.get('user:tv', 'v1'), ['a'])
    assert.equal(cache.get('user:tv', 'v2'), undefined)
    assert.equal(cache.get('user:tv', 'v1'), undefined, 'a stale entry is dropped')
  })

  it('expires entries after the TTL', () => {
    const time = clock()
    const cache = new FingerprintCache({ ttlMs: 1000, maxEntries: 10, now: time.now })
    cache.set('k', 'v', 1)
    time.advance(1000)
    assert.equal(cache.get('k', 'v'), 1)
    time.advance(1)
    assert.equal(cache.get('k', 'v'), undefined)
  })

  it('drops the oldest entries past the limit', () => {
    const cache = new FingerprintCache({ ttlMs: 1000, maxEntries: 2 })
    cache.set('a', 'v', 1)
    cache.set('b', 'v', 2)
    cache.set('a', 'v', 3)
    cache.set('c', 'v', 4)
    assert.equal(cache.get('b', 'v'), undefined)
    assert.equal(cache.get('a', 'v'), 3)
    assert.equal(cache.get('c', 'v'), 4)
  })
})
