/**
 * The bot accounts (utils/botAccount.js): created on first use and kept in step with
 * their definitions (name, bio, picture), plus the checks other services use to treat
 * them specially (never blockable; Lounge Cleaner may message anyone).
 *
 * Layer: service. A new bot gets a random password; Lounge Keeper's email is
 * undeliverable, while Lounge Cleaner's is the support mailbox, so staff can reset its
 * password to sign in.
 */

import crypto from 'node:crypto'
import { query } from '../../config/postgres.js'
import { BOT_EMAILS, LOUNGE_CLEANER, LOUNGE_KEEPER } from '../utils/botAccount.js'
import { hashPassword } from '../utils/passwordHash.js'

/** Bot key → user id, once looked up. */
const ids = new Map()

/**
 * The bot's user id, creating the account the first time and syncing its username,
 * bio, and picture after that (so a rename reaches the existing account).
 * @param {typeof LOUNGE_KEEPER} bot
 * @returns {Promise<string>}
 */
export async function ensureBot(bot) {
  if (ids.has(bot.key)) return ids.get(bot.key)
  const existing = await query('SELECT id FROM users WHERE email = $1', [bot.email])
  let id
  if (existing.rows[0]) {
    id = String(existing.rows[0].id)
    await query(
      `UPDATE users SET username = $2, bio = $3, profile_picture = $4
       WHERE id = $1 AND (username, bio, profile_picture) IS DISTINCT FROM ($2, $3, $4)`,
      [id, bot.username, bot.bio, bot.profilePicture],
    )
  } else {
    const passwordHash = await hashPassword(crypto.randomBytes(32).toString('base64url'))
    const { rows } = await query(
      `INSERT INTO users (username, email, password_hash, bio, profile_picture, email_verified_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
       RETURNING id`,
      [bot.username, bot.email, passwordHash, bot.bio, bot.profilePicture],
    )
    id = String(rows[0].id)
  }
  // Bots can't be blocked; clear any block from before that rule.
  await query('DELETE FROM user_blocks WHERE blocked_id = $1', [id])
  ids.set(bot.key, id)
  return id
}

export const ensureLoungeKeeper = () => ensureBot(LOUNGE_KEEPER)
export const ensureLoungeCleaner = () => ensureBot(LOUNGE_CLEANER)

/**
 * Create or sync both bots. Called at startup; never throws.
 * @returns {Promise<void>}
 */
export async function syncBots() {
  try {
    await Promise.all([ensureLoungeKeeper(), ensureLoungeCleaner()])
  } catch (error) {
    console.error('Bot account sync failed:', error.message)
  }
}

/**
 * Whether a user id belongs to a bot account.
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export async function isBotUser(userId) {
  const known = [...ids.values()]
  if (known.includes(String(userId))) return true
  const { rows } = await query('SELECT 1 FROM users WHERE id = $1 AND email = ANY($2::text[])', [
    userId,
    BOT_EMAILS,
  ])
  return Boolean(rows[0])
}

/**
 * Whether a user id is Lounge Cleaner (the account that may message anyone).
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export async function isLoungeCleaner(userId) {
  return String(userId) === (await ensureLoungeCleaner())
}
