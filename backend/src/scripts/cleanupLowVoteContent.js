import mongoose from 'mongoose'
import dotenv from 'dotenv'
import Content from '../models/Content.js'

dotenv.config()

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI)
    console.log('📡 Database connected')
  } catch (error) {
    console.error('❌ Database connection failed:', error.message)
    process.exit(1)
  }
}

const cleanupLowVoteContent = async () => {
  await connectDB()
  console.log('🧹 Cleaning up low-vote content...')
  
  try {
    // Find content with low vote counts
    const lowVoteContent = await Content.find({
      $or: [
        { voteCount: { $lt: 100 } },
        { voteCount: { $exists: false } }
      ]
    }).select('title voteCount voteAverage contentType')
    
    console.log(`Found ${lowVoteContent.length} items with low vote counts:`)
    lowVoteContent.forEach(item => {
      console.log(`- ${item.title} (${item.contentType}): ${item.voteCount || 0} votes, ${item.voteAverage || 'N/A'} rating`)
    })
    
    if (lowVoteContent.length > 0) {
      // Delete low-vote content
      const result = await Content.deleteMany({
        $or: [
          { voteCount: { $lt: 100 } },
          { voteCount: { $exists: false } }
        ]
      })
      
      console.log(`\n🗑️ Deleted ${result.deletedCount} low-vote content items`)
      
      // Show remaining counts
      const remainingCounts = await Content.aggregate([
        {
          $group: {
            _id: '$contentType',
            count: { $sum: 1 }
          }
        }
      ])
      
      console.log('\n📊 Remaining content by type:')
      remainingCounts.forEach(item => {
        console.log(`- ${item._id}: ${item.count} items`)
      })
    } else {
      console.log('✅ No low-vote content found to clean up')
    }
    
  } catch (error) {
    console.error('❌ Error cleaning up content:', error)
  } finally {
    await mongoose.disconnect()
    console.log('🔌 Database disconnected')
  }
}

cleanupLowVoteContent()
