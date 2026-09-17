/**
 * JWT authentication middleware and token helpers.
 *
 * Layer: middleware. Verifies Bearer access tokens, mints 15-minute access and
 * 7-day refresh tokens, and exposes refresh/revoke route handlers.
 */

import jwt from 'jsonwebtoken'
import User from '../models/User.js'
import RefreshToken from '../models/RefreshToken.js'

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
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    const user = await User.findById(decoded.userId).select('-password')

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token - user not found',
      })
    }

    req.user = user
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
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
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
 * Sign a short-lived access JWT for `userId`.
 *
 * @param {import('mongoose').Types.ObjectId|string} userId - Subject stored as `userId` in the payload.
 * @returns {string} Signed token that expires in 15 minutes.
 */
export const generateAccessToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '15m' })
}

/**
 * Persist and return a refresh token document's token string (7-day lifetime in the model).
 *
 * @param {import('mongoose').Types.ObjectId|string} userId - Owner of the refresh token row.
 * @returns {Promise<string>} Opaque refresh token string.
 */
export const generateRefreshToken = async (userId) => {
  const refreshToken = await RefreshToken.createToken(userId)
  return refreshToken.token
}

/**
 * Alias of `generateAccessToken` for callers that still use the legacy name.
 *
 * @param {import('mongoose').Types.ObjectId|string} userId - Subject of the JWT.
 * @returns {string} Signed access token (15m).
 */
export const generateToken = generateAccessToken

/**
 * Rotate a valid refresh token: revoke the old row and issue a new access+refresh pair.
 *
 * @param {import('express').Request} req - Reads `body.refreshToken`.
 * @param {import('express').Response} res - 200 `{ accessToken, refreshToken }`, 401 if missing/expired, or 500.
 * @returns {Promise<void>}
 */
export const refreshAccessToken = async (req, res) => {
  try {
    const { refreshToken } = req.body

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token required',
      })
    }

    const tokenDoc = await RefreshToken.findOne({
      token: refreshToken,
      isRevoked: false,
    }).populate('userId')

    if (!tokenDoc || tokenDoc.expiresAt < new Date()) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired refresh token',
      })
    }

    tokenDoc.isRevoked = true
    await tokenDoc.save()

    const newAccessToken = generateAccessToken(tokenDoc.userId._id)
    const newRefreshToken = await generateRefreshToken(tokenDoc.userId._id)

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      data: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken.token,
      },
    })
  } catch (error) {
    console.error('Refresh token error:', error)
    res.status(500).json({
      success: false,
      message: 'Server error refreshing token',
    })
  }
}

/**
 * Mark a refresh token revoked (logout). Succeeds even if the body omits the token.
 *
 * @param {import('express').Request} req - Optional `body.refreshToken`.
 * @param {import('express').Response} res - 200 on success or 500.
 * @returns {Promise<void>}
 */
export const revokeRefreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body

    if (refreshToken) {
      await RefreshToken.updateOne({ token: refreshToken }, { isRevoked: true })
    }

    res.json({
      success: true,
      message: 'Token revoked successfully',
    })
  } catch (error) {
    console.error('Revoke token error:', error)
    res.status(500).json({
      success: false,
      message: 'Server error revoking token',
    })
  }
}

export default authenticateToken
