/**
 * One-off maintenance script: merge two known duplicate pairs and delete the extras.
 * Run after confirming IDs with findDuplicates.js. Mutates Content: copies dataSources onto
 * the first match, keeps the higher unifiedScore, then deletes the second document.
 * Limited to Ne Zha (exact title) and A Silent Voice / Koe no Katachi.
 */
import mongoose from 'mongoose'
import dotenv from 'dotenv'
import Content from '../models/Content.js'

dotenv.config()

/**
 * For each known pair, keep the first document, overlay TMDB/MAL provenance, then delete the second.
 * Silent Voice also copies the discarded title into alternativeTitles.
 * @returns {Promise<void>}
 */
async function mergeDuplicates() {
  try {
    await mongoose.connect(process.env.MONGODB_URI)
    console.log('Database connected')

    console.log('\nMerging Ne Zha duplicates...')
    const nezhaItems = await Content.find({
      $or: [{ title: { $regex: /^nezha$/i } }, { title: { $regex: /^ne zha$/i } }],
    }).lean()

    if (nezhaItems.length > 1) {
      const primary = await Content.findById(nezhaItems[0]._id)
      const secondary = await Content.findById(nezhaItems[1]._id)

      if (primary && secondary) {
        const tmdbData = primary.dataSources?.tmdb || secondary.dataSources?.tmdb
        const malData = primary.dataSources?.mal || secondary.dataSources?.mal

        if (tmdbData || malData) {
          primary.dataSources = {}
          if (tmdbData) primary.dataSources.tmdb = tmdbData
          if (malData) primary.dataSources.mal = malData
        }

        if (secondary.unifiedScore > primary.unifiedScore) {
          primary.unifiedScore = secondary.unifiedScore
          primary.voteCount = secondary.voteCount
        }

        await primary.save()
        console.log(`Merged Ne Zha data into: ${primary.title}`)

        await Content.findByIdAndDelete(secondary._id)
        console.log(`Deleted duplicate: ${secondary.title}`)
      }
    }

    console.log('\nMerging A Silent Voice duplicates...')
    const silentVoiceItems = await Content.find({
      $or: [{ title: { $regex: /silent voice/i } }, { title: { $regex: /koe no katachi/i } }],
    }).lean()

    if (silentVoiceItems.length > 1) {
      const primary = await Content.findById(silentVoiceItems[0]._id)
      const secondary = await Content.findById(silentVoiceItems[1]._id)

      if (primary && secondary) {
        const tmdbData = primary.dataSources?.tmdb || secondary.dataSources?.tmdb
        const malData = primary.dataSources?.mal || secondary.dataSources?.mal

        if (tmdbData || malData) {
          primary.dataSources = {}
          if (tmdbData) primary.dataSources.tmdb = tmdbData
          if (malData) primary.dataSources.mal = malData
        }

        if (secondary.unifiedScore > primary.unifiedScore) {
          primary.unifiedScore = secondary.unifiedScore
          primary.voteCount = secondary.voteCount
        }

        if (!primary.alternativeTitles) primary.alternativeTitles = []
        if (secondary.title && !primary.alternativeTitles.includes(secondary.title)) {
          primary.alternativeTitles.push(secondary.title)
        }

        await primary.save()
        console.log(`Merged A Silent Voice data into: ${primary.title}`)

        await Content.findByIdAndDelete(secondary._id)
        console.log(`Deleted duplicate: ${secondary.title}`)
      }
    }

    await mongoose.disconnect()
    console.log('Database disconnected')
  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  }
}

mergeDuplicates()
