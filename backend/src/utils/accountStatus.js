/**
 * Mute and ban state for user accounts.
 *
 * Layer: utils. A muted user keeps their account but can't do anything other people
 * see (friend requests and notes, username, bio, profile picture) until `mutedUntil`.
 * A banned user can't sign in; `adminService.banUser` also ends their sessions.
 */

/** Mutes with no end are stored with this year ("until unmuted"). */
export const PERMANENT_MUTE_YEAR = 9999

/** Mute lengths offered on the admin page, in hours (null = until unmuted). */
export const MUTE_DURATIONS = { '1h': 1, '24h': 24, '7d': 24 * 7, '30d': 24 * 30, permanent: null }

/**
 * @param {{ bannedAt?: unknown } | null | undefined} user
 * @returns {boolean}
 */
export function isBanned(user) {
  return Boolean(user?.bannedAt)
}

/**
 * @param {{ mutedUntil?: unknown } | null | undefined} user
 * @param {number} [now]
 * @returns {boolean}
 */
export function isMuted(user, now = Date.now()) {
  if (!user?.mutedUntil) return false
  const until = new Date(user.mutedUntil).getTime()
  return Number.isFinite(until) && until > now
}

/**
 * End time for a mute of `duration` (a MUTE_DURATIONS key) starting at `now`.
 * @param {string} duration
 * @param {number} [now]
 * @returns {Date | null} null when the duration is unknown.
 */
export function muteEndsAt(duration, now = Date.now()) {
  if (!Object.prototype.hasOwnProperty.call(MUTE_DURATIONS, duration)) return null
  const hours = MUTE_DURATIONS[duration]
  if (hours === null) return new Date(Date.UTC(PERMANENT_MUTE_YEAR, 11, 31))
  return new Date(now + hours * 60 * 60 * 1000)
}

/**
 * User-facing explanation for a blocked action.
 * @param {{ mutedUntil?: unknown, muteReason?: string | null }} user
 * @returns {string}
 */
export function mutedMessage(user) {
  const until = new Date(user.mutedUntil)
  const when =
    until.getUTCFullYear() >= PERMANENT_MUTE_YEAR
      ? 'until a moderator lifts it'
      : `until ${until.toUTCString().replace(/:\d\d GMT$/, ' UTC')}`
  const reason = user.muteReason ? ` Reason: ${user.muteReason}` : ''
  return `Your account is muted ${when}, so you can't do that right now.${reason}`
}

export const BANNED_MESSAGE = 'This account has been banned from AniLounge.'
