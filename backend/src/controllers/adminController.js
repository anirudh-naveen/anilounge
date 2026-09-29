/**
 * HTTP handlers for the admin page: content editing and user roles.
 *
 * Layer: controller. Every route is behind `authMiddleware` and `adminOnly`.
 * Business rules live in `services/adminService.js`.
 */

import adminService from '../services/adminService.js'
import { sendError } from '../utils/httpError.js'

/**
 * Search watchable content by title.
 *
 * @param {import('express').Request} req - `query.q`, `query.type` (movie|series|special), `query.page`.
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
 * Editable values for one title.
 *
 * @param {import('express').Request} req - `params.id`.
 * @param {import('express').Response} res - 200 `{ data: { id, kind, fields, values, locked } }`, 400, 404, or 500.
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
 * Save edits to one title and lock/unlock fields against the catalog sync.
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
 * List users with their roles.
 *
 * @param {import('express').Request} req - `query.q`, `query.admins` ('true' for admins only), `query.page`.
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
 * Make a user an admin or a regular user.
 *
 * @param {import('express').Request} req - `params.id`, `body.role` ('user' | 'admin').
 * @param {import('express').Response} res - 200 `{ data: user }`, 400, 404, or 500.
 * @returns {Promise<void>}
 */
export const setUserRole = async (req, res) => {
  try {
    const data = await adminService.setUserRole(req.user, req.params.id, req.body?.role)
    const message =
      data.role === 'admin' ? `${data.username} is now an admin.` : `${data.username} is no longer an admin.`
    res.json({ success: true, message, data })
  } catch (error) {
    sendError(res, error, 'Error updating role')
  }
}

export default { searchContent, getContent, updateContent, listUsers, setUserRole }
