/**
 * Make one account the site creator (the only role that can add/remove admins and
 * ban users). There is at most one creator; a previous creator becomes an admin.
 * Layer: CLI script. The admin page can never grant this role.
 *
 * Usage: DATABASE_URL=... npm run role:creator -- you@example.com
 */

import path from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'
import dotenv from 'dotenv'
import { sslForDatabaseUrl } from '../../config/postgres.js'

dotenv.config()

/**
 * Promote the account with the given email to creator.
 * @param {string} email
 * @returns {Promise<void>}
 */
async function setCreator(email) {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    console.error('DATABASE_URL is not set')
    process.exit(1)
  }
  if (!email || !email.includes('@')) {
    console.error('Usage: npm run role:creator -- you@example.com')
    process.exit(1)
  }

  const client = new pg.Client({ connectionString, ssl: sslForDatabaseUrl(connectionString) })
  await client.connect()
  try {
    const { rows } = await client.query(
      `SELECT id, username, email_verified_at, banned_at, is_demo FROM users
       WHERE lower(email) = lower($1)`,
      [email.trim()],
    )
    const user = rows[0]
    if (!user) throw new Error(`No account with email ${email}`)
    if (user.is_demo) throw new Error('The demo account cannot be the creator')
    if (!user.email_verified_at) throw new Error('Verify this account\'s email first')
    if (user.banned_at) throw new Error('This account is banned')

    await client.query('BEGIN')
    const previous = await client.query(
      `UPDATE users SET role = 'admin' WHERE role = 'creator' AND id <> $1 RETURNING username`,
      [user.id],
    )
    await client.query(
      `UPDATE users SET role = 'creator', muted_until = NULL, mute_reason = NULL WHERE id = $1`,
      [user.id],
    )
    await client.query('COMMIT')
    for (const row of previous.rows) console.log(`${row.username} is now an admin (was creator).`)
    console.log(`${user.username} is now the creator.`)
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('Could not set creator:', error.message)
    process.exitCode = 1
  } finally {
    await client.end()
  }
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirectRun) {
  setCreator(process.argv[2])
}
