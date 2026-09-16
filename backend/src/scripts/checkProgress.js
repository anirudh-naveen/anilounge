/**
 * Read-only diagnostic script: print catalog size, TMDB/MAL coverage, and the five newest rows.
 * Run during populateUnified or after a sync to watch Atlas free-tier usage (250 MB). Does not mutate Content.
 */
import mongoose from 'mongoose'
import dotenv from 'dotenv'
import Content from '../models/Content.js'

dotenv.config()

/**
 * Log totals by type/source mix, dataSize vs 250 MB, and the latest five inserts.
 * @returns {Promise<void>}
 */
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

    const stats = await mongoose.connection.db.stats()
    const sizeInMB = (stats.dataSize / (1024 * 1024)).toFixed(2)

    console.log('\nDatabase Progress Report')
    console.log('='.repeat(50))
    console.log(`Total Content: ${totalContent}`)
    console.log(`Movies: ${movies}`)
    console.log(`TV Shows: ${tvShows}`)
    console.log(`\nData Sources:`)
    console.log(`   TMDB Only: ${tmdbContent - bothContent}`)
    console.log(`   MAL Only: ${malContent - bothContent}`)
    console.log(`   Both TMDB & MAL: ${bothContent}`)
    console.log(
      `\nDatabase Size: ${sizeInMB} MB / 250 MB (${((sizeInMB / 250) * 100).toFixed(1)}% of free tier)`,
    )
    console.log('='.repeat(50))

    const latestItems = await Content.find({}).sort({ _id: -1 }).limit(5).lean()

    console.log('\nLatest 5 Items Added:')
    latestItems.forEach((item, index) => {
      const sources = []
      if (item.tmdbId) sources.push('TMDB')
      if (item.malId) sources.push('MAL')
      console.log(`${index + 1}. ${item.title} (${item.contentType}) [${sources.join(' + ')}]`)
    })

    await mongoose.disconnect()
  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  }
}

checkProgress()
