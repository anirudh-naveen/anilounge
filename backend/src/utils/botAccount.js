/**
 * Identities of AniLounge's bot accounts, shared by the services that act as them
 * and the badge service (only these accounts wear the Bot badge).
 *
 * Layer: utils (pure constants). Each bot is found by its email (or a `previousEmails`
 * entry, which is then moved to the new one), so a rename here carries over to the
 * existing account (services/botAccountService.js).
 *
 * - Lounge Keeper opens release megathreads and signs site news. Its email is the
 *   notify@ sending address.
 * - Lounge Cleaner sends moderation notices to inboxes and can message anyone. Its
 *   email is the support mailbox, so staff sign in as it (via password reset) to
 *   contact people.
 * - Lounge Guide is the face of the AI assistant and the sample user in the signed-out
 *   home feed. Its email is a plus address on the support mailbox (emails are unique per
 *   account, and support@ itself is Lounge Cleaner's), so resets still land in support@.
 *
 * None can be blocked.
 */

/** Live-site logo, so the picture loads from every environment. */
const BOT_PICTURE = 'https://www.anilounge.net/anilounge-logo.png'

export const LOUNGE_KEEPER = Object.freeze({
  key: 'keeper',
  username: 'Lounge Keeper',
  email: 'notify@anilounge.net',
  /** Its email before; the account is moved to `email` on the next sync. */
  previousEmails: ['release-bot@anilounge.invalid'],
  bio: 'I post site news and open a discussion megathread whenever a new episode or movie comes out.',
  profilePicture: BOT_PICTURE,
})

export const LOUNGE_CLEANER = Object.freeze({
  key: 'cleaner',
  username: 'Lounge Cleaner',
  email: 'support@anilounge.net',
  previousEmails: [],
  bio: 'I keep the lounge tidy: moderation notices come from me. Message me if you need help.',
  profilePicture: BOT_PICTURE,
})

export const LOUNGE_GUIDE = Object.freeze({
  key: 'guide',
  username: 'Lounge Guide',
  email: 'support+guide@anilounge.net',
  previousEmails: [],
  bio: "I'm the AniLounge AI assistant. Ask me for recommendations, studios, voice actors, or genres from the search page.",
  profilePicture: BOT_PICTURE,
})

export const BOTS = [LOUNGE_KEEPER, LOUNGE_CLEANER, LOUNGE_GUIDE]
/** Current and previous bot emails (a not-yet-moved account still counts as a bot). */
export const BOT_EMAILS = BOTS.flatMap((bot) => [bot.email, ...bot.previousEmails])

/**
 * @param {string | null | undefined} email
 * @returns {boolean}
 */
export const isBotEmail = (email) => BOT_EMAILS.includes(String(email || '').toLowerCase())
