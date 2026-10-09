import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { useForwardedClientIp, vercelForwardedIp } from './clientIp.js'

/** A request whose prototype `ip` getter mimics Express. */
const request = (ip, headers = {}) => {
  const proto = {
    get ip() {
      return ip
    },
  }
  const req = Object.create(proto)
  req.get = (name) => headers[name.toLowerCase()]
  return req
}

describe('vercelForwardedIp', () => {
  it('reads one well-formed address', () => {
    assert.equal(
      vercelForwardedIp(request('3.15.34.123', { 'x-vercel-forwarded-for': '76.240.123.232' })),
      '76.240.123.232',
    )
    assert.equal(
      vercelForwardedIp(request('1.1.1.1', { 'x-vercel-forwarded-for': '2001:db8::1, 9.9.9.9' })),
      '2001:db8::1',
    )
    assert.equal(
      vercelForwardedIp(request('1.1.1.1', { 'x-vercel-forwarded-for': 'not-an-ip' })),
      null,
    )
    assert.equal(vercelForwardedIp(request('1.1.1.1')), null)
  })
})

describe('useForwardedClientIp', () => {
  it('swaps in the forwarded address and keeps the hop', () => {
    const req = request('3.15.34.123', { 'x-vercel-forwarded-for': '76.240.123.232' })
    let called = false
    useForwardedClientIp(req, {}, () => (called = true))
    assert.equal(called, true)
    assert.equal(req.ip, '76.240.123.232')
    assert.equal(req.proxyHopIp, '3.15.34.123')
  })

  it('leaves requests without the header alone', () => {
    const req = request('203.0.113.7')
    useForwardedClientIp(req, {}, () => {})
    assert.equal(req.ip, '203.0.113.7')
    assert.equal(req.proxyHopIp, undefined)
  })
})
