/**
 * One-off setup script: insert the recruiter demo account if it does not already exist.
 * Run once on a fresh database (or after wiping users). Inserts a User with
 * email demo@findanimation.com; no-ops when that email is present. Does not mutate Content.
 */
import { connectPostgres, closePostgres } from '../../config/postgres.js'
import User from '../models/User.js'
import dotenv from 'dotenv'

dotenv.config()

/**
 * Create demo@findanimation.com / DemoPassword123! when missing.
 * @returns {Promise<void>}
 */
const createDemoUser = async () => {
  try {
    await connectPostgres()
    console.log('Connected to PostgreSQL')

    const existingUser = await User.findOne({ email: 'demo@findanimation.com' })
    if (existingUser) {
      console.log('Demo user already exists')
      return
    }

    const demoUser = new User({
      username: 'DemoUser',
      email: 'demo@findanimation.com',
      password: 'DemoPassword123!',
      profilePicture: 'https://via.placeholder.com/150/4F46E5/FFFFFF?text=Demo',
      bio: 'Demo account for recruiters to explore Find Animation features',
      preferences: {
        favoriteGenres: ['Action', 'Adventure', 'Fantasy', 'Sci-Fi'],
        preferredLanguage: 'English',
        contentRating: 'PG-13',
      },
      isDemoAccount: true,
      createdAt: new Date(),
      lastLogin: new Date(),
    })

    await demoUser.save()
    console.log('Demo user created successfully!')
    console.log('Email: demo@findanimation.com')
    console.log('Password: DemoPassword123!')
    console.log('This account is perfect for recruiters to explore the app')
  } catch (error) {
    console.error('Error creating demo user:', error)
  } finally {
    await closePostgres()
    console.log('Disconnected from PostgreSQL')
  }
}

createDemoUser()
