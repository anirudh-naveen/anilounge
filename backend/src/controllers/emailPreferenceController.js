/**
 * HTTP handlers for the signed-in user's optional email settings.
 *
 * Layer: controller. Backs Settings → Email; the same preferences are switched off
 * by the signed unsubscribe links in emails (routes/email.js).
 */

import { getEmailPreferences, setEmailPreferences } from '../services/emailPreferenceService.js'
import { sendError } from '../utils/httpError.js'

/**
 * Current opt-ins, e.g. `{ announcements: true, friend_requests: false }`.
 *
 * @param {import('express').Request} req - `req.user`.
 * @param {import('express').Response} res - 200 `{ data: preferences }` or 500.
 * @returns {Promise<void>}
 */
export const getPreferences = async (req, res) => {
  try {
    res.json({ success: true, data: await getEmailPreferences(req.user._id) })
  } catch (error) {
    sendError(res, error, 'Error loading email preferences')
  }
}

/**
 * Turn optional email categories on or off; unknown keys are ignored.
 *
 * @param {import('express').Request} req - `body` like `{ friend_requests: false }`.
 * @param {import('express').Response} res - 200 `{ data: preferences }` or 500.
 * @returns {Promise<void>}
 */
export const updatePreferences = async (req, res) => {
  try {
    const data = await setEmailPreferences(req.user._id, req.body || {})
    res.json({ success: true, message: 'Email preferences saved.', data })
  } catch (error) {
    sendError(res, error, 'Error saving email preferences')
  }
}

export default { getPreferences, updatePreferences }
