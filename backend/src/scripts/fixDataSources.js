import mongoose from 'mongoose'
import dotenv from 'dotenv'
import Content from '../models/Content.js'

// Load environment variables
dotenv.config()

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI)
    console.log('✅ MongoDB connected successfully')
  } catch (error) {
    console.error('❌ MongoDB connection error:', error)
    process.exit(1)
  }
}

const fixDataSources = async () => {
  try {
    console.log('🔧 Starting to fix dataSources tracking...')

    // Find content that has TMDB data but incorrect dataSources tracking
    const contentWithTmdbData = await Content.find({
      tmdbId: { $exists: true },
      voteAverage: { $exists: true },
      voteCount: { $exists: true },
      $or: [
        { 'dataSources.tmdb.hasData': { $ne: true } },
        { 'dataSources.tmdb': { $exists: false } },
      ],
    })

    console.log(
      `📊 Found ${contentWithTmdbData.length} items with TMDB data but incorrect dataSources tracking`,
    )

    let fixed = 0
    for (const item of contentWithTmdbData) {
      // Initialize dataSources if it doesn't exist
      if (!item.dataSources) {
        item.dataSources = {}
      }

      // Set TMDB data source
      item.dataSources.tmdb = {
        hasData: true,
        lastUpdated: new Date(),
      }

      await item.save()
      fixed++
      console.log(`✅ Fixed dataSources for: ${item.title}`)
    }

    console.log(`🎉 Successfully fixed dataSources for ${fixed} items`)

    // Verify the fix
    const stillBroken = await Content.countDocuments({
      tmdbId: { $exists: true },
      voteAverage: { $exists: true },
      voteCount: { $exists: true },
      $or: [
        { 'dataSources.tmdb.hasData': { $ne: true } },
        { 'dataSources.tmdb': { $exists: false } },
      ],
    })

    console.log(`📊 Items still with incorrect TMDB dataSources: ${stillBroken}`)
  } catch (error) {
    console.error('❌ Error fixing dataSources:', error)
  }
}

const main = async () => {
  await connectDB()
  await fixDataSources()

  console.log('🏁 DataSources fix completed')
  process.exit(0)
}

main().catch((error) => {
  console.error('💥 Script failed:', error)
  process.exit(1)
})
