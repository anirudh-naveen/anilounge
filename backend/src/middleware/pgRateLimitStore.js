/**
 * express-rate-limit store backed by Postgres, so limits hold across server instances.
 *
 * Layer: middleware. One upsert per counted request on the UNLOGGED `rate_limit_hits`
 * table. Opt in with RATE_LIMIT_STORE=postgres once more than one instance runs; a
 * single instance is better served by the default in-memory store. If the table is
 * missing or the database errors, the request is let through (fail open) rather than
 * taking the site down with the counter.
 */

import { query } from '../../config/postgres.js'

const PURGE_INTERVAL_MS = 5 * 60_000
let purgeTimer = null

/** Delete windows that ended; one timer per process however many stores exist. */
function schedulePurge() {
  if (purgeTimer) return
  purgeTimer = setInterval(() => {
    query('DELETE FROM rate_limit_hits WHERE reset_at < now()').catch(() => {})
  }, PURGE_INTERVAL_MS)
  purgeTimer.unref?.()
}

/**
 * Whether the limiters should use Postgres (RATE_LIMIT_STORE=postgres).
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function useSharedRateLimits(env = process.env) {
  return String(env.RATE_LIMIT_STORE || '').toLowerCase() === 'postgres'
}

export class PgRateLimitStore {
  /** @param {string} prefix - Separates this limiter's keys from the others'. */
  constructor(prefix) {
    this.prefix = `${prefix}:`
    this.localKeys = false
    this.windowMs = 60_000
  }

  /** @param {{ windowMs: number }} options */
  init(options) {
    this.windowMs = options.windowMs
    schedulePurge()
  }

  /**
   * @param {string} key
   * @returns {Promise<{ totalHits: number, resetTime: Date | undefined }>}
   */
  async increment(key) {
    try {
      const { rows } = await query(
        `INSERT INTO rate_limit_hits (key, hits, reset_at)
         VALUES ($1, 1, now() + make_interval(secs => $2))
         ON CONFLICT (key) DO UPDATE SET
           hits = CASE WHEN rate_limit_hits.reset_at <= now() THEN 1 ELSE rate_limit_hits.hits + 1 END,
           reset_at = CASE WHEN rate_limit_hits.reset_at <= now() THEN EXCLUDED.reset_at
                           ELSE rate_limit_hits.reset_at END
         RETURNING hits, reset_at`,
        [this.prefix + key, this.windowMs / 1000],
      )
      return { totalHits: rows[0].hits, resetTime: rows[0].reset_at }
    } catch (error) {
      console.error('Rate limit store error (allowing request):', error.message)
      return { totalHits: 0, resetTime: undefined }
    }
  }

  /** @param {string} key */
  async decrement(key) {
    await query(
      'UPDATE rate_limit_hits SET hits = greatest(hits - 1, 0) WHERE key = $1',
      [this.prefix + key],
    ).catch(() => {})
  }

  /** @param {string} key */
  async resetKey(key) {
    await query('DELETE FROM rate_limit_hits WHERE key = $1', [this.prefix + key]).catch(
      () => {},
    )
  }
}

/**
 * `{ store }` for a limiter's options: shared when enabled, else the library default.
 * @param {string} prefix
 * @returns {{ store?: PgRateLimitStore }}
 */
export function rateLimitStore(prefix) {
  return useSharedRateLimits() ? { store: new PgRateLimitStore(prefix) } : {}
}
