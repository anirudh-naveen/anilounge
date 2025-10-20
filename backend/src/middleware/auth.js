import jwt from 'jsonwebtoken'
import User from '../models/User.js'
import RefreshToken from '../models/RefreshToken.js'

export const authenticateToken = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.split(' ')[1] // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token required',
      })
    }

    // Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    // Find user by ID from token
    const user = await User.findById(decoded.userId).select('-password')

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token - user not found',
      })
    }

    // Add user to request object
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

// Generate access token (15 minutes)
export const generateAccessToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '15m' })
}

// Generate refresh token (7 days)
export const generateRefreshToken = async (userId) => {
  const refreshToken = await RefreshToken.createToken(userId)
  return refreshToken.token
}

// Legacy function for backward compatibility
export const generateToken = generateAccessToken

// Refresh token endpoint handler
export const refreshAccessToken = async (req, res) => {
  try {
    const { refreshToken } = req.body

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token required',
      })
    }

    // Find the refresh token
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

    // Generate new access token
    const newAccessToken = generateAccessToken(tokenDoc.userId._id)

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      data: {
        accessToken: newAccessToken,
        refreshToken: refreshToken, // Keep the same refresh token
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

// Revoke refresh token (logout)
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

// Default export for backward compatibility
export default authenticateToken
