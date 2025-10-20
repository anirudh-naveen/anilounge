import User from '../models/User.js'
import { generateToken } from '../middleware/auth.js'
import { validationResult } from 'express-validator'
import bcrypt from 'bcryptjs'
import path from 'path'
import fs from 'fs'

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

    // Check password
    const isPasswordValid = await user.comparePassword(password)
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials.',
      })
    }

    // Generate token
    const token = generateToken(user._id)

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
        token,
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
          watchlist: user.watchlist,
          ratings: user.ratings,
          preferences: user.preferences,
        },
      },
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
        $or: [
          ...(username ? [{ username }] : []),
          ...(email ? [{ email }] : []),
        ],
      })

      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Username or email already exists.',
        })
      }
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      updateData,
      { new: true, runValidators: true },
    ).select('-password')

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
      const oldPicturePath = path.join(process.cwd(), 'uploads', 'profiles', path.basename(user.profilePicture))
      if (fs.existsSync(oldPicturePath)) {
        fs.unlinkSync(oldPicturePath)
      }
    }

    // Update user with new profile picture path
    const profilePicturePath = `/uploads/profiles/${req.file.filename}`
    user.profilePicture = profilePicturePath
    await user.save()

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
        }
      },
    })
  } catch (error) {
    console.error('Upload profile picture error:', error)
    res.status(500).json({
      success: false,
      message: 'Server error uploading profile picture.',
    })
  }
}
