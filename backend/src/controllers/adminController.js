/**
 * HTTP handlers for the admin page: catalog editing, roles, mutes, and bans, plus the
 * public staff list behind username badges.
 *
 * Layer: controller. Admin routes are behind `authMiddleware` and `adminOnly` (role and
 * ban changes also `creatorOnly`). Business rules live in `services/adminService.js`.
 */

import adminService from '../services/adminService.js'
import adminLinks from '../services/adminLinks.js'
import { LOG_CATEGORIES, listLogMonths, readLogMonth } from '../services/adminLog.js'
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
    const data = await adminService.updateContent(req.params.id, req.body || {}, req.user)
    res.json({ success: true, message: 'Saved.', data })
  } catch (error) {
    sendError(res, error, 'Error saving content')
  }
}

/**
 * Add or remove a link (character in a title, voice actor for a character, studio
 * for a title), then return the editor row the admin is looking at.
 *
 * @param {import('express').Request} req - `params.op` (add|remove), `body.link` `{ type, workId, characterId?, voiceId?, studioId?, role? }`, `body.editorId`.
 * @param {import('express').Response} res - 200 `{ data }` (editor row), 400, or 500.
 * @returns {Promise<void>}
 */
export const changeLink = async (req, res) => {
  try {
    const { link, editorId } = req.body || {}
    if (req.params.op === 'add') await adminLinks.addLink(req.user, link)
    else await adminLinks.removeLink(req.user, link)
    const data = await adminService.getEditableContent(editorId)
    res.json({ success: true, message: req.params.op === 'add' ? 'Added.' : 'Removed.', data })
  } catch (error) {
    sendError(res, error, 'Error updating links')
  }
}

/**
 * Set a title's cast order.
 *
 * @param {import('express').Request} req - `params.id` (title), `body.characterIds` in the new order.
 * @param {import('express').Response} res - 200 `{ data }` (editor row), 400, or 500.
 * @returns {Promise<void>}
 */
export const reorderCast = async (req, res) => {
  try {
    await adminLinks.reorderCast(req.user, req.params.id, req.body?.characterIds)
    const data = await adminService.getEditableContent(req.params.id)
    res.json({ success: true, message: 'Cast order saved.', data })
  } catch (error) {
    sendError(res, error, 'Error saving cast order')
  }
}

/**
 * Change a character's role in a title.
 *
 * @param {import('express').Request} req - `body` `{ workId, characterId, role, editorId }`.
 * @param {import('express').Response} res - 200 `{ data }` (editor row), 400, 404, or 500.
 * @returns {Promise<void>}
 */
export const setAppearanceRole = async (req, res) => {
  try {
    await adminLinks.setAppearanceRole(req.user, req.body || {})
    const data = await adminService.getEditableContent(req.body?.editorId)
    res.json({ success: true, message: 'Role saved.', data })
  } catch (error) {
    sendError(res, error, 'Error saving role')
  }
}

/**
 * Admin log: months with entries, and one month's lines (read-only).
 *
 * @param {import('express').Request} req - `query.month` (YYYY-MM, default newest), `query.category` (content|moderation|sync).
 * @param {import('express').Response} res - 200 `{ data: { months, month, entries } }` or 500.
 * @returns {Promise<void>}
 */
export const getLog = async (req, res) => {
  try {
    const months = await listLogMonths()
    const month = months.some((row) => row.month === req.query.month)
      ? req.query.month
      : months[0]?.month || null
    const category = LOG_CATEGORIES.includes(req.query.category) ? req.query.category : undefined
    const entries = month ? await readLogMonth(month, category) : []
    res.json({ success: true, data: { months, month, entries } })
  } catch (error) {
    sendError(res, error, 'Error loading the admin log')
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
 * @param {import('express').Request} req - `query.q`, `query.filter` (all|staff|muted|banned|flagged), `query.page`.
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
 * Set the badges an admin can grant (Developer, Artist, Influencer); badges only.
 *
 * @param {import('express').Request} req - `params.id`, `body.roles` (full list).
 * @param {import('express').Response} res - 200 `{ data: user }`, 400, 404, or 500.
 * @returns {Promise<void>}
 */
export const setCosmeticRoles = async (req, res) => {
  try {
    const data = await adminService.setCosmeticRoles(req.user, req.params.id, req.body?.roles)
    res.json({ success: true, message: `Badges updated for ${data.username}.`, data })
  } catch (error) {
    sendError(res, error, 'Error updating roles')
  }
}

export default {
  searchContent,
  getContent,
  updateContent,
  changeLink,
  reorderCast,
  setAppearanceRole,
  getLog,
  listSyncChanges,
  countSyncChanges,
  resolveSyncChanges,
  listUsers,
  setUserRole,
  muteUser,
  setBan,
  setCosmeticRoles,
}
