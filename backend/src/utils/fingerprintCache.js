/**
 * fingerprintCache.js — Small in-memory cache whose entries hold only while the data
 * they came from is unchanged.
 *
 * Utils layer: each entry stores a fingerprint of its inputs (for example a user's
 * rating count and sum); a read with a different fingerprint is a miss, so callers
 * don't have to clear entries from every write path. Entries also expire after
 * `ttlMs`, and the oldest go first past `maxEntries`.
 */

export class FingerprintCache {
  /**
   * @param {{ ttlMs: number, maxEntries: number, now?: () => number }} options
   */
  constructor({ ttlMs, maxEntries, now = Date.now }) {
    this.ttlMs = ttlMs
    this.maxEntries = maxEntries
    this.now = now
    this.entries = new Map()
  }

  /**
   * Cached value for `key` if it was stored under `fingerprint` and hasn't expired.
   * @param {string} key
   * @param {string} fingerprint
   * @returns {unknown | undefined}
   */
  get(key, fingerprint) {
    const entry = this.entries.get(key)
    if (!entry) return undefined
    if (entry.fingerprint !== fingerprint || this.now() - entry.at > this.ttlMs) {
      this.entries.delete(key)
      return undefined
    }
    return entry.value
  }

  /**
   * @param {string} key
   * @param {string} fingerprint
   * @param {unknown} value
   */
  set(key, fingerprint, value) {
    this.entries.delete(key)
    this.entries.set(key, { fingerprint, value, at: this.now() })
    while (this.entries.size > this.maxEntries) {
      this.entries.delete(this.entries.keys().next().value)
    }
  }

  clear() {
    this.entries.clear()
  }
}
