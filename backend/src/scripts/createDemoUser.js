import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import User from '../models/User.js'
import dotenv from 'dotenv'

dotenv.config()

const createDemoUser = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/findanimation')
    console.log('Connected to MongoDB')

    // Check if demo user already exists
    const existingUser = await User.findOne({ email: 'demo@findanimation.com' })
    if (existingUser) {
      console.log('Demo user already exists')
      return
    }

    // Create demo user
    const hashedPassword = await bcrypt.hash('DemoPassword123!', 12)

    const demoUser = new User({
      username: 'DemoUser',
      email: 'demo@findanimation.com',
      password: hashedPassword,
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
    console.log('✅ Demo user created successfully!')
    console.log('📧 Email: demo@findanimation.com')
    console.log('🔑 Password: DemoPassword123!')
    console.log('🎯 This account is perfect for recruiters to explore the app')
  } catch (error) {
    console.error('❌ Error creating demo user:', error)
  } finally {
    await mongoose.disconnect()
    console.log('Disconnected from MongoDB')
  }
}

createDemoUser()
