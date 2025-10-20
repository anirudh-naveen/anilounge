import User from '../models/User.js'
import { generateAccessToken, generateRefreshToken } from '../middleware/auth.js'
import { validationResult } from 'express-validator'
import bcrypt from 'bcryptjs'
import path from 'path'
import fs from 'fs'
import { logLoginAttempt, logAccountLockout, logFileUpload } from '../middleware/securityLogger.js'
import { banIPForBruteForce, progressiveBan } from '../middleware/ipBan.js'

export const register = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed.',
        errors: errors.array(),
      })
    }

    const { username, email, password } = req.body

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { username }],
    })

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email or username already exists.',
      })
    }

    // Create new user
    const user = new User({
      username,
      email,
      password,
    })

    await user.save()

    // Generate token
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

export const login = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed.',
        errors: errors.array(),
      })
    }

    const { email, password } = req.body

    // Find user by email
    const user = await User.findOne({ email })
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials.',
      })
    }

    // Check if account is locked
    const isLocked = user.lockUntil && user.lockUntil > Date.now()
    if (isLocked) {
      const lockTimeRemaining = Math.ceil((user.lockUntil - Date.now()) / (1000 * 60))
      return res.status(423).json({
        success: false,
        message: `Account is temporarily locked due to too many failed login attempts. Please try again in ${lockTimeRemaining} minutes.`,
      })
    }

    // Check password FIRST
    const isPasswordValid = await user.comparePassword(password)

    if (!isPasswordValid) {
      // Log failed login attempt
      logLoginAttempt(email, false, req.ip, req.get('User-Agent'), user._id)

      // Increment failed attempts
      user.failedLoginAttempts += 1

      // Lock account after 5 attempts
      if (user.failedLoginAttempts >= 5) {
        user.lockUntil = Date.now() + 30 * 60 * 1000 // 30 minutes
        // Log account lockout
        logAccountLockout(email, req.ip, req.get('User-Agent'), user._id)
        // Ban IP for brute force
        banIPForBruteForce(req.ip, req.get('User-Agent')).catch(console.error)
      }

      // Save the failed attempt
      await user.save()

      return res.status(401).json({
        success: false,
        message: 'Invalid credentials.',
      })
    }

    // SUCCESSFUL LOGIN - Reset failed attempts
    user.failedLoginAttempts = 0
    user.lockUntil = undefined
    user.lastLogin = new Date()
    await user.save()

    // Log successful login
    logLoginAttempt(email, true, req.ip, req.get('User-Agent'), user._id)

    // Generate tokens
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

// Updates user preferences
export const updateProfile = async (req, res) => {
  try {
    const { username, email, preferences } = req.body

    // Build update object
    const updateData = {}
    if (username) updateData.username = username
    if (email) updateData.email = email
    if (preferences) updateData.preferences = preferences

    // Check if username or email already exists (if being updated)
    if (username || email) {
      const existingUser = await User.findOne({
        _id: { $ne: req.user._id },
        $or: [...(username ? [{ username }] : []), ...(email ? [{ email }] : [])],
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

// Change user password
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required.',
      })
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters long.',
      })
    }

    // Get user with password
    const user = await User.findById(req.user._id)
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      })
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password)
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect.',
      })
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 12)

    // Update password
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

// Upload profile picture
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

    // Delete old profile picture if it exists
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

    // Update user with new profile picture path
    const profilePicturePath = `/uploads/profiles/${req.file.filename}`
    user.profilePicture = profilePicturePath
    await user.save()

    // Log successful file upload
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

    // Log failed file upload
    logFileUpload(req.file?.filename || 'unknown', req.user?._id, req.ip, false, error)

    res.status(500).json({
      success: false,
      message: 'Server error uploading profile picture.',
    })
  }
}
