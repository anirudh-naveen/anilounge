/**
 * User registration, login, profile, password, and avatar HTTP handlers.
 *
 * Layer: controller. Issues JWTs via auth middleware helpers, enforces lockout
 * after failed logins, and writes profile pictures under `uploads/profiles`.
 */

import User, { DEMO_USER_EMAIL } from '../models/User.js'
import { generateAccessToken, generateRefreshToken, generateToken } from '../middleware/auth.js'
import { validationResult } from 'express-validator'
import bcrypt from 'bcryptjs'
import path from 'path'
import fs from 'fs'
import { logLoginAttempt, logAccountLockout, logFileUpload } from '../middleware/securityLogger.js'
import { banIPForBruteForce } from '../middleware/ipBan.js'

/**
 * Create a user from validated username/email/password and return a 15-minute access token.
 *
 * @param {import('express').Request} req - `body.username`, `body.email`, `body.password` (email is lowercased).
 * @param {import('express').Response} res - 201 `{ user, token }`, 400 validation/duplicate, or 500.
 * @returns {Promise<void>}
 */
export const register = async (req, res) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed.',
        errors: errors.array(),
      })
    }

    const { username, email, password } = req.body

    const normalizedEmail = email.toLowerCase().trim()

    const existingUser = await User.findOne({
      $or: [{ email: normalizedEmail }, { username }],
    })

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email or username already exists.',
      })
    }

    const user = new User({
      username,
      email: normalizedEmail,
      password,
    })

    await user.save()

    const token = generateToken(user._id)

    res.status(201).json({
      success: true,
      message: 'User registered successfully.',
      data: {
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
        },
        token,
      },
    })
  } catch (error) {
    console.error('Registration error:', error)
    res.status(500).json({
      success: false,
      message: 'Server error during registration.',
    })
  }
}

/**
 * Authenticate with email/password and issue access plus refresh tokens.
 * Five failed logins lock the account for 30 minutes and ban the IP for brute force.
 *
 * @param {import('express').Request} req - `body.email`, `body.password`; uses `req.ip` and User-Agent for logs/bans.
 * @param {import('express').Response} res - 200 `{ user, accessToken, refreshToken }`, 401/423, 400, or 500.
 * @returns {Promise<void>}
 */
export const login = async (req, res) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed.',
        errors: errors.array(),
      })
    }

    const { email, password } = req.body

    const normalizedEmail = email.toLowerCase().trim()

    const user = await User.findOne({ email: normalizedEmail })
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials.',
      })
    }

    const isLocked = user.lockUntil && user.lockUntil > Date.now()
    if (isLocked) {
      const lockTimeRemaining = Math.ceil((user.lockUntil - Date.now()) / (1000 * 60))
      return res.status(423).json({
        success: false,
        message: `Account is temporarily locked due to too many failed login attempts. Please try again in ${lockTimeRemaining} minutes.`,
      })
    }

    const isPasswordValid = await user.comparePassword(password)

    if (!isPasswordValid) {
      logLoginAttempt(normalizedEmail, false, req.ip, req.get('User-Agent'), user._id)

      user.failedLoginAttempts += 1

      // Five failures lock for 30 minutes and trigger a brute-force IP ban.
      if (user.failedLoginAttempts >= 5) {
        user.lockUntil = Date.now() + 30 * 60 * 1000 // 30 minutes
        logAccountLockout(normalizedEmail, req.ip, req.get('User-Agent'), user._id)
        banIPForBruteForce(req.ip, req.get('User-Agent')).catch(console.error)
      }

      await user.save()

      return res.status(401).json({
        success: false,
        message: 'Invalid credentials.',
      })
    }

    user.failedLoginAttempts = 0
    user.lockUntil = undefined
    user.lastLogin = new Date()
    if (user.email === DEMO_USER_EMAIL) {
      user.isDemoAccount = true
    }
    await user.save()

    logLoginAttempt(normalizedEmail, true, req.ip, req.get('User-Agent'), user._id)

    const accessToken = generateAccessToken(user._id)
    const refreshToken = await generateRefreshToken(user._id)

    res.json({
      success: true,
      message: 'Login successful.',
      data: {
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          isDemoAccount: user.isDemo(),
          watchlist: user.watchlist,
          preferences: user.preferences,
        },
        accessToken,
        refreshToken,
      },
    })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({
      success: false,
      message: 'Server error during login.',
    })
  }
}

/**
 * Return the authenticated user's profile, populated watchlist, ratings, and preferences.
 *
 * @param {import('express').Request} req - Reads `req.user._id` from auth middleware.
 * @param {import('express').Response} res - 200 `{ data: { user } }` or 500.
 * @returns {Promise<void>}
 */
export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate({
        path: 'watchlist.content',
        model: 'Content',
      })
      .populate('ratings.content')

    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          isDemoAccount: user.isDemo(),
          profilePicture: user.profilePicture,
          createdAt: user.createdAt,
          watchlist: user.watchlist,
          ratings: user.ratings,
          preferences: user.preferences,
        },
      },
    })

    console.log('Sent user data:', {
      id: user._id,
      username: user.username,
      email: user.email,
      createdAt: user.createdAt,
      profilePicture: user.profilePicture,
    })
  } catch (error) {
    console.error('Get profile error:', error)
    res.status(500).json({
      success: false,
      message: 'Server error fetching profile.',
    })
  }
}

/**
 * Patch username, email, and/or preferences for the authenticated user.
 *
 * @param {import('express').Request} req - Optional `body.username`, `body.email`, `body.preferences`.
 * @param {import('express').Response} res - 200 `{ data: { user } }` (password omitted), 400 duplicate, or 500.
 * @returns {Promise<void>}
 */
export const updateProfile = async (req, res) => {
  try {
    const { username, email, preferences } = req.body

    const updateData = {}
    if (username) updateData.username = username
    if (email) updateData.email = email.toLowerCase().trim()
    if (preferences) updateData.preferences = preferences

    if (username || email) {
      const normalizedEmail = email ? email.toLowerCase().trim() : null
      const existingUser = await User.findOne({
        _id: { $ne: req.user._id },
        $or: [
          ...(username ? [{ username }] : []),
          ...(normalizedEmail ? [{ email: normalizedEmail }] : []),
        ],
      })

      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Username or email already exists.',
        })
      }
    }

    const user = await User.findByIdAndUpdate(req.user._id, updateData, {
      new: true,
      runValidators: true,
    }).select('-password')

    res.json({
      success: true,
      message: 'Profile updated successfully.',
      data: { user },
    })
  } catch (error) {
    console.error('Update profile error:', error)
    res.status(500).json({
      success: false,
      message: 'Server error updating profile.',
    })
  }
}

/**
 * Replace the authenticated user's password after verifying the current one.
 * Complexity rules match registration (8+ chars, mixed case, number, special).
 * The shared demo account cannot change its password.
 *
 * @param {import('express').Request} req - `body.currentPassword`, `body.newPassword`.
 * @param {import('express').Response} res - 200 on success, 400 invalid, 403 demo, 404 user missing, or 500.
 * @returns {Promise<void>}
 */
export const changePassword = async (req, res) => {
  try {
    if (req.user.isDemo()) {
      return res.status(403).json({
        success: false,
        message: 'Password cannot be changed for the demo account.',
      })
    }

    const { currentPassword, newPassword } = req.body

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required.',
      })
    }

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/
    if (!passwordRegex.test(newPassword) || newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message:
          'Password must be at least 8 characters and contain uppercase, lowercase, number, and special character.',
      })
    }

    const user = await User.findById(req.user._id)
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      })
    }

    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password)
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect.',
      })
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 12)

    await User.findByIdAndUpdate(req.user._id, { password: hashedNewPassword })

    res.json({
      success: true,
      message: 'Password changed successfully.',
    })
  } catch (error) {
    console.error('Change password error:', error)
    res.status(500).json({
      success: false,
      message: 'Server error changing password.',
    })
  }
}

/**
 * Store a multer-uploaded profile image, deleting any previous file on disk.
 *
 * @param {import('express').Request} req - `req.file` from upload middleware; `req.user._id`.
 * @param {import('express').Response} res - 200 `{ data: { user } }`, 400 no file, 404, or 500.
 * @returns {Promise<void>}
 */
export const uploadProfilePicture = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded.',
      })
    }

    const user = await User.findById(req.user._id)
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      })
    }

    if (user.profilePicture) {
      const oldPicturePath = path.join(
        process.cwd(),
        'uploads',
        'profiles',
        path.basename(user.profilePicture),
      )
      if (fs.existsSync(oldPicturePath)) {
        fs.unlinkSync(oldPicturePath)
      }
    }

    const profilePicturePath = `/uploads/profiles/${req.file.filename}`
    user.profilePicture = profilePicturePath
    await user.save()

    logFileUpload(req.file.filename, user._id, req.ip, true)

    res.json({
      success: true,
      message: 'Profile picture uploaded successfully.',
      data: {
        user: {
          _id: user._id,
          username: user.username,
          email: user.email,
          profilePicture: user.profilePicture,
          preferences: user.preferences,
        },
      },
    })
  } catch (error) {
    console.error('Upload profile picture error:', error)

    logFileUpload(req.file?.filename || 'unknown', req.user?._id, req.ip, false, error)

    res.status(500).json({
      success: false,
      message: 'Server error uploading profile picture.',
    })
  }
}
