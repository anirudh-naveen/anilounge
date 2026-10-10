/**
 * HTTP handlers for iOS push notification devices and settings.
 *
 * Layer: controller. All routes require auth; rules live in `services/pushService.js`.
 * The shared demo account can't register a device (everyone signed in to it would get
 * its pushes).
 */

import pushService from '../services/pushService.js'
import { assertNotDemo, sendError } from '../utils/httpError.js'

/**
 * Register the app's device token for the signed-in user.
 *
 * @param {import('express').Request} req - `body.token` (hex APNs token).
 * @param {import('express').Response} res - 200, 400 bad token, 403 demo, or 500.
 * @returns {Promise<void>}
 */
export const registerDevice = async (req, res) => {
  try {
    assertNotDemo(req.user)
    await pushService.registerDevice(req.user._id, req.body?.token)
    res.json({ success: true, data: { registered: true } })
  } catch (error) {
    sendError(res, error, 'Error registering for notifications')
  }
}

/**
 * Stop pushes to a device (before signing out on it).
 *
 * @param {import('express').Request} req - `params.token`.
 * @param {import('express').Response} res - 200 or 500.
 * @returns {Promise<void>}
 */
export const unregisterDevice = async (req, res) => {
  try {
    await pushService.unregisterDevice(req.user._id, req.params.token)
    res.json({ success: true, data: { registered: false } })
  } catch (error) {
    sendError(res, error, 'Error turning off notifications')
  }
}

/**
 * Which kinds of push the user gets.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res - 200 `{ data: { friends, forum, messages, releases } }` or 500.
 * @returns {Promise<void>}
 */
export const getSettings = async (req, res) => {
  try {
    const data = await pushService.getPushSettings(req.user._id)
    res.json({ success: true, data })
  } catch (error) {
    sendError(res, error, 'Error loading notification settings')
  }
}

/**
 * Turn kinds of push on or off.
 *
 * @param {import('express').Request} req - `body` with boolean `friends`, `forum`, `messages`, `releases`.
 * @param {import('express').Response} res - 200 `{ data: settings }`, 400, or 500.
 * @returns {Promise<void>}
 */
export const updateSettings = async (req, res) => {
  try {
    const data = await pushService.setPushSettings(req.user._id, req.body)
    res.json({ success: true, message: 'Notification settings saved.', data })
  } catch (error) {
    sendError(res, error, 'Error saving notification settings')
  }
}

export default { registerDevice, unregisterDevice, getSettings, updateSettings }
