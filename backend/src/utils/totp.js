/**
 * Time-based one-time passwords (RFC 6238, SHA-1, 6 digits, 30 s) for authenticator apps.
 *
 * Layer: utils. Pure functions over Node's crypto: secret generation, base32
 * encoding, code generation/verification, and `otpauth://` provisioning URLs.
 */

import crypto from 'crypto'

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const STEP_SECONDS = 30
const DIGITS = 6

/**
 * RFC 4648 base32 without padding.
 * @param {Buffer} buffer
 * @returns {string}
 */
export function base32Encode(buffer) {
  let bits = 0
  let value = 0
  let output = ''
  for (const byte of buffer) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  return output
}

/**
 * Decode base32 (case-insensitive; spaces and padding ignored).
 * @param {string} input
 * @returns {Buffer}
 * @throws {Error} On characters outside the base32 alphabet.
 */
export function base32Decode(input) {
  const clean = String(input).toUpperCase().replace(/[\s=]/g, '')
  let bits = 0
  let value = 0
  const bytes = []
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char)
    if (index === -1) throw new Error('Invalid base32 character')
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

/**
 * New random 160-bit secret, base32-encoded.
 * @returns {string}
 */
export function generateTotpSecret() {
  return base32Encode(crypto.randomBytes(20))
}

/**
 * Code for a given counter step.
 * @param {string} secret - Base32 secret.
 * @param {number} counter - Time step index.
 * @returns {string} Zero-padded 6-digit code.
 */
function hotp(secret, counter) {
  const buffer = Buffer.alloc(8)
  buffer.writeBigUInt64BE(BigInt(counter))
  const digest = crypto.createHmac('sha1', base32Decode(secret)).update(buffer).digest()
  const offset = digest[digest.length - 1] & 0x0f
  const binary = digest.readUInt32BE(offset) & 0x7fffffff
  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0')
}

/**
 * Current TOTP code.
 * @param {string} secret - Base32 secret.
 * @param {number} [now=Date.now()] - Milliseconds since epoch.
 * @returns {string}
 */
export function totpCode(secret, now = Date.now()) {
  return hotp(secret, Math.floor(now / 1000 / STEP_SECONDS))
}

/**
 * Check a code, accepting one step of clock drift either way.
 * @param {string} secret - Base32 secret.
 * @param {unknown} code - User input; spaces are ignored.
 * @param {number} [now=Date.now()]
 * @returns {boolean}
 */
export function verifyTotp(secret, code, now = Date.now()) {
  const input = String(code ?? '').replace(/\s/g, '')
  if (!secret || !/^\d{6}$/.test(input)) return false
  const step = Math.floor(now / 1000 / STEP_SECONDS)
  for (const drift of [-1, 0, 1]) {
    const expected = hotp(secret, step + drift)
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(input))) return true
  }
  return false
}

/**
 * `otpauth://` URL for authenticator apps (rendered as a QR code).
 * @param {string} secret - Base32 secret.
 * @param {string} accountName - Shown in the app (the user's email).
 * @param {string} [issuer='AniLounge']
 * @returns {string}
 */
export function otpauthUrl(secret, accountName, issuer = 'AniLounge') {
  const label = encodeURIComponent(`${issuer}:${accountName}`)
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  })
  return `otpauth://totp/${label}?${params}`
}
