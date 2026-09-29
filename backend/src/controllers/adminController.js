/**
 * HTTP handlers for the admin page: catalog editing, roles, mutes, and bans, plus the
 * public staff list behind username badges.
 *
 * Layer: controller. Admin routes are behind `authMiddleware` and `adminOnly` (role and
 * ban changes also `creatorOnly`). Business rules live in `services/adminService.js`.
 */

import adminService from '../services/adminService.js'
import { sendError } from '../utils/httpError.js'

/**
 * Search one kind of catalog row by name.
 *
 * @param {import('express').Request} req - `query.q`, `query.type` (movie|series|special|character|voice|studio), `query.page`.
 * @param {import('express').Response} res - 200 `{ data: { items, page, pageSize, total } }` or 500.
 * @returns {Promise<void>}
 */
export const searchContent = async (req, res) => {
  try {
    const data = await adminService.searchContent(req.query)
    res.json({ success: true, data })
  } catch (error) {
    sendError(res, error, 'Error searching content')
  }
}

/**
 * Editable values and linked rows for one catalog row.
 *
 * @param {import('express').Request} req - `params.id`.
 * @param {import('express').Response} res - 200 `{ data: { id, kind, fields, values, locked, links } }`, 400, 404, or 500.
 * @returns {Promise<void>}
 */
export const getContent = async (req, res) => {
  try {
    const data = await adminService.getEditableContent(req.params.id)
    res.json({ success: true, data })
  } catch (error) {
    sendError(res, error, 'Error loading content')
  }
}

/**
 * Save edits to one catalog row and lock/unlock fields against the catalog sync.
 *
 * @param {import('express').Request} req - `params.id`, `body.changes` `{ field: value }`, `body.unlock` field names.
 * @param {import('express').Response} res - 200 `{ data }` (same shape as getContent), 400, 404, or 500.
 * @returns {Promise<void>}
 */
export const updateContent = async (req, res) => {
  try {
    const data = await adminService.updateContent(req.params.id, req.body || {})
    console.log(`Admin ${req.user._id} edited content ${req.params.id}`)
    res.json({ success: true, message: 'Saved.', data })
  } catch (error) {
    sendError(res, error, 'Error saving content')
  }
}

/**
 * Sync notices from the last 14 days: what the catalog sync changed, or was blocked from
 * changing by an admin lock.
 *
 * @param {import('express').Request} req - `query.outcome` (changed|blocked), `query.page`.
 * @param {import('express').Response} res - 200 `{ data: { items, page, pageSize, total } }` or 500.
 * @returns {Promise<void>}
 */
export const listSyncChanges = async (req, res) => {
  try {
    const data = await adminService.listSyncChanges(req.query)
    res.json({ success: true, data })
  } catch (error) {
    sendError(res, error, 'Error loading sync changes')
  }
}

/**
 * Live notice count for the admin tab badge.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res - 200 `{ data: { count } }` or 500.
 * @returns {Promise<void>}
 */
export const countSyncChanges = async (req, res) => {
  try {
    res.json({ success: true, data: { count: await adminService.countSyncChanges() } })
  } catch (error) {
    sendError(res, error, 'Error counting sync changes')
  }
}

/**
 * Revert (and lock), apply, or dismiss sync notices.
 *
 * @param {import('express').Request} req - `params.action` (revert|apply|dismiss), `body.ids` (max 100).
 * @param {import('express').Response} res - 200 `{ data: { done } }`, 400, or 500.
 * @returns {Promise<void>}
 */
export const resolveSyncChanges = async (req, res) => {
  try {
    const { action } = req.params
    const data = await adminService.resolveSyncChanges(req.user, req.body?.ids, action)
    const verb = { revert: 'Reverted and locked', apply: 'Applied', dismiss: 'Dismissed' }[action]
    res.json({
      success: true,
      message: `${verb} ${data.done} change${data.done === 1 ? '' : 's'}.`,
      data,
    })
  } catch (error) {
    sendError(res, error, 'Error updating sync changes')
  }
}

/**
 * List users with their roles and moderation state.
 *
 * @param {import('express').Request} req - `query.q`, `query.filter` (all|staff|muted|banned), `query.page`.
 * @param {import('express').Response} res - 200 `{ data: { items, page, pageSize, total } }` or 500.
 * @returns {Promise<void>}
 */
export const listUsers = async (req, res) => {
  try {
    const data = await adminService.listUsers(req.query)
    res.json({ success: true, data })
  } catch (error) {
    sendError(res, error, 'Error loading users')
  }
}

/**
 * Creator only: make a user an admin or a regular user.
 *
 * @param {import('express').Request} req - `params.id`, `body.role` ('user' | 'admin').
 * @param {import('express').Response} res - 200 `{ data: user }`, 400, 403, 404, or 500.
 * @returns {Promise<void>}
 */
export const setUserRole = async (req, res) => {
  try {
    const data = await adminService.setUserRole(req.user, req.params.id, req.body?.role)
    const message =
      data.role === 'admin'
        ? `${data.username} is now an admin.`
        : `${data.username} is no longer an admin.`
    res.json({ success: true, message, data })
  } catch (error) {
    sendError(res, error, 'Error updating role')
  }
}

/**
 * Mute a user for a while, or lift the mute.
 *
 * @param {import('express').Request} req - `params.id`, `body.duration` (1h|24h|7d|30d|permanent|off), optional `body.reason`.
 * @param {import('express').Response} res - 200 `{ data: user }`, 400, 403, 404, or 500.
 * @returns {Promise<void>}
 */
export const muteUser = async (req, res) => {
  try {
    const data = await adminService.muteUser(req.user, req.params.id, req.body || {})
    const message = data.mutedUntil ? `${data.username} is muted.` : `${data.username} is unmuted.`
    res.json({ success: true, message, data })
  } catch (error) {
    sendError(res, error, 'Error updating mute')
  }
}

/**
 * Creator only: ban or unban a user.
 *
 * @param {import('express').Request} req - `params.id`, `body.banned` (boolean), optional `body.reason`.
 * @param {import('express').Response} res - 200 `{ data: user }`, 400, 403, 404, or 500.
 * @returns {Promise<void>}
 */
export const setBan = async (req, res) => {
  try {
    const data = await adminService.setBan(req.user, req.params.id, req.body || {})
    const message = data.bannedAt ? `${data.username} is banned.` : `${data.username} is unbanned.`
    res.json({ success: true, message, data })
  } catch (error) {
    sendError(res, error, 'Error updating ban')
  }
}

/**
 * Public: staff accounts, for the creator/admin badges shown next to usernames.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res - 200 `{ data: [{ id, username, role }] }` or 500.
 * @returns {Promise<void>}
 */
export const listStaff = async (req, res) => {
  try {
    res.set('Cache-Control', 'public, max-age=60')
    res.json({ success: true, data: await adminService.listStaff() })
  } catch (error) {
    sendError(res, error, 'Error loading staff')
  }
}

export default {
  searchContent,
  getContent,
  updateContent,
  listSyncChanges,
  countSyncChanges,
  resolveSyncChanges,
  listUsers,
  setUserRole,
  muteUser,
  setBan,
  listStaff,
}
