/**
 * Admin gate for operator-only routes (IP bans, feedback, the admin page).
 *
 * Layer: middleware. Runs after `authenticateToken`. A user is an admin when their
 * `role` is 'admin' or their email is in the ADMIN_EMAILS allowlist, and their email
 * is verified; the demo account never is. ADMIN_EMAILS accounts are "owners": the
 * admin page cannot demote them, so the site always has a way back in.
 *
 * Env: ADMIN_EMAILS (comma-separated, case-insensitive).
 */

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
 * @param {{ email?: string, role?: string, emailVerified?: boolean, isDemo?: () => boolean } | null | undefined} user
 * @param {Set<string>} [admins]
 * @returns {boolean}
 */
export function isAdminUser(user, admins = parseAdminEmails()) {
  if (!user?.email || user.emailVerified === false) return false
  if (typeof user.isDemo === 'function' && user.isDemo()) return false
  return user.role === 'admin' || isOwnerEmail(user, admins)
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
