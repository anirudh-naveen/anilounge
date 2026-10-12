/**
 * Badge registry: every badge a user can hold, highest first (display order, and the
 * automatic avatar frame is the highest held).
 *
 * Layer: utils (pure). `creator` comes from the account role; `admin` IS admin access
 * (role 'admin', ADMIN_EMAILS, or the creator): the admin page's Admin badge toggle sets
 * the role (creator only), so it is never stored as a granted badge; `bot` is
 * worn only by the bot accounts (and is their only badge); the rest are
 * granted (stored in `users.cosmetic_roles`); `supporter` is also granted automatically
 * for a Ko-fi donation (services/donationService.js), and `influencer` for forum activity
 * (`earnsInfluencer`, services/badgeService.js). `emblem` badges have an avatar frame
 * (`avatarFrame`); emblem-less badges only appear in the profile's Badges section. `grantable` badges are the ones admins hand out from the admin page.
 * Keep in step with the frontend copy in `src/utils/badges.ts`.
 */

/** @type {Array<{ id: string, emblem: boolean, grantable: boolean }>} */
export const BADGES = [
  { id: 'creator', emblem: true, grantable: false },
  { id: 'bot', emblem: true, grantable: false },
  { id: 'admin', emblem: true, grantable: false },
  { id: 'developer', emblem: true, grantable: true },
  { id: 'supporter', emblem: true, grantable: true },
  { id: 'artist', emblem: true, grantable: true },
  { id: 'influencer', emblem: true, grantable: true },
]

const BY_ID = new Map(BADGES.map((badge) => [badge.id, badge]))
export const GRANTABLE_BADGES = BADGES.filter((badge) => badge.grantable).map((badge) => badge.id)
/** The plain ring frame every user can wear (`profile_settings.frame`). */
export const USER_FRAME = 'user'

/** Forum activity over the last 7 days that earns the Influencer badge (either one). */
export const INFLUENCER_WEEKLY_POSTS = 5
export const INFLUENCER_WEEKLY_COMMENTS = 10

/**
 * Whether a week of forum activity earns the Influencer badge.
 * @param {{ posts: number, comments: number }} week - Posts and comments in the last 7 days.
 * @returns {boolean}
 */
export const earnsInfluencer = ({ posts, comments }) =>
  posts >= INFLUENCER_WEEKLY_POSTS || comments >= INFLUENCER_WEEKLY_COMMENTS

/**
 * Badges a user holds, in registry order.
 * @param {{ role?: string | null, isStaff?: boolean, isBot?: boolean, granted?: string[] | null }} user -
 *   `isStaff` is true for admins by role or ADMIN_EMAILS; `isBot` for the bot accounts.
 * @returns {string[]}
 */
export function badgesForUser({ role, isStaff = false, isBot = false, granted = [] }) {
  if (isBot) return ['bot']
  const held = new Set((granted || []).filter((id) => BY_ID.get(id)?.grantable))
  if (role === 'creator') held.add('creator')
  if (role === 'creator' || isStaff || role === 'admin') held.add('admin')
  return BADGES.map((badge) => badge.id).filter((id) => held.has(id))
}

/**
 * The frame around the avatar. Automatic (no pick) is their highest emblem badge, or the
 * plain User ring with none. A picked badge they no longer hold (an admin took it back,
 * say) falls back to the User ring, as does the old 'none'.
 * @param {string[]} badges - From `badgesForUser`.
 * @param {string | null | undefined} frame - `profile_settings.frame`.
 * @returns {string}
 */
export function avatarFrame(badges, frame) {
  if (!frame) return badges.find((id) => BY_ID.get(id)?.emblem) || USER_FRAME
  if (badges.includes(frame) && BY_ID.get(frame)?.emblem) return frame
  return USER_FRAME
}
