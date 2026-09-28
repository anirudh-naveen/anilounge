/**
 * User registration, login, profile, password, and avatar HTTP handlers.
 *
 * Layer: controller. Issues JWTs via auth middleware helpers, requires email
 * verification for new accounts, enforces lockout (with an emailed unlock link)
 * after failed logins, runs the 2FA login step, and writes profile pictures
 * under `uploads/profiles`.
 */

import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import User, { DEMO_USER_EMAIL } from '../models/User.js'
import { endSession, revokeAllSessions, startSession } from '../services/sessionService.js'
import { validationResult } from 'express-validator'
import bcrypt from 'bcryptjs'
import path from 'path'
import fs from 'fs'
import {
  logLoginAttempt,
  logAccountLockout,
  logAccountDeletion,
  logFileUpload,
} from '../middleware/securityLogger.js'
import { query } from '../../config/postgres.js'
import { banIPForBruteForce, liftBruteForceBan } from '../middleware/ipBan.js'
import { resetAuthRateLimits } from '../middleware/authRateLimit.js'
import {
  consumeEmailCode,
  issueEmailCode,
  markEmailVerified,
  resendWaitSeconds,
  verifyTwoFactorCode,
} from '../services/accountSecurityService.js'
import {
  sendEmailChangedNotice,
  sendUnlockEmail,
  sendVerificationEmail,
} from '../services/emailService.js'

const MAX_FAILED_LOGINS = 5
const LOCK_DURATION_MS = 30 * 60 * 1000
const TWO_FACTOR_CHALLENGE_TTL = '5m'
/** bcrypt hash (cost 12) of a random throwaway string; compared against for unknown emails. */
const TIMING_DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 12)

/**
 * 400 response for express-validator failures, or null when the body is valid.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {import('express').Response | null}
 */
function rejectInvalid(req, res) {
  const errors = validationResult(req)
  if (errors.isEmpty()) return null
  const [first] = errors.array()
  return res.status(400).json({
    success: false,
    message: typeof first?.msg === 'string' && first.msg !== 'Invalid value' ? first.msg : 'Validation failed.',
    errors: errors.array(),
  })
}

/**
 * @param {unknown} email
 * @returns {string}
 */
function normalizeEmail(email) {
  return String(email || '')
    .toLowerCase()
    .trim()
}

/**
 * Count a failed password or 2FA attempt. The fifth failure locks the account for
 * 30 minutes, bans the IP for brute force, and emails the owner an unlock link.
 * The demo account is never counted.
 *
 * @param {object} user - Loaded `User`.
 * @param {import('express').Request} req
 * @returns {Promise<void>}
 */
async function recordFailedLogin(user, req) {
  logLoginAttempt(user.email, false, req.ip, req.get('User-Agent'), user._id)
  if (user.isDemo()) return

  user.failedLoginAttempts += 1
  if (user.failedLoginAttempts >= MAX_FAILED_LOGINS) {
    user.lockUntil = Date.now() + LOCK_DURATION_MS
    logAccountLockout(user.email, req.ip, req.get('User-Agent'), user._id)
    banIPForBruteForce(req.ip, req.get('User-Agent')).catch(console.error)
    issueEmailCode(user._id, 'unlock_account')
      .then((code) => sendUnlockEmail(user, code))
      .catch((error) => console.error('Failed to send unlock email:', error))
  }
  await user.save()
}

/**
 * Reset lockout state, stamp the login, and send access and refresh tokens.
 *
 * @param {object} user - Loaded `User`.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {string} message - Success message.
 * @returns {Promise<void>}
 */
async function completeLogin(user, req, res, message) {
  user.failedLoginAttempts = 0
  user.lockUntil = undefined
  user.lastLogin = new Date()
  if (user.email === DEMO_USER_EMAIL) {
    user.isDemoAccount = true
  }
  await user.save()

  logLoginAttempt(user.email, true, req.ip, req.get('User-Agent'), user._id)

  const accessToken = await startSession(res, user._id)

  res.json({
    success: true,
    message,
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
    },
  })
}

/**
 * 423 response for a locked account, or null when it is not locked.
 * @param {object} user
 * @param {import('express').Response} res
 * @returns {import('express').Response | null}
 */
function rejectLocked(user, res) {
  if (user.isDemo() || !user.lockUntil || user.lockUntil <= Date.now()) return null
  const minutes = Math.ceil((user.lockUntil - Date.now()) / (1000 * 60))
  return res.status(423).json({
    success: false,
    code: 'ACCOUNT_LOCKED',
    message: `Account is locked after too many failed sign-in attempts. Use the unlock link we emailed you, or try again in ${minutes} minutes.`,
  })
}

/**
 * Create an unverified user from validated username/email/password and email a
 * verification code. No session is issued until the email is verified.
 *
 * @param {import('express').Request} req - `body.username`, `body.email`, `body.password` (email is lowercased).
 * @param {import('express').Response} res - 201 `{ verificationRequired, email }`, 400 validation/duplicate, or 500.
 * @returns {Promise<void>}
 */
export const register = async (req, res) => {
  try {
    if (rejectInvalid(req, res)) return

    const { username, email, password } = req.body
    const normalizedEmail = normalizeEmail(email)

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

    const code = await issueEmailCode(user._id, 'verify_email')
    await sendVerificationEmail(user, code)

    res.status(201).json({
      success: true,
      message: 'Account created. Check your email for a verification code.',
      data: { verificationRequired: true, email: user.email },
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
 * Authenticate with email/password.
 * Unverified accounts get 403 `EMAIL_NOT_VERIFIED`; accounts with 2FA get a
 * short-lived `challengeToken` to finish at `/auth/2fa/verify`; otherwise tokens
 * are issued. Five failures lock the account (see `recordFailedLogin`). The shared
 * demo account skips lockouts, verification, and 2FA so it always stays reachable.
 *
 * @param {import('express').Request} req - `body.email`, `body.password`; uses `req.ip` and User-Agent for logs/bans.
 * @param {import('express').Response} res - 200 tokens or `{ requiresTwoFactor, challengeToken }`, 401, 403, 423, 400, or 500.
 * @returns {Promise<void>}
 */
export const login = async (req, res) => {
  try {
    if (rejectInvalid(req, res)) return

    const { password } = req.body
    const normalizedEmail = normalizeEmail(req.body.email)

    const user = await User.findOne({ email: normalizedEmail })
    if (!user) {
      // Spend the same bcrypt time as a real check so response timing does not reveal
      // which emails have accounts.
      await bcrypt.compare(String(password || ''), TIMING_DUMMY_HASH)
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials.',
      })
    }

    if (rejectLocked(user, res)) return

    const isPasswordValid = await user.comparePassword(password)
    if (!isPasswordValid) {
      await recordFailedLogin(user, req)
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials.',
      })
    }

    const isDemo = user.isDemo()
    if (!isDemo && !user.emailVerified) {
      return res.status(403).json({
        success: false,
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Please verify your email before signing in.',
        data: { email: user.email },
      })
    }

    if (!isDemo && user.twoFactorEnabled) {
      const challengeToken = jwt.sign(
        { userId: user._id, purpose: 'two_factor' },
        process.env.JWT_SECRET,
        { expiresIn: TWO_FACTOR_CHALLENGE_TTL, algorithm: 'HS256' },
      )
      return res.json({
        success: true,
        message: 'Enter the code from your authenticator app.',
        data: { requiresTwoFactor: true, challengeToken },
      })
    }

    await completeLogin(user, req, res, 'Login successful.')
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({
      success: false,
      message: 'Server error during login.',
    })
  }
}

/**
 * Second login step for accounts with 2FA: exchange the challenge token plus an
 * authenticator or backup code for access/refresh tokens. Wrong codes count
 * toward the account lockout.
 *
 * @param {import('express').Request} req - `body.challengeToken`, `body.code`.
 * @param {import('express').Response} res - 200 tokens, 401 bad/expired challenge or code, 423 locked, or 500.
 * @returns {Promise<void>}
 */
export const verifyTwoFactorLogin = async (req, res) => {
  try {
    const { challengeToken, code } = req.body || {}
    let payload
    try {
      payload = jwt.verify(String(challengeToken || ''), process.env.JWT_SECRET, {
        algorithms: ['HS256'],
      })
    } catch {
      payload = null
    }
    if (!payload || payload.purpose !== 'two_factor') {
      return res.status(401).json({
        success: false,
        code: 'CHALLENGE_EXPIRED',
        message: 'Your sign-in session expired. Please sign in again.',
      })
    }

    const user = await User.findById(payload.userId)
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' })
    }
    if (rejectLocked(user, res)) return

    if (!(await verifyTwoFactorCode(user._id, code))) {
      await recordFailedLogin(user, req)
      return res.status(401).json({
        success: false,
        message: 'That code is not valid. Try a new code from your app or a backup code.',
      })
    }

    await completeLogin(user, req, res, 'Login successful.')
  } catch (error) {
    console.error('2FA login error:', error)
    res.status(500).json({ success: false, message: 'Server error during sign-in.' })
  }
}

/**
 * Human message for a failed email-code check.
 * @param {string} result - `consumeEmailCode` outcome.
 * @returns {string}
 */
function emailCodeError(result) {
  if (result === 'expired') return 'That code has expired. Request a new one.'
  if (result === 'too_many_attempts') return 'Too many wrong attempts. Request a new code.'
  return 'That code is not valid.'
}

/**
 * Verify a new account's email with its emailed code, then sign the user in.
 *
 * @param {import('express').Request} req - `body.email`, `body.code`.
 * @param {import('express').Response} res - 200 tokens (or `alreadyVerified`), 400 bad code, or 500.
 * @returns {Promise<void>}
 */
export const verifyEmail = async (req, res) => {
  try {
    const user = await User.findOne({ email: normalizeEmail(req.body?.email) })
    if (!user) {
      return res.status(400).json({ success: false, message: 'That code is not valid.' })
    }
    if (user.emailVerified) {
      return res.json({
        success: true,
        message: 'Your email is already verified. Please sign in.',
        data: { alreadyVerified: true },
      })
    }

    const result = await consumeEmailCode(user._id, 'verify_email', req.body?.code)
    if (result !== 'ok') {
      return res.status(400).json({ success: false, code: result, message: emailCodeError(result) })
    }

    await markEmailVerified(user._id)
    user.emailVerified = true
    await completeLogin(user, req, res, 'Email verified. Welcome to AniLounge!')
  } catch (error) {
    console.error('Verify email error:', error)
    res.status(500).json({ success: false, message: 'Server error verifying email.' })
  }
}

/**
 * Email a fresh verification code. Always answers the same way so it cannot be
 * used to discover which emails have accounts; resends are limited to one a minute.
 *
 * @param {import('express').Request} req - `body.email`.
 * @param {import('express').Response} res - 200 generic success, or 500.
 * @returns {Promise<void>}
 */
export const resendVerification = async (req, res) => {
  try {
    const user = await User.findOne({ email: normalizeEmail(req.body?.email) })
    if (user && !user.emailVerified && (await resendWaitSeconds(user._id, 'verify_email')) === 0) {
      const code = await issueEmailCode(user._id, 'verify_email')
      await sendVerificationEmail(user, code)
    }
    res.json({
      success: true,
      message: 'If that account still needs verification, a new code is on its way.',
    })
  } catch (error) {
    console.error('Resend verification error:', error)
    res.status(500).json({ success: false, message: 'Server error sending code.' })
  }
}

/**
 * Unlock a locked account with the code from the lockout email. Also lifts the
 * brute-force IP ban and auth rate-limit counters for the requesting IP (this
 * route bypasses the ban check and the auth limiter).
 *
 * @param {import('express').Request} req - `body.email`, `body.code`.
 * @param {import('express').Response} res - 200 unlocked, 400 bad code, or 500.
 * @returns {Promise<void>}
 */
export const unlockAccount = async (req, res) => {
  try {
    const user = await User.findOne({ email: normalizeEmail(req.body?.email) })
    const result = user
      ? await consumeEmailCode(user._id, 'unlock_account', req.body?.code)
      : 'invalid'
    if (result !== 'ok') {
      return res.status(400).json({ success: false, code: result, message: emailCodeError(result) })
    }

    user.failedLoginAttempts = 0
    user.lockUntil = undefined
    await user.save()
    await liftBruteForceBan(req.ip).catch((error) => console.error('Unban failed:', error))
    await resetAuthRateLimits(req.ip).catch((error) => console.error('Limit reset failed:', error))

    res.json({ success: true, message: 'Your account is unlocked. You can sign in now.' })
  } catch (error) {
    console.error('Unlock account error:', error)
    res.status(500).json({ success: false, message: 'Server error unlocking account.' })
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
          bio: user.bio || '',
          watchlist: user.watchlist,
          ratings: user.ratings,
          preferences: user.preferences,
          profileSettings: user.profileSettings,
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
 * Changing email requires `currentPassword`, marks the new address unverified,
 * emails it a verification code, and notifies the old address. The demo
 * account's username and email are read-only.
 *
 * @param {import('express').Request} req - Optional `body.username`, `body.email` (+ `body.currentPassword`), `body.preferences`.
 * @param {import('express').Response} res - 200 `{ data: { user, emailVerificationSent } }`, 400 invalid/duplicate/wrong password, 403 demo, or 500.
 * @returns {Promise<void>}
 */
export const updateProfile = async (req, res) => {
  try {
    if (rejectInvalid(req, res)) return

    const { username, email, preferences, currentPassword } = req.body
    const user = await User.findById(req.user._id)
    const normalizedEmail = email ? normalizeEmail(email) : null
    const changesUsername = Boolean(username) && username !== user.username
    const changesEmail = Boolean(normalizedEmail) && normalizedEmail !== user.email

    if ((changesUsername || changesEmail) && user.isDemo()) {
      return res.status(403).json({
        success: false,
        message: 'The demo account username and email cannot be changed.',
      })
    }
    if (changesEmail) {
      const passwordOk =
        typeof currentPassword === 'string' && (await user.comparePassword(currentPassword))
      if (!passwordOk) {
        return res.status(400).json({
          success: false,
          message: 'Enter your current password to change your email.',
        })
      }
    }

    if (changesUsername || changesEmail) {
      const existingUser = await User.findOne({
        _id: { $ne: req.user._id },
        $or: [
          ...(changesUsername ? [{ username }] : []),
          ...(changesEmail ? [{ email: normalizedEmail }] : []),
        ],
      })

      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Username or email already exists.',
        })
      }
    }

    const previousEmail = user.email
    if (changesUsername) user.username = username
    if (changesEmail) user.email = normalizedEmail
    if (preferences) user.preferences = { ...user.preferences, ...preferences }
    await user.save()

    if (changesEmail) {
      await query('UPDATE users SET email_verified_at = NULL WHERE id = $1', [user._id])
      user.emailVerified = false
      const code = await issueEmailCode(user._id, 'verify_email')
      await sendVerificationEmail(user, code)
      sendEmailChangedNotice({ email: previousEmail, username: user.username }, user.email).catch(
        (error) => console.error('Failed to send email-change notice:', error),
      )
    }

    res.json({
      success: true,
      message: changesEmail
        ? 'Profile updated. Check your new email for a verification code.'
        : 'Profile updated successfully.',
      data: { user, emailVerificationSent: changesEmail },
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
 * Revokes all other sessions and starts a fresh one for this browser.
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

    // Sign out every other browser; keep this one signed in with a fresh session.
    await revokeAllSessions(req.user._id)
    await startSession(res, req.user._id)

    res.json({
      success: true,
      message: 'Password changed successfully. Other devices have been signed out.',
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
 * Permanently delete the authenticated user's account after re-checking their password.
 * Watchlist, ratings, favorites, friendships, posts, messages, and refresh tokens are
 * removed by `ON DELETE CASCADE`; the uploaded profile picture file is removed too.
 * The shared demo account cannot be deleted.
 *
 * @param {import('express').Request} req - `body.password`; `req.user` from auth middleware.
 * @param {import('express').Response} res - 200 on success, 400 missing/incorrect password, 403 demo, 404, or 500.
 * @returns {Promise<void>}
 */
export const deleteAccount = async (req, res) => {
  try {
    if (req.user.isDemo()) {
      return res.status(403).json({
        success: false,
        message: 'The demo account cannot be deleted.',
      })
    }

    const { password } = req.body || {}
    if (typeof password !== 'string' || !password) {
      return res.status(400).json({
        success: false,
        message: 'Password is required to delete your account.',
      })
    }

    const user = await User.findById(req.user._id)
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      })
    }
    if (user.isDemo()) {
      return res.status(403).json({
        success: false,
        message: 'The demo account cannot be deleted.',
      })
    }

    const isPasswordValid = await user.comparePassword(password)
    if (!isPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Password is incorrect.',
      })
    }

    await endSession(req, res)
    await query('DELETE FROM users WHERE id = $1 AND is_demo = false', [user._id])

    if (user.profilePicture && !user.profilePicture.startsWith('http')) {
      const picturePath = path.join(
        process.cwd(),
        'uploads',
        'profiles',
        path.basename(user.profilePicture),
      )
      fs.promises.unlink(picturePath).catch(() => {})
    }

    logAccountDeletion(user._id, req.ip, req.get('User-Agent'))

    res.json({
      success: true,
      message: 'Your account has been deleted.',
    })
  } catch (error) {
    console.error('Delete account error:', error)
    res.status(500).json({
      success: false,
      message: 'Server error deleting account.',
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
