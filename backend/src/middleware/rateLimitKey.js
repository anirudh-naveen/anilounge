/**
 * Who a request counts against for the general rate limit.
 *
 * Layer: middleware. Signed-in requests count against the account (a valid Bearer
 * token), so people sharing an IP (campus, office, carrier NAT) do not share a budget;
 * anonymous requests count against the client IP. Only a token this server signed can
 * select a per-account key, so the key cannot be spoofed with a made-up header.
 */

import jwt from 'jsonwebtoken'

const DEFAULT_USER_MAX = 1500
const DEFAULT_IP_MAX = 600

/** Key per request: the general limiter and the slowdown both ask, and each check verifies the JWT. */
const keysByRequest = new WeakMap()

/**
 * @param {import('express').Request} req
 * @returns {string} `u:<userId>` or `ip:<address>`.
 */
export function rateLimitKey(req) {
  let key = keysByRequest.get(req)
  if (!key) {
    key = computeKey(req)
    keysByRequest.set(req, key)
  }
  return key
}

/**
 * @param {import('express').Request} req
 * @returns {string}
 */
function computeKey(req) {
  const header = req.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null
  if (token && process.env.JWT_SECRET) {
    try {
      const { userId } = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] })
      if (userId) return `u:${userId}`
    } catch {
      // Expired or invalid: fall back to the IP.
    }
  }
  return `ip:${req.ip}`
}

/**
 * Requests allowed per 15 minutes for a key: RATE_LIMIT_USER_MAX for accounts (default
 * 1500, ~1.7/s sustained) and RATE_LIMIT_IP_MAX for anonymous IPs (default 600, which
 * leaves room for several people behind one address).
 * @param {import('express').Request} req
 * @returns {number}
 */
export function rateLimitMax(req) {
  const user = Number(process.env.RATE_LIMIT_USER_MAX) || DEFAULT_USER_MAX
  const ip = Number(process.env.RATE_LIMIT_IP_MAX) || DEFAULT_IP_MAX
  return rateLimitKey(req).startsWith('u:') ? user : ip
}

/**
 * `app.set('trust proxy', …)` value from TRUST_PROXY: a hop count ("1", "2"), "true",
 * or a list of trusted proxy addresses/subnets. Defaults to 2: Railway's edge replaces
 * any client X-Forwarded-For with `<connecting ip>, <edge hop>`, so the client is two
 * entries from the right and cannot be spoofed. Through the Vercel `/api` rewrite the
 * connecting IP is Vercel's; middleware/clientIp.js then swaps in the visitor's address
 * from X-Vercel-Forwarded-For (Vercel overwrites any value the visitor sends). Check
 * with `GET /api/status?proxy=1` before changing it.
 * @param {string | undefined} [value]
 * @returns {number | boolean | string}
 */
export function trustProxySetting(value = process.env.TRUST_PROXY) {
  if (value == null || value === '') return 2
  if (/^\d+$/.test(value)) return Number(value)
  if (value === 'true') return true
  if (value === 'false') return false
  return value
}
