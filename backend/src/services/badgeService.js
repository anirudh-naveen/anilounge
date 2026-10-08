/**
 * Badges shown on usernames and profiles, and each user's pick of emblem.
 *
 * Layer: domain service. Which badges exist lives in `utils/badges.js`; creator/admin
 * badges come from the account role (and ADMIN_EMAILS), the rest from
 * `users.cosmetic_roles`. The public list feeds the emblem next to usernames and the
 * profile Badges section.
 */

import { query } from '../../config/postgres.js'
import { parseAdminEmails } from '../middleware/adminOnly.js'
import { badgesForUser, featuredEmblem, isValidEmblemChoice } from '../utils/badges.js'
import { HttpError } from '../utils/httpError.js'

/**
 * Every account holding at least one badge. Banned, demo, and unverified accounts are
 * left out (they show no badges).
 * @returns {Promise<Array<{ id: string, username: string, badges: string[], featured: string | null, choice: string | null }>>}
 *   `featured` is the emblem to show next to the name (null = none).
 */
export async function listBadgeHolders() {
  const owners = [...parseAdminEmails()]
  const { rows } = await query(
    `SELECT id, username, role, cosmetic_roles, featured_badge,
            lower(email) = ANY($1::text[]) AS owner
     FROM users
     WHERE banned_at IS NULL AND NOT is_demo AND email_verified_at IS NOT NULL
       AND (role IN ('admin', 'creator') OR lower(email) = ANY($1::text[])
            OR cardinality(cosmetic_roles) > 0)`,
    [owners],
  )
  return rows
    .map((row) => {
      const badges = badgesForUser({
        role: row.role,
        isStaff: row.owner,
        granted: row.cosmetic_roles,
      })
      return {
        id: String(row.id),
        username: row.username,
        badges,
        featured: featuredEmblem(badges, row.featured_badge),
        // Their raw pick (null = automatic), so the owner's picker shows it.
        choice: row.featured_badge || null,
      }
    })
    .filter((row) => row.badges.length)
}

/**
 * Choose the emblem shown next to your name: a badge you hold, null for automatic
 * (your highest), or 'none'.
 * @param {object} user - `req.user`.
 * @param {unknown} choice
 * @returns {Promise<{ badges: string[], featured: string | null, choice: string | null }>}
 */
export async function setFeaturedBadge(user, choice) {
  const normalized = choice === undefined || choice === '' ? null : choice
  const owners = parseAdminEmails()
  const badges = badgesForUser({
    role: user.role,
    isStaff: owners.has(String(user.email || '').toLowerCase()),
    granted: user.cosmeticRoles,
  })
  if (!isValidEmblemChoice(badges, normalized)) {
    throw new HttpError(400, 'You can only show a badge you have.')
  }
  await query('UPDATE users SET featured_badge = $2 WHERE id = $1', [user._id, normalized])
  return { badges, featured: featuredEmblem(badges, normalized), choice: normalized }
}
