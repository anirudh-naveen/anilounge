/**
 * Expected request failures thrown by services and mapped to JSON by controllers.
 *
 * Layer: utils. Social services (friends, messages, forum, inbox) throw `HttpError`
 * for user-facing failures; `sendError` turns it into a response and logs anything else.
 */

export class HttpError extends Error {
  /**
   * @param {number} status - HTTP status to respond with.
   * @param {string} message - User-facing message.
   * @param {string} [code] - Optional machine-readable code.
   */
  constructor(status, message, code) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.code = code
  }
}

/**
 * Respond for a caught error: `HttpError` keeps its status and message; anything
 * else is logged and becomes a 500 with `fallback`.
 *
 * @param {import('express').Response} res
 * @param {unknown} error
 * @param {string} fallback - 500 message.
 * @returns {import('express').Response}
 */
export function sendError(res, error, fallback) {
  if (error instanceof HttpError) {
    return res.status(error.status).json({
      success: false,
      message: error.message,
      ...(error.code ? { code: error.code } : {}),
    })
  }
  console.error(`${fallback}:`, error)
  return res.status(500).json({ success: false, message: fallback })
}

/**
 * Throw 403 for the shared demo account, which can read social features but not
 * write to them (it is a public login, so its posts and messages would be anyone's).
 *
 * @param {{ isDemo?: () => boolean }} user - `req.user`.
 * @returns {void}
 * @throws {HttpError}
 */
export function assertNotDemo(user) {
  if (typeof user?.isDemo === 'function' && user.isDemo()) {
    throw new HttpError(
      403,
      'The demo account is read-only here. Create a free account to join in.',
      'DEMO_READ_ONLY',
    )
  }
}
