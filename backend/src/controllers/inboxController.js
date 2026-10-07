/**
 * HTTP handlers for the profile-menu inbox.
 *
 * Layer: controller. All routes require auth. Business rules live in
 * `services/inboxService.js`.
 */

import inboxService from '../services/inboxService.js'
import { sendError } from '../utils/httpError.js'

/**
 * A page of the inbox.
 *
 * @param {import('express').Request} req - Optional `query.before` (ISO time cursor).
 * @param {import('express').Response} res - 200 `{ data: { items, hasMore, importClashes } }`, 400, or 500.
 * @returns {Promise<void>}
 */
export const getInbox = async (req, res) => {
  try {
    const data = await inboxService.listInbox(req.user._id, { before: req.query.before })
    res.json({ success: true, data })
  } catch (error) {
    sendError(res, error, 'Error loading inbox')
  }
}

/**
 * Unread counts for the profile-menu badge.
 *
 * @param {import('express').Request} req - `req.user`.
 * @param {import('express').Response} res - 200 `{ data: { notifications, news, importClashes, total } }` or 500.
 * @returns {Promise<void>}
 */
export const getUnread = async (req, res) => {
  try {
    res.json({ success: true, data: await inboxService.countUnread(req.user._id) })
  } catch (error) {
    sendError(res, error, 'Error loading inbox')
  }
}

/**
 * Mark items read (`body.ids`) or everything (no `ids`).
 *
 * @param {import('express').Request} req - Optional `body.ids`.
 * @param {import('express').Response} res - 200 `{ data: counts }`, 400, or 500.
 * @returns {Promise<void>}
 */
export const markRead = async (req, res) => {
  try {
    const data = await inboxService.markRead(req.user._id, { ids: req.body?.ids })
    res.json({ success: true, data })
  } catch (error) {
    sendError(res, error, 'Error updating inbox')
  }
}

export default { getInbox, getUnread, markRead }
