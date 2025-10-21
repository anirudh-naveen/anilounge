import mongoose from 'mongoose'
import dotenv from 'dotenv'
import Content from '../models/Content.js'

dotenv.config()

async function findDuplicates() {
  try {
    await mongoose.connect(process.env.MONGODB_URI)
    console.log('📡 Database connected')

    // Find potential duplicates for Ne Zha
    const nezhaItems = await Content.find({
      $or: [{ title: { $regex: /nezha/i } }, { title: { $regex: /ne zha/i } }],
    }).lean()

    console.log('\n🔍 Ne Zha items:')
    nezhaItems.forEach((item) => {
      const year = item.releaseDate ? new Date(item.releaseDate).getFullYear() : 'N/A'
      console.log(
        `- ${item.title} (${year}) - ${item.contentType} - Genres: ${(item.genres || []).map((g) => g.name || g).join(', ')} - ID: ${item._id}`,
      )
    })

    // Find potential duplicates for A Silent Voice
    const silentVoiceItems = await Content.find({
      $or: [
        { title: { $regex: /silent voice/i } },
        { title: { $regex: /koe no katachi/i } },
        { title: { $regex: /a silent voice/i } },
      ],
    }).lean()

    console.log('\n🔍 A Silent Voice items:')
    silentVoiceItems.forEach((item) => {
      const year = item.releaseDate ? new Date(item.releaseDate).getFullYear() : 'N/A'
      console.log(
        `- ${item.title} (${year}) - ${item.contentType} - Genres: ${(item.genres || []).map((g) => g.name || g).join(', ')} - ID: ${item._id}`,
      )
    })

    await mongoose.disconnect()
    console.log('🔌 Database disconnected')
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

findDuplicates()
