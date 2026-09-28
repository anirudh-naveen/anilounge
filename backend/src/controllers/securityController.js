/**
 * Signed-in account security: status and authenticator-app 2FA management.
 *
 * Layer: controller. Mounted under `/account` (authenticated). The shared demo
 * account cannot enable 2FA so it can never be locked behind a code.
 */

import User from '../models/User.js'
import {
  beginTwoFactorSetup,
  confirmTwoFactorSetup,
  disableTwoFactor,
  regenerateBackupCodes,
  remainingBackupCodes,
  verifyTwoFactorCode,
} from '../services/accountSecurityService.js'

/**
 * 403 for the demo account, or null otherwise.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {import('express').Response | null}
 */
function rejectDemo(req, res) {
  if (!req.user.isDemo()) return null
  return res.status(403).json({
    success: false,
    message: 'Two-factor authentication is disabled for the demo account.',
  })
}

/**
 * Email verification and 2FA status for the Settings page.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res - 200 `{ emailVerified, twoFactorEnabled, backupCodesRemaining }` or 500.
 * @returns {Promise<void>}
 */
export const getSecurityStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
    res.json({
      success: true,
      data: {
        emailVerified: user.emailVerified,
        twoFactorEnabled: user.twoFactorEnabled,
        backupCodesRemaining: user.twoFactorEnabled ? await remainingBackupCodes(user._id) : 0,
      },
    })
  } catch (error) {
    console.error('Security status error:', error)
    res.status(500).json({ success: false, message: 'Error loading security settings' })
  }
}

/**
 * Begin 2FA setup: returns a QR code and secret for an authenticator app.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res - 200 `{ secret, otpauthUrl, qrCodeDataUrl }`, 400 already on, 403 demo, or 500.
 * @returns {Promise<void>}
 */
export const startTwoFactorSetup = async (req, res) => {
  try {
    if (rejectDemo(req, res)) return
    const user = await User.findById(req.user._id)
    if (user.twoFactorEnabled) {
      return res.status(400).json({ success: false, message: 'Two-factor is already on.' })
    }
    res.json({ success: true, data: await beginTwoFactorSetup(user) })
  } catch (error) {
    console.error('2FA setup error:', error)
    res.status(500).json({ success: false, message: 'Error starting two-factor setup' })
  }
}

/**
 * Finish setup with a code from the app; returns one-time backup codes.
 *
 * @param {import('express').Request} req - `body.code`.
 * @param {import('express').Response} res - 200 `{ backupCodes }`, 400 wrong code, 403 demo, or 500.
 * @returns {Promise<void>}
 */
export const enableTwoFactor = async (req, res) => {
  try {
    if (rejectDemo(req, res)) return
    const backupCodes = await confirmTwoFactorSetup(req.user._id, req.body?.code)
    if (!backupCodes) {
      return res.status(400).json({
        success: false,
        message: 'That code did not match. Check your app and try the newest code.',
      })
    }
    res.json({ success: true, message: 'Two-factor authentication is on.', data: { backupCodes } })
  } catch (error) {
    console.error('2FA enable error:', error)
    res.status(500).json({ success: false, message: 'Error enabling two-factor' })
  }
}

/**
 * Turn 2FA off after re-checking the password and a current (or backup) code.
 *
 * @param {import('express').Request} req - `body.password`, `body.code`.
 * @param {import('express').Response} res - 200, 400 wrong password/code, or 500.
 * @returns {Promise<void>}
 */
export const turnOffTwoFactor = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
    const { password, code } = req.body || {}
    if (typeof password !== 'string' || !(await user.comparePassword(password))) {
      return res.status(400).json({ success: false, message: 'Password is incorrect.' })
    }
    if (!(await verifyTwoFactorCode(user._id, code))) {
      return res.status(400).json({ success: false, message: 'That code is not valid.' })
    }
    await disableTwoFactor(user._id)
    res.json({ success: true, message: 'Two-factor authentication is off.' })
  } catch (error) {
    console.error('2FA disable error:', error)
    res.status(500).json({ success: false, message: 'Error disabling two-factor' })
  }
}

/**
 * Replace backup codes after checking a current authenticator code.
 *
 * @param {import('express').Request} req - `body.code`.
 * @param {import('express').Response} res - 200 `{ backupCodes }`, 400 wrong code or 2FA off, or 500.
 * @returns {Promise<void>}
 */
export const newBackupCodes = async (req, res) => {
  try {
    if (!(await verifyTwoFactorCode(req.user._id, req.body?.code))) {
      return res.status(400).json({ success: false, message: 'That code is not valid.' })
    }
    res.json({ success: true, data: { backupCodes: await regenerateBackupCodes(req.user._id) } })
  } catch (error) {
    console.error('Backup codes error:', error)
    res.status(500).json({ success: false, message: 'Error creating backup codes' })
  }
}

export default {
  getSecurityStatus,
  startTwoFactorSetup,
  enableTwoFactor,
  turnOffTwoFactor,
  newBackupCodes,
}
