/**
 * Recruiter demo account bootstrap.
 *
 * Layer: service. Guarantees the shared demo login from the README exists and
 * is not locked, so it works on any database the API points at (including a
 * fresh local one). Called on server start and by `scripts/createDemoUser.js`.
 */

import User, { DEMO_USER_EMAIL } from '../models/User.js'

export const DEMO_USER_PASSWORD = 'DemoPassword123!'

/**
 * Create the demo user when missing; otherwise clear any lockout left on it.
 * Never changes an existing demo account's password or data.
 *
 * @returns {Promise<'created' | 'unlocked' | 'ok'>} What was done.
 */
export async function ensureDemoAccount() {
  const existing = await User.findOne({ email: DEMO_USER_EMAIL })
  if (!existing) {
    const demoUser = new User({
      username: 'DemoUser',
      email: DEMO_USER_EMAIL,
      password: DEMO_USER_PASSWORD,
      bio: 'Demo account for recruiters to explore Find Animation features',
      preferences: { favoriteGenres: ['Action', 'Adventure', 'Fantasy', 'Sci-Fi'] },
      isDemoAccount: true,
    })
    await demoUser.save()
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
