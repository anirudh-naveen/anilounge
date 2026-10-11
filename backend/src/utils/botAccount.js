/**
 * Identities of AniLounge's two bot accounts, shared by the services that act as them
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
 *
 * Neither can be blocked.
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

export const BOTS = [LOUNGE_KEEPER, LOUNGE_CLEANER]
/** Current and previous bot emails (a not-yet-moved account still counts as a bot). */
export const BOT_EMAILS = BOTS.flatMap((bot) => [bot.email, ...bot.previousEmails])

/**
 * @param {string | null | undefined} email
 * @returns {boolean}
 */
export const isBotEmail = (email) => BOT_EMAILS.includes(String(email || '').toLowerCase())
