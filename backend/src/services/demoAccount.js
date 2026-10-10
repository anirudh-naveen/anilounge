/**
 * Shared demo account: bootstrap and nightly reset.
 *
 * Layer: service. Guarantees the public demo login from the README exists and is not
 * locked, so it works on any database the API points at (including a fresh local one).
 * Called on server start and by `scripts/createDemoUser.js`.
 *
 * Anyone can sign in as the demo, so it can't post, message, add friends, or change
 * its name, password, avatar, bio, or headline (see `assertNotDemo` and the auth and
 * profile controllers). What it can change (watchlist, ratings, favorites, settings)
 * is put back every night from the baseline saved by `npm run demo:snapshot`, or
 * cleared when no baseline exists.
 */

import cron from 'node-cron'
import { query, withTransaction } from '../../config/postgres.js'
import User, { DEMO_USER_EMAIL } from '../models/User.js'
import { withJobLock } from '../utils/jobLock.js'

export const DEMO_USER_PASSWORD = 'DemoPassword123!'
export const DEMO_BIO = 'Shared demo account. Anything changed here resets every night.'

/** Rows the demo can write; saved in the baseline and restored nightly. */
const RESTORED_TABLES = ['watchlist', 'watch_events', 'ratings', 'favorites']
/** Rows the demo can leave behind; cleared nightly. */
const CLEARED_TABLES = [
  'watchlist_import_conflicts',
  'watchlist_import_jobs',
  'account_connections',
  'notifications',
  'language_warnings',
  'post_likes',
  'comment_likes',
]
/** User columns the demo can change; restored from the baseline. */
const PROFILE_COLUMNS = [
  'bio',
  'preferences',
  'profile_settings',
  'featured_badge',
  'allow_profanity',
  'announcement_emails',
  'friend_request_emails',
  'watchlist_imported_at',
]

/**
 * Create the demo user when missing; otherwise clear any lockout left on it.
 * Never changes an existing demo account's password or data.
 *
 * @returns {Promise<'created' | 'unlocked' | 'ok'>} What was done.
 */
export async function ensureDemoAccount() {
  const existing = await User.findOne({ email: DEMO_USER_EMAIL })
  // Login skips verification for the demo account; keep the row consistent anyway.
  if (existing && !existing.emailVerified) {
    await query('UPDATE users SET email_verified_at = now() WHERE id = $1', [existing._id])
  }
  if (!existing) {
    const demoUser = new User({
      username: 'DemoUser',
      email: DEMO_USER_EMAIL,
      password: DEMO_USER_PASSWORD,
      bio: DEMO_BIO,
      preferences: { favoriteGenres: ['Action', 'Adventure', 'Fantasy', 'Sci-Fi'] },
      isDemoAccount: true,
    })
    await demoUser.save()
    await query('UPDATE users SET email_verified_at = now() WHERE id = $1', [demoUser._id]).catch(
      () => {}, // Column may not exist before `npm run db:schema`.
    )
    return 'created'
  }

  if (existing.failedLoginAttempts || existing.lockUntil || !existing.isDemoAccount) {
    existing.failedLoginAttempts = 0
    existing.lockUntil = null
    existing.isDemoAccount = true
    await existing.save()
    return 'unlocked'
  }
  return 'ok'
}

/**
 * The demo user's id, or null when it doesn't exist.
 * @returns {Promise<string | null>}
 */
async function demoUserId() {
  const { rows } = await query('SELECT id FROM users WHERE email = $1', [DEMO_USER_EMAIL])
  return rows[0]?.id || null
}

/**
 * Save the demo's current watchlist, ratings, favorites, and profile as the baseline
 * the nightly reset restores.
 * @returns {Promise<Record<string, number> | null>} Rows saved per table; null without a demo user.
 */
export async function snapshotDemoAccount() {
  const userId = await demoUserId()
  if (!userId) return null
  const tables = RESTORED_TABLES.map(
    (table) =>
      `'${table}', (SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM ${table} t WHERE t.user_id = $1)`,
  ).join(',\n')
  const profile = PROFILE_COLUMNS.map((column) => `'${column}', u.${column}`).join(', ')
  const { rows } = await query(
    `INSERT INTO demo_snapshot (id, data, taken_at)
     SELECT 1, jsonb_build_object(${tables},
       'profile', (SELECT jsonb_build_object(${profile}) FROM users u WHERE u.id = $1)), now()
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, taken_at = EXCLUDED.taken_at
     RETURNING data`,
    [userId],
  )
  return Object.fromEntries(RESTORED_TABLES.map((table) => [table, rows[0].data[table].length]))
}

/**
 * Put the demo account back to its baseline (or empty, with the default bio, when no
 * baseline was saved). Titles deleted from the catalog since the snapshot are skipped.
 * @returns {Promise<'reset' | 'missing'>}
 */
export async function resetDemoAccount() {
  const userId = await demoUserId()
  if (!userId) return 'missing'
  const { rows } = await query('SELECT data FROM demo_snapshot WHERE id = 1')
  const baseline = rows[0]?.data || null
  await withTransaction(async () => {
    for (const table of CLEARED_TABLES) {
      await query(`DELETE FROM ${table} WHERE user_id = $1`, [userId])
    }
    await query('DELETE FROM forum_reports WHERE reporter_id = $1', [userId])
    for (const table of RESTORED_TABLES) {
      await query(`DELETE FROM ${table} WHERE user_id = $1`, [userId])
      if (!baseline?.[table]?.length) continue
      await query(
        `INSERT INTO ${table}
         SELECT r.* FROM jsonb_populate_recordset(NULL::${table}, $2::jsonb) r
         WHERE r.user_id = $1 AND EXISTS (SELECT 1 FROM content c WHERE c.id = r.content_id)`,
        [userId, JSON.stringify(baseline[table])],
      )
    }
    const profile = baseline?.profile
    if (profile) {
      const sets = PROFILE_COLUMNS.map(
        (column) => `${column} = (jsonb_populate_record(NULL::users, $2::jsonb)).${column}`,
      ).join(', ')
      await query(`UPDATE users SET ${sets} WHERE id = $1`, [userId, JSON.stringify(profile)])
    } else {
      await query(
        `UPDATE users SET bio = $2, profile_settings = '{}'::jsonb, featured_badge = NULL,
                allow_profanity = false, watchlist_imported_at = NULL
         WHERE id = $1`,
        [userId, DEMO_BIO],
      )
    }
  })
  return 'reset'
}

/**
 * Reset the demo account daily at 04:20 UTC on one instance.
 * @returns {import('node-cron').ScheduledTask}
 */
export function startDemoResetScheduler() {
  return cron.schedule(
    '20 4 * * *',
    () => {
      withJobLock('demo-reset', resetDemoAccount, { minIntervalMs: 60 * 60_000 }).catch((error) =>
        console.error('Demo account reset failed:', error.message),
      )
    },
    { timezone: 'UTC' },
  )
}
