/**
 * Badge registry: every badge a user can hold, in display order.
 *
 * Layer: utils (pure). `creator` and `admin` come from the account role; the rest are
 * granted (stored in `users.cosmetic_roles`); `supporter` is also granted automatically
 * for a Ko-fi donation (services/donationService.js). `emblem` badges can be picked as the one
 * emblem shown next to the username; emblem-less badges only appear in the profile's
 * Badges section. `grantable` badges are the ones admins hand out from the admin page.
 * Keep in step with the frontend copy in `src/utils/badges.ts`.
 */

/** @type {Array<{ id: string, emblem: boolean, grantable: boolean }>} */
export const BADGES = [
  { id: 'creator', emblem: true, grantable: false },
  { id: 'admin', emblem: true, grantable: false },
  { id: 'developer', emblem: true, grantable: true },
  { id: 'artist', emblem: true, grantable: true },
  { id: 'influencer', emblem: true, grantable: true },
  { id: 'supporter', emblem: true, grantable: true },
]

const BY_ID = new Map(BADGES.map((badge) => [badge.id, badge]))
export const GRANTABLE_BADGES = BADGES.filter((badge) => badge.grantable).map((badge) => badge.id)
/** `featured_badge` value meaning "show no emblem". */
export const NO_EMBLEM = 'none'

/**
 * Badges a user holds, in registry order.
 * @param {{ role?: string | null, isStaff?: boolean, granted?: string[] | null }} user -
 *   `isStaff` is true for admins by role or ADMIN_EMAILS.
 * @returns {string[]}
 */
export function badgesForUser({ role, isStaff = false, granted = [] }) {
  const held = new Set((granted || []).filter((id) => BY_ID.get(id)?.grantable))
  if (role === 'creator') held.add('creator')
  else if (isStaff || role === 'admin') held.add('admin')
  return BADGES.map((badge) => badge.id).filter((id) => held.has(id))
}

/**
 * The emblem shown next to the name: the user's pick when they still hold it,
 * nothing when they chose none, else their highest emblem badge.
 * @param {string[]} badges - From `badgesForUser`.
 * @param {string | null | undefined} featured - `users.featured_badge`.
 * @returns {string | null}
 */
export function featuredEmblem(badges, featured) {
  if (featured === NO_EMBLEM) return null
  if (featured && badges.includes(featured) && BY_ID.get(featured)?.emblem) return featured
  return badges.find((id) => BY_ID.get(id)?.emblem) || null
}

/**
 * Whether `choice` is a valid emblem pick for someone holding `badges`
 * (null = automatic, 'none' = hide).
 * @param {string[]} badges
 * @param {unknown} choice
 * @returns {boolean}
 */
export function isValidEmblemChoice(badges, choice) {
  if (choice === null || choice === NO_EMBLEM) return true
  return typeof choice === 'string' && badges.includes(choice) && Boolean(BY_ID.get(choice)?.emblem)
}
