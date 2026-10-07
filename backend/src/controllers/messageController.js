/**
 * HTTP handlers for direct messages.
 *
 * Layer: controller. All routes require auth. Business rules live in
 * `services/messageService.js`; the demo account can read but not send.
 */

import messageService from '../services/messageService.js'
import { assertNotDemo, sendError } from '../utils/httpError.js'

/**
 * The viewer's conversations and incoming friend requests.
 *
 * @param {import('express').Request} req - `req.user`.
 * @param {import('express').Response} res - 200 `{ data: { conversations, requests } }` or 500.
 * @returns {Promise<void>}
 */
export const getConversations = async (req, res) => {
  try {
    const data = await messageService.listConversations(req.user._id)
    res.json({ success: true, data })
  } catch (error) {
    sendError(res, error, 'Error loading messages')
  }
}

/**
 * Unread message and friend request counts for the profile-menu badge.
 *
 * @param {import('express').Request} req - `req.user`.
 * @param {import('express').Response} res - 200 `{ data: { messages, requests } }` or 500.
 * @returns {Promise<void>}
 */
export const getUnreadCount = async (req, res) => {
  try {
    const data = await messageService.countUnread(req.user._id)
    res.json({ success: true, data })
  } catch (error) {
    sendError(res, error, 'Error loading unread messages')
  }
}

/**
 * One conversation, a page at a time; marks it read.
 *
 * @param {import('express').Request} req - `params.id` is the other user's id; optional
 *   `query.before` / `query.after` message-id cursors.
 * @param {import('express').Response} res - 200 `{ data: thread }`, 400, 404, or 500.
 * @returns {Promise<void>}
 */
export const getThread = async (req, res) => {
  try {
    const data = await messageService.getThread(req.user._id, req.params.id, {
      before: req.query.before,
      after: req.query.after,
    })
    res.json({ success: true, data })
  } catch (error) {
    sendError(res, error, 'Error loading conversation')
  }
}

/**
 * Send a message to a friend.
 *
 * @param {import('express').Request} req - `params.id` is the recipient; `body.body` is the text.
 * @param {import('express').Response} res - 201 `{ data: message, warning }` (`warning` is set
 *   when blocked language was masked), 400, 403, 404, 429, or 500.
 * @returns {Promise<void>}
 */
export const sendMessage = async (req, res) => {
  try {
    assertNotDemo(req.user)
    const { message, warning } = await messageService.sendMessage(
      req.user,
      req.params.id,
      req.body?.body,
    )
    res.status(201).json({ success: true, data: message, warning })
  } catch (error) {
    sendError(res, error, 'Error sending message')
  }
}

/**
 * Settings → Communication, e.g. `{ allowProfanity: false }`.
 *
 * @param {import('express').Request} req - `req.user`.
 * @param {import('express').Response} res - 200 `{ data: settings }` or 500.
 * @returns {Promise<void>}
 */
export const getCommunicationSettings = async (req, res) => {
  try {
    const data = await messageService.getCommunicationSettings(req.user._id)
    res.json({ success: true, data })
  } catch (error) {
    sendError(res, error, 'Error loading communication settings')
  }
}

/**
 * Save Settings → Communication. The demo account can't change it.
 *
 * @param {import('express').Request} req - `body.allowProfanity` (boolean).
 * @param {import('express').Response} res - 200 `{ data: settings }`, 400, 403 demo, or 500.
 * @returns {Promise<void>}
 */
export const updateCommunicationSettings = async (req, res) => {
  try {
    assertNotDemo(req.user)
    const data = await messageService.setCommunicationSettings(req.user._id, req.body || {})
    res.json({ success: true, message: 'Communication settings saved.', data })
  } catch (error) {
    sendError(res, error, 'Error saving communication settings')
  }
}

export default {
  getConversations,
  getUnreadCount,
  getThread,
  sendMessage,
  getCommunicationSettings,
  updateCommunicationSettings,
}
