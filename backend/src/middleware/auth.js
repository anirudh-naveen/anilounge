/**
 * JWT authentication middleware and token helpers.
 *
 * Layer: middleware. Verifies Bearer access tokens (HS256 only) and exposes the
 * cookie-based refresh/logout handlers backed by `services/sessionService.js`.
 */

import jwt from 'jsonwebtoken'
import User from '../models/User.js'
import { endSession, rotateSession } from '../services/sessionService.js'
import { touchUserActivity } from '../services/inactiveAccountService.js'
import { isAdminUser } from './adminOnly.js'

/**
 * Verify the Bearer JWT and attach the matching user to the request.
 *
 * @param {import('express').Request} req - Reads `headers.authorization`.
 * @param {import('express').Response} res - Sends 401/500 JSON on failure.
 * @param {import('express').NextFunction} next - Continues the chain on success.
 * @returns {Promise<void>}
 */
export const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.split(' ')[1] // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token required',
      })
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        success: false,
        message: 'Server configuration error',
      })
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] })

    const user = await User.findById(decoded.userId).select('-password')

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token - user not found',
      })
    }

    req.user = user
    touchUserActivity(user._id).catch((error) => console.error('Activity update failed:', error))
    next()
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token',
      })
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired',
      })
    }

    console.error('Auth middleware error:', error)
    res.status(500).json({
      success: false,
      message: 'Server error during authentication',
    })
  }
}

/**
 * Attach `req.user` when a valid Bearer token is present; otherwise continue.
 * Invalid or expired tokens do not fail the request (chat stays public).
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @returns {Promise<void>}
 */
export const optionalAuthenticate = async (req, res, next) => {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]
  if (!token || !process.env.JWT_SECRET) {
    return next()
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] })
    const user = await User.findById(decoded.userId)
      .select('-password')
      .populate({ path: 'watchlist.content', select: 'title englishTitle contentType' })
    if (user) req.user = user
  } catch {
    // Public chat: ignore bad tokens instead of 401.
  }
  next()
}

/**
 * Reject cookie-authenticated calls that do not carry the header only our app's
 * XHR client sends (a cross-site form cannot set it). Complements SameSite=Lax.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {boolean} True when a 403 was sent.
 */
function rejectMissingCsrfHeader(req, res) {
  if (req.get('X-Requested-With') === 'XMLHttpRequest') return false
  res.status(403).json({ success: false, message: 'Missing request header.' })
  return true
}

/**
 * Restore or extend a browser session from the refresh cookie: rotates the cookie and
 * returns a new access token plus the user (this is what keeps people signed in).
 *
 * @param {import('express').Request} req - Reads the `al_refresh` cookie.
 * @param {import('express').Response} res - 200 `{ accessToken, user }`, 401 `NO_SESSION` or `REFRESH_RACE`, 403, or 500.
 * @returns {Promise<void>}
 */
export const refreshAccessToken = async (req, res) => {
  try {
    if (rejectMissingCsrfHeader(req, res)) return

    const session = await rotateSession(req, res)
    if (session?.retry) {
      return res.status(401).json({
        success: false,
        code: 'REFRESH_RACE',
        message: 'Session was refreshed in another tab; retry.',
      })
    }
    const user = session ? await User.findById(session.userId) : null
    if (user) {
      touchUserActivity(user._id).catch((error) => console.error('Activity update failed:', error))
    }
    if (!session || !user) {
      return res.status(401).json({ success: false, code: 'NO_SESSION', message: 'Not signed in.' })
    }

    res.json({
      success: true,
      data: {
        accessToken: session.accessToken,
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          isDemoAccount: user.isDemo(),
          isAdmin: isAdminUser(user),
          profilePicture: user.profilePicture,
          createdAt: user.createdAt,
          preferences: user.preferences,
        },
      },
    })
  } catch (error) {
    console.error('Refresh token error:', error)
    res.status(500).json({
      success: false,
      message: 'Server error refreshing session',
    })
  }
}

/**
 * Log out this browser: revoke its refresh token and clear the cookie.
 *
 * @param {import('express').Request} req - Reads the `al_refresh` cookie.
 * @param {import('express').Response} res - 200 on success, 403, or 500.
 * @returns {Promise<void>}
 */
export const revokeRefreshToken = async (req, res) => {
  try {
    if (rejectMissingCsrfHeader(req, res)) return
    await endSession(req, res)
    res.json({ success: true, message: 'Signed out.' })
  } catch (error) {
    console.error('Revoke token error:', error)
    res.status(500).json({
      success: false,
      message: 'Server error signing out',
    })
  }
}

export default authenticateToken
