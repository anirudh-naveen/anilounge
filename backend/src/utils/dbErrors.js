/**
 * Whether an error means the database connection itself failed (dropped, refused,
 * host unreachable), as opposed to a problem with one statement.
 *
 * Layer: utils. Code that logs and skips per-row failures (character and voice saves)
 * rethrows these, so a batch job retries the whole title instead of marking it done
 * with only part of it saved.
 */

const NETWORK_CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'EPIPE'])

/**
 * @param {unknown} error
 * @returns {boolean}
 */
export function isConnectionError(error) {
  const code = String(error?.code || '')
  // SQLSTATE class 08 (connection exception), 57P01-03 (server shutting down / unavailable).
  if (NETWORK_CODES.has(code) || code.startsWith('08') || /^57P0[123]$/.test(code)) return true
  return /connection terminated|connection timeout|connection error|server closed the connection/i.test(
    String(error?.message || ''),
  )
}
