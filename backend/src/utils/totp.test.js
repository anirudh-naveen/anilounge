import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  base32Decode,
  base32Encode,
  generateTotpSecret,
  otpauthUrl,
  totpCode,
  verifyTotp,
} from './totp.js'

// RFC 6238 appendix B, SHA-1 seed "12345678901234567890" (last six digits).
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'))

describe('totp', () => {
  it('round-trips base32', () => {
    const bytes = Buffer.from([0, 1, 2, 250, 255, 128, 7])
    assert.deepEqual(base32Decode(base32Encode(bytes)), bytes)
    assert.equal(RFC_SECRET, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ')
  })

  it('matches the RFC 6238 test vectors', () => {
    assert.equal(totpCode(RFC_SECRET, 59 * 1000), '287082')
    assert.equal(totpCode(RFC_SECRET, 1111111109 * 1000), '081804')
    assert.equal(totpCode(RFC_SECRET, 1234567890 * 1000), '005924')
  })

  it('accepts one step of drift and rejects others', () => {
    const now = 1_700_000_000_000
    assert.equal(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, now - 30_000), now), true)
    assert.equal(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, now + 30_000), now), true)
    assert.equal(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, now - 90_000), now), false)
    assert.equal(verifyTotp(RFC_SECRET, 'abcdef', now), false)
    assert.equal(verifyTotp(RFC_SECRET, '', now), false)
  })

  it('builds secrets and otpauth URLs', () => {
    const secret = generateTotpSecret()
    assert.match(secret, /^[A-Z2-7]{32}$/)
    const url = otpauthUrl(secret, 'mika@example.test')
    assert.match(url, /^otpauth:\/\/totp\/AniLounge%3Amika%40example\.test\?secret=/)
    assert.match(url, /issuer=AniLounge/)
  })
})
