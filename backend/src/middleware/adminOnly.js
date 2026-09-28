/**
 * Admin gate for operator-only routes (IP bans, feedback listing).
 *
 * Layer: middleware. Runs after `authenticateToken`. A user is an admin when their
 * email is in the ADMIN_EMAILS allowlist and verified; the demo account never is.
 * With ADMIN_EMAILS unset, nobody is an admin and these routes return 403.
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
 * @param {{ email?: string, emailVerified?: boolean, isDemo?: () => boolean } | null | undefined} user
 * @param {Set<string>} [admins]
 * @returns {boolean}
 */
export function isAdminUser(user, admins = parseAdminEmails()) {
  if (!user?.email || user.emailVerified === false) return false
  if (typeof user.isDemo === 'function' && user.isDemo()) return false
  return admins.has(String(user.email).trim().toLowerCase())
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
