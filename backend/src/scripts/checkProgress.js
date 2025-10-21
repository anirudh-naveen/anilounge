import mongoose from 'mongoose'
import dotenv from 'dotenv'
import Content from '../models/Content.js'

dotenv.config()

async function checkProgress() {
  try {
    await mongoose.connect(process.env.MONGODB_URI)

    const totalContent = await Content.countDocuments()
    const tmdbContent = await Content.countDocuments({ tmdbId: { $ne: null } })
    const malContent = await Content.countDocuments({ malId: { $ne: null } })
    const bothContent = await Content.countDocuments({
      tmdbId: { $ne: null },
      malId: { $ne: null },
    })

    const movies = await Content.countDocuments({ contentType: 'movie' })
    const tvShows = await Content.countDocuments({ contentType: 'tv' })

    // Get database size
    const stats = await mongoose.connection.db.stats()
    const sizeInMB = (stats.dataSize / (1024 * 1024)).toFixed(2)

    console.log('\n📊 Database Progress Report')
    console.log('='.repeat(50))
    console.log(`📦 Total Content: ${totalContent}`)
    console.log(`🎬 Movies: ${movies}`)
    console.log(`📺 TV Shows: ${tvShows}`)
    console.log(`\n🔗 Data Sources:`)
    console.log(`   TMDB Only: ${tmdbContent - bothContent}`)
    console.log(`   MAL Only: ${malContent - bothContent}`)
    console.log(`   Both TMDB & MAL: ${bothContent}`)
    console.log(
      `\n💾 Database Size: ${sizeInMB} MB / 250 MB (${((sizeInMB / 250) * 100).toFixed(1)}% of free tier)`,
    )
    console.log('='.repeat(50))

    // Show latest 5 items added
    const latestItems = await Content.find({}).sort({ _id: -1 }).limit(5).lean()

    console.log('\n🆕 Latest 5 Items Added:')
    latestItems.forEach((item, index) => {
      const sources = []
      if (item.tmdbId) sources.push('TMDB')
      if (item.malId) sources.push('MAL')
      console.log(`${index + 1}. ${item.title} (${item.contentType}) [${sources.join(' + ')}]`)
    })

    await mongoose.disconnect()
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

checkProgress()
