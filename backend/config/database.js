/**
 * MongoDB connection bootstrap for the API process.
 *
 * Layer: config. Opens a mongoose pool from `MONGODB_URI` and decides whether
 * a failed connect is fatal (production) or a warning (development).
 */

import mongoose from 'mongoose'
import dotenv from 'dotenv'

dotenv.config()

/**
 * Connect mongoose using `MONGODB_URI`, or local `find-animation` if unset.
 * Production `process.exit(1)`s on failure; development logs and continues
 * so the HTTP server can still bind.
 *
 * @returns {Promise<void>} Resolves after connect or after a non-fatal failure.
 */
const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/find-animation'
    
    const conn = await mongoose.connect(mongoUri, {
      maxPoolSize: 10, // Maximum number of connections
      minPoolSize: 2, // Minimum number of connections
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    })
    console.log(`MongoDB Connected: ${conn.connection.host}`)
  } catch (error) {
    console.error('Database connection error:', error.message)
    // In development, warn but don't exit - server can still start
    if (process.env.NODE_ENV === 'production') {
      console.error('Exiting due to database connection failure in production')
      process.exit(1)
    } else {
      console.warn('Server will continue without database connection (development mode)')
      console.warn('Some features may not work until database is connected')
    }
  }
}

export default connectDB
