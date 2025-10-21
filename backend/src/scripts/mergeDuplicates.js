import mongoose from 'mongoose'
import dotenv from 'dotenv'
import Content from '../models/Content.js'

dotenv.config()

async function mergeDuplicates() {
  try {
    await mongoose.connect(process.env.MONGODB_URI)
    console.log('📡 Database connected')
    
    // Merge Ne Zha duplicates
    console.log('\n🔧 Merging Ne Zha duplicates...')
    const nezhaItems = await Content.find({ 
      $or: [
        { title: { $regex: /^nezha$/i } },
        { title: { $regex: /^ne zha$/i } }
      ]
    }).lean()
    
    if (nezhaItems.length > 1) {
      // Keep the first one and merge data from others
      const primary = await Content.findById(nezhaItems[0]._id)
      const secondary = await Content.findById(nezhaItems[1]._id)
      
      // Merge data sources
      if (primary && secondary) {
        const tmdbData = primary.dataSources?.tmdb || secondary.dataSources?.tmdb
        const malData = primary.dataSources?.mal || secondary.dataSources?.mal
        
        if (tmdbData || malData) {
          primary.dataSources = {}
          if (tmdbData) primary.dataSources.tmdb = tmdbData
          if (malData) primary.dataSources.mal = malData
        }
        
        // Keep the higher score
        if (secondary.unifiedScore > primary.unifiedScore) {
          primary.unifiedScore = secondary.unifiedScore
          primary.voteCount = secondary.voteCount
        }
        
        await primary.save()
        console.log(`✅ Merged Ne Zha data into: ${primary.title}`)
        
        // Delete the duplicate
        await Content.findByIdAndDelete(secondary._id)
        console.log(`🗑️ Deleted duplicate: ${secondary.title}`)
      }
    }
    
    // Merge A Silent Voice duplicates
    console.log('\n🔧 Merging A Silent Voice duplicates...')
    const silentVoiceItems = await Content.find({ 
      $or: [
        { title: { $regex: /silent voice/i } },
        { title: { $regex: /koe no katachi/i } }
      ]
    }).lean()
    
    if (silentVoiceItems.length > 1) {
      // Keep the first one and merge data from others
      const primary = await Content.findById(silentVoiceItems[0]._id)
      const secondary = await Content.findById(silentVoiceItems[1]._id)
      
      // Merge data sources
      if (primary && secondary) {
        const tmdbData = primary.dataSources?.tmdb || secondary.dataSources?.tmdb
        const malData = primary.dataSources?.mal || secondary.dataSources?.mal
        
        if (tmdbData || malData) {
          primary.dataSources = {}
          if (tmdbData) primary.dataSources.tmdb = tmdbData
          if (malData) primary.dataSources.mal = malData
        }
        
        // Keep the higher score
        if (secondary.unifiedScore > primary.unifiedScore) {
          primary.unifiedScore = secondary.unifiedScore
          primary.voteCount = secondary.voteCount
        }
        
        // Merge alternative titles
        if (!primary.alternativeTitles) primary.alternativeTitles = []
        if (secondary.title && !primary.alternativeTitles.includes(secondary.title)) {
          primary.alternativeTitles.push(secondary.title)
        }
        
        await primary.save()
        console.log(`✅ Merged A Silent Voice data into: ${primary.title}`)
        
        // Delete the duplicate
        await Content.findByIdAndDelete(secondary._id)
        console.log(`🗑️ Deleted duplicate: ${secondary.title}`)
      }
    }
    
    await mongoose.disconnect()
    console.log('🔌 Database disconnected')
    console.log('✅ Duplicate merging completed!')
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

mergeDuplicates()
