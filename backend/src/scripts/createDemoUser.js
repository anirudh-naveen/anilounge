/**
 * One-off setup script: insert the recruiter demo account if it does not already exist.
 * Run once on a fresh database (or after wiping users). Inserts a User with
 * email demo@findanimation.com, or clears a lockout when it already exists.
 * The API server also runs this check on start. Does not mutate Content.
 */
import { connectPostgres, closePostgres } from '../../config/postgres.js'
import { DEMO_USER_EMAIL } from '../models/User.js'
import { DEMO_USER_PASSWORD, ensureDemoAccount } from '../services/demoAccount.js'
import dotenv from 'dotenv'

dotenv.config()

/**
 * Create demo@findanimation.com / DemoPassword123! when missing (or unlock it).
 * @returns {Promise<void>}
 */
const createDemoUser = async () => {
  try {
    await connectPostgres()
    console.log('Connected to PostgreSQL')

    const result = await ensureDemoAccount()
    console.log(`Demo user ${result === 'ok' ? 'already exists' : result}`)
    console.log(`Email: ${DEMO_USER_EMAIL}`)
    console.log(`Password: ${DEMO_USER_PASSWORD}`)
  } catch (error) {
    console.error('Error creating demo user:', error)
  } finally {
    await closePostgres()
    console.log('Disconnected from PostgreSQL')
  }
}

createDemoUser()
