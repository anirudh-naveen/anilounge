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

    // Find all potential duplicates based on similar titles
    console.log('\n🔍 Searching for potential duplicates across all content...')
    const allContent = await Content.find({}).lean()
    const titleGroups = {}

    allContent.forEach((item) => {
      // Normalize title for comparison
      const normalizedTitle = item.title
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .trim()

      if (!titleGroups[normalizedTitle]) {
        titleGroups[normalizedTitle] = []
      }
      titleGroups[normalizedTitle].push(item)
    })

    // Find groups with multiple items
    const duplicateGroups = Object.entries(titleGroups).filter(([, items]) => items.length > 1)

    if (duplicateGroups.length > 0) {
      console.log(`\n📋 Found ${duplicateGroups.length} potential duplicate groups:\n`)
      duplicateGroups.forEach(([, items]) => {
        console.log(`\n"${items[0].title}" (${items.length} items):`)
        items.forEach((item) => {
          const year = item.releaseDate ? new Date(item.releaseDate).getFullYear() : 'N/A'
          const sources = []
          if (item.tmdbId) sources.push('TMDB')
          if (item.malId) sources.push('MAL')
          console.log(
            `  - ${item.title} (${year}) [${sources.join(' + ')}] - ${item.contentType} - ID: ${item._id}`,
          )
        })
      })
    } else {
      console.log('\n✅ No duplicate titles found!')
    }

    await mongoose.disconnect()
    console.log('\n🔌 Database disconnected')
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

findDuplicates()
