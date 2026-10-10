/**
 * HTTP handlers for the iOS home screen widgets.
 *
 * Layer: controller. The feed is public (signed in with a widget token, see
 * `services/widgetService.js`); issuing a token needs the app's normal sign-in. The
 * share extension uses the same token to look up a shared link and add the title to
 * the watchlist (`services/shareService.js`).
 */

import shareService from '../services/shareService.js'
import widgetService from '../services/widgetService.js'
import { HttpError, assertNotDemo, sendError } from '../utils/httpError.js'

/** The account behind the request's widget token, or a 401. */
async function widgetUser(req) {
  const userId = await widgetService.userForWidgetToken(widgetService.widgetTokenFrom(req))
  if (!userId) {
    throw new HttpError(401, 'Open AniLounge and sign in first.', 'WIDGET_TOKEN_INVALID')
  }
  return userId
}

/**
 * Both widgets' data. `Authorization: Widget <token>` adds the user's activity and
 * watchlist releases.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res - 200 `{ data: { signedIn, activity, releases } }`, 401 expired token, or 500.
 * @returns {Promise<void>}
 */
export const getFeed = async (req, res) => {
  try {
    const data = await widgetService.widgetFeedFor(req)
    res.set('Cache-Control', 'private, no-store')
    res.json({ success: true, data })
  } catch (error) {
    sendError(res, error, 'Error loading widget data')
  }
}

/**
 * A widget token for this device.
 *
 * @param {import('express').Request} req - `req.user`.
 * @param {import('express').Response} res - 201 `{ data: { token } }`, 403 demo, or 500.
 * @returns {Promise<void>}
 */
export const issueToken = async (req, res) => {
  try {
    assertNotDemo(req.user)
    const token = await widgetService.issueWidgetToken(req.user._id)
    res.set('Cache-Control', 'no-store')
    res.status(201).json({ success: true, data: { token } })
  } catch (error) {
    sendError(res, error, 'Error setting up widgets')
  }
}

/**
 * Revoke a widget token (signing out on a device), from `Authorization: Widget <token>`
 * or `body.token` (the app's API client sends its own Authorization header).
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res - 200 or 500.
 * @returns {Promise<void>}
 */
export const revokeToken = async (req, res) => {
  try {
    await widgetService.revokeWidgetToken(widgetService.widgetTokenFrom(req) || req.body?.token)
    res.json({ success: true })
  } catch (error) {
    sendError(res, error, 'Error signing widgets out')
  }
}

/**
 * The title behind a link shared to AniLounge.
 *
 * @param {import('express').Request} req - `body.url` (a URL or text with one); widget token.
 * @param {import('express').Response} res - 200 `{ data: { id, title, contentType, path, status } }`, 400, 401, 404, or 500.
 * @returns {Promise<void>}
 */
export const lookupShared = async (req, res) => {
  try {
    const userId = await widgetUser(req)
    const data = await shareService.lookupSharedTitle(userId, req.body?.url)
    res.json({ success: true, data })
  } catch (error) {
    sendError(res, error, 'Error looking up that link')
  }
}

/**
 * Add a shared title to the watchlist as Plan to Watch.
 *
 * @param {import('express').Request} req - `body.contentId`; widget token.
 * @param {import('express').Response} res - 200 `{ data: { added, status } }`, 401, 404, or 500.
 * @returns {Promise<void>}
 */
export const addShared = async (req, res) => {
  try {
    const userId = await widgetUser(req)
    const data = await shareService.addSharedTitle(userId, req.body?.contentId)
    res.json({ success: true, data })
  } catch (error) {
    sendError(res, error, 'Error adding to your watchlist')
  }
}

export default { getFeed, issueToken, revokeToken, lookupShared, addShared }
