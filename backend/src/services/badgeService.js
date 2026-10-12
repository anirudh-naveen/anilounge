/**
 * Badges shown on usernames and profiles, and each user's pick of emblem.
 *
 * Layer: domain service. Which badges exist lives in `utils/badges.js`; creator/admin
 * badges come from the account role (and ADMIN_EMAILS), the bot badge from the bot
 * accounts' emails (`utils/botAccount.js`), the rest from
 * `users.cosmetic_roles`. Influencer is also stored automatically once someone's forum
 * activity reaches the weekly bar (`grantInfluencerIfEarned`). The public list feeds the emblem next to usernames and the
 * profile Badges section.
 */

import { query } from '../../config/postgres.js'
import { parseAdminEmails } from '../middleware/adminOnly.js'
import {
  badgesForUser,
  earnsInfluencer,
  featuredEmblem,
  isValidEmblemChoice,
} from '../utils/badges.js'
import { BOT_EMAILS, isBotEmail } from '../utils/botAccount.js'
import { HttpError } from '../utils/httpError.js'
import { logAction } from './adminLog.js'

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
            lower(email) = ANY($1::text[]) AS owner, email = ANY($2::text[]) AS bot
     FROM users
     WHERE banned_at IS NULL AND NOT is_demo AND email_verified_at IS NOT NULL
       AND (role IN ('admin', 'creator') OR lower(email) = ANY($1::text[])
            OR cardinality(cosmetic_roles) > 0 OR email = ANY($2::text[]))`,
    [owners, BOT_EMAILS],
  )
  return rows
    .map((row) => {
      const badges = badgesForUser({
        role: row.role,
        isStaff: row.owner,
        isBot: row.bot,
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
    isBot: isBotEmail(user.email),
    granted: user.cosmeticRoles,
  })
  if (!isValidEmblemChoice(badges, normalized)) {
    throw new HttpError(400, 'You can only show a badge you have.')
  }
  await query('UPDATE users SET featured_badge = $2 WHERE id = $1', [user._id, normalized])
  return { badges, featured: featuredEmblem(badges, normalized), choice: normalized }
}

/**
 * Give the Influencer badge once someone's posts or comments over the last 7 days reach
 * the weekly bar (utils/badges.js). Called after each new post and comment; kept after
 * that (an admin can take it back). Never throws.
 * @param {{ _id: unknown, username: string }} user
 * @returns {Promise<boolean>} Whether the badge was just given.
 */
export async function grantInfluencerIfEarned(user) {
  try {
    const { rows } = await query(
      `SELECT NOT ('influencer' = ANY (u.cosmetic_roles)) AS missing,
              (SELECT count(*)::int FROM posts
               WHERE user_id = u.id AND created_at > now() - interval '7 days') AS posts,
              (SELECT count(*)::int FROM comments
               WHERE user_id = u.id AND deleted_at IS NULL
                 AND created_at > now() - interval '7 days') AS comments
       FROM users u WHERE u.id = $1`,
      [user._id],
    )
    const week = rows[0]
    if (!week?.missing || !earnsInfluencer(week)) return false
    const { rowCount } = await query(
      `UPDATE users SET cosmetic_roles = array_append(cosmetic_roles, 'influencer')
       WHERE id = $1 AND NOT ('influencer' = ANY (cosmetic_roles))`,
      [user._id],
    )
    if (rowCount) {
      await logAction(
        'moderation',
        null,
        `Influencer badge for "${user.username}" (${week.posts} posts, ${week.comments} comments this week)`,
      )
    }
    return rowCount > 0
  } catch (error) {
    console.error('Influencer badge check failed:', error.message)
    return false
  }
}
