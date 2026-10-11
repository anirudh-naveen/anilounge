/**
 * Identities of AniLounge's two bot accounts, shared by the services that act as them
 * and the badge service (only these accounts wear the Bot badge).
 *
 * Layer: utils (pure constants). Each bot is found by its email, so a rename here
 * carries over to the existing account (services/botAccountService.js).
 *
 * - Lounge Keeper opens release megathreads and signs site news. Its email is
 *   undeliverable, so nobody can sign in as it.
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
  email: 'release-bot@anilounge.invalid',
  bio: 'I post site news and open a discussion megathread whenever a new episode or movie comes out.',
  profilePicture: BOT_PICTURE,
})

export const LOUNGE_CLEANER = Object.freeze({
  key: 'cleaner',
  username: 'Lounge Cleaner',
  email: 'support@anilounge.net',
  bio: 'I keep the lounge tidy: moderation notices come from me. Message me if you need help.',
  profilePicture: BOT_PICTURE,
})

export const BOTS = [LOUNGE_KEEPER, LOUNGE_CLEANER]
export const BOT_EMAILS = BOTS.map((bot) => bot.email)

/**
 * @param {string | null | undefined} email
 * @returns {boolean}
 */
export const isBotEmail = (email) => BOT_EMAILS.includes(String(email || '').toLowerCase())
