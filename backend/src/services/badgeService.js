/**
 * Badges shown on profiles and as avatar frames.
 *
 * Layer: domain service. Which badges exist lives in `utils/badges.js`; creator/admin
 * badges come from the account role (and ADMIN_EMAILS), the bot badge from the bot
 * accounts' emails (`utils/botAccount.js`), the rest from
 * `users.cosmetic_roles`. Influencer is also stored automatically once someone's forum
 * activity reaches the weekly bar (`grantInfluencerIfEarned`). The public list feeds avatar frames and the profile
 * Badges section.
 */

import { query } from '../../config/postgres.js'
import { parseAdminEmails } from '../middleware/adminOnly.js'
import {
  avatarFrame,
  badgesForUser,
  earnsInfluencer,
} from '../utils/badges.js'
import { BOT_EMAILS } from '../utils/botAccount.js'
import { normalizeAccent } from '../utils/profileSettings.js'
import { logAction } from './adminLog.js'

/**
 * Every account whose avatar frame isn't the silver default: badge holders and anyone who
 * picked a profile accent. Everyone missing from the list wears the plain silver User
 * ring. Banned, demo, and unverified accounts are left out.
 * @returns {Promise<Array<{ id: string, username: string, badges: string[], frame: string, accent: string | null }>>}
 *   `frame` is a badge id or 'user' (the plain ring); `accent` tints it (null = silver).
 */
export async function listBadgeHolders() {
  const owners = [...parseAdminEmails()]
  const { rows } = await query(
    `SELECT id, username, role, cosmetic_roles,
            to_jsonb(users) #>> '{profile_settings,accent}' AS accent,
            to_jsonb(users) #>> '{profile_settings,frame}' AS frame,
            lower(email) = ANY($1::text[]) AS owner, email = ANY($2::text[]) AS bot
     FROM users
     WHERE banned_at IS NULL AND NOT is_demo AND email_verified_at IS NOT NULL
       AND (role IN ('admin', 'creator') OR lower(email) = ANY($1::text[])
            OR cardinality(cosmetic_roles) > 0 OR email = ANY($2::text[])
            OR to_jsonb(users) #>> '{profile_settings,accent}' IS NOT NULL)`,
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
        frame: avatarFrame(badges, row.frame),
        accent: normalizeAccent(row.accent),
      }
    })
    .filter((row) => row.badges.length || row.accent)
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
