/**
 * Encrypt short secrets (linked-account OAuth tokens) for storage.
 *
 * AES-256-GCM with a key derived from CONNECTIONS_SECRET, falling back to JWT_SECRET.
 * Set CONNECTIONS_SECRET in production so rotating JWT_SECRET doesn't disconnect
 * every linked account. Sealed values look like `v1.<iv>.<tag>.<data>` (base64url).
 */
import crypto from 'node:crypto'

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {Buffer}
 */
function key(env = process.env) {
  const secret = env.CONNECTIONS_SECRET || env.JWT_SECRET
  if (!secret) throw new Error('CONNECTIONS_SECRET (or JWT_SECRET) must be set to store tokens')
  return crypto.createHash('sha256').update(`anilounge-connections:${secret}`).digest()
}

/**
 * @param {string} text
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function seal(text, env = process.env) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key(env), iv)
  const data = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()])
  return ['v1', iv, cipher.getAuthTag(), data].map((part) => part.toString('base64url')).join('.')
}

/**
 * @param {string | null | undefined} sealed
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string | null} null when empty, tampered with, or sealed under another key.
 */
export function unseal(sealed, env = process.env) {
  const parts = String(sealed || '').split('.')
  if (parts.length !== 4 || parts[0] !== 'v1') return null
  try {
    const [iv, tag, data] = parts.slice(1).map((part) => Buffer.from(part, 'base64url'))
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(env), iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}
