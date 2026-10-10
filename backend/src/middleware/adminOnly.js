/**
 * Admin and creator gates for operator-only routes (IP bans, feedback, the admin page).
 *
 * Layer: middleware. Runs after `authenticateToken`. A user is an admin when their
 * `role` is 'admin' or 'creator', or their email is in the ADMIN_EMAILS allowlist, and
 * their email is verified; the demo account, banned accounts, and new sign-ups that
 * haven't finished verification (`pendingSignup`) never are. The single
 * creator (role 'creator') is the only one who can add/remove admins and ban users.
 * ADMIN_EMAILS accounts are "owners": the admin page cannot demote them. Holders of the
 * Developer badge may edit catalog content (`contentEditorOnly`) and nothing else.
 *
 * Env: ADMIN_EMAILS (comma-separated, case-insensitive).
 */

import { isMuted } from '../utils/accountStatus.js'

/**
 * @param {string} [value]
 * @returns {Set<string>}
 */
export function parseAdminEmails(value = process.env.ADMIN_EMAILS) {
  return new Set(
    String(value || '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  )
}

/**
 * Whether the user's email is on the ADMIN_EMAILS allowlist (ignores verification).
 * @param {{ email?: string } | null | undefined} user
 * @param {Set<string>} [admins]
 * @returns {boolean}
 */
export function isOwnerEmail(user, admins = parseAdminEmails()) {
  return Boolean(user?.email) && admins.has(String(user.email).trim().toLowerCase())
}

/**
 * @param {{ email?: string, role?: string, emailVerified?: boolean, bannedAt?: unknown, isDemo?: () => boolean } | null | undefined} user
 * @param {Set<string>} [admins]
 * @returns {boolean}
 */
export function isAdminUser(user, admins = parseAdminEmails()) {
  if (!isEligible(user)) return false
  return user.role === 'admin' || user.role === 'creator' || isOwnerEmail(user, admins)
}

/**
 * The site creator: manages admins and bans users.
 * @param {{ email?: string, role?: string, emailVerified?: boolean, bannedAt?: unknown, isDemo?: () => boolean } | null | undefined} user
 * @returns {boolean}
 */
export function isCreatorUser(user) {
  return isEligible(user) && user.role === 'creator'
}

/**
 * Verified, past the pending sign-up stage, not the demo account, not banned.
 * @param {{ email?: string, emailVerified?: boolean, pendingSignup?: boolean, bannedAt?: unknown, isDemo?: () => boolean } | null | undefined} user
 * @returns {boolean}
 */
function isEligible(user) {
  if (!user?.email || user.emailVerified === false || user.pendingSignup || user.bannedAt) {
    return false
  }
  return !(typeof user.isDemo === 'function' && user.isDemo())
}

/**
 * Admins, plus unmuted holders of the Developer badge (content editing only).
 * @param {{ email?: string, role?: string, emailVerified?: boolean, bannedAt?: unknown,
 *   cosmeticRoles?: string[], mutedUntil?: unknown, isDemo?: () => boolean } | null | undefined} user
 * @param {Set<string>} [admins]
 * @returns {boolean}
 */
export function canEditContent(user, admins = parseAdminEmails()) {
  if (isAdminUser(user, admins)) return true
  if (!isEligible(user) || !(user.cosmeticRoles || []).includes('developer')) return false
  return !isMuted(user)
}

/**
 * 403 unless `req.user` is an admin.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @returns {void}
 */
export default function adminOnly(req, res, next) {
  if (isAdminUser(req.user)) return next()
  res.status(403).json({ success: false, message: 'Admin access required.' })
}

/**
 * 403 unless `req.user` is the creator.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @returns {void}
 */
export function creatorOnly(req, res, next) {
  if (isCreatorUser(req.user)) return next()
  res.status(403).json({ success: false, message: 'Only the creator can do that.' })
}

/**
 * 403 unless `req.user` can edit catalog content (admins and developers).
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @returns {void}
 */
export function contentEditorOnly(req, res, next) {
  if (canEditContent(req.user)) return next()
  res.status(403).json({ success: false, message: 'Content editing access required.' })
}
