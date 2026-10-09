/**
 * The visitor's real address for requests that arrive through the site's Vercel `/api`
 * rewrite.
 *
 * Layer: middleware. Through the rewrite, Railway sees a Vercel server (a shared AWS
 * address) as the client, so one bot's ban or rate limit hit everyone routed through
 * that server. Vercel puts the visitor's address in `X-Vercel-Forwarded-For` and
 * overwrites any value the visitor sent, so for those requests `req.ip` becomes that
 * header and `req.proxyHopIp` keeps the address Railway saw.
 *
 * A caller hitting the Railway domain directly can send the header itself and pick the
 * address its bans and rate limits count against. The hop isn't checked for bans as
 * well: Vercel's servers are shared AWS addresses, and a ban on one (from any other
 * AWS caller) would lock out every visitor routed through it again. Closing that gap
 * needs proof a request came through Vercel (e.g. a shared secret added by Vercel
 * Routing Middleware). Mounted right after `trust proxy` is set, before the rate
 * limiters and the ban check.
 */

import net from 'node:net'

/**
 * The visitor address Vercel forwarded, when it is one well-formed IP.
 * @param {import('express').Request} req
 * @returns {string | null}
 */
export function vercelForwardedIp(req) {
  const value = String(req.get?.('x-vercel-forwarded-for') || '')
    .split(',')[0]
    .trim()
  return net.isIP(value) ? value : null
}

/**
 * Use the Vercel-forwarded address as `req.ip`; keep the connecting one as `req.proxyHopIp`.
 * @type {import('express').RequestHandler}
 */
export function useForwardedClientIp(req, res, next) {
  const forwarded = vercelForwardedIp(req)
  if (forwarded && forwarded !== req.ip) {
    req.proxyHopIp = req.ip
    // `req.ip` is a getter on Express's request prototype; an own property shadows it.
    Object.defineProperty(req, 'ip', { value: forwarded, configurable: true, enumerable: true })
  }
  next()
}

export default useForwardedClientIp
