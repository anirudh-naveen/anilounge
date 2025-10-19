import mongoose from 'mongoose'
import dotenv from 'dotenv'
import User from '../models/User.js'

// Load environment variables
dotenv.config()

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI)
    console.log('📡 Database connected')
  } catch (error) {
    console.error('❌ Database connection failed:', error.message)
    process.exit(1)
  }
}

// Clear all users
const clearUsers = async () => {
  try {
    console.log('🗑️ Clearing all user accounts...')

    // Delete all users
    const result = await User.deleteMany({})

    console.log(`✅ Deleted ${result.deletedCount} user accounts`)
  } catch (error) {
    console.error('❌ Error clearing users:', error.message)
  }
}

// Main execution
const main = async () => {
  try {
    await connectDB()
    await clearUsers()

    console.log('🎉 User clearing completed successfully!')
  } catch (error) {
    console.error('❌ Script failed:', error.message)
  } finally {
    await mongoose.disconnect()
    console.log('🔌 Database disconnected')
    process.exit(0)
  }
}

main()
