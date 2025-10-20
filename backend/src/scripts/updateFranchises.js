import mongoose from 'mongoose'
import dotenv from 'dotenv'
import Content from '../models/Content.js'
import relationshipService from '../services/relationshipService.js'

// Load environment variables
dotenv.config()

async function updateFranchises() {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI)
    console.log('📡 Database connected')

    // Get all content
    const allContent = await Content.find({})
    console.log(`📊 Found ${allContent.length} content items to process`)

    let updated = 0

    for (const content of allContent) {
      let hasFranchise = false
      let franchiseName = null

      // Check TMDB ID
      if (content.tmdbId) {
        const tmdbFranchise = relationshipService.findFranchiseByExternalId(
          { id: content.tmdbId },
          'tmdb',
        )
        if (tmdbFranchise) {
          hasFranchise = true
          franchiseName = tmdbFranchise.name
        }
      }

      // Check MAL ID
      if (!hasFranchise && content.malId) {
        const malFranchise = relationshipService.findFranchiseByExternalId(
          { id: content.malId },
          'mal',
        )
        if (malFranchise) {
          hasFranchise = true
          franchiseName = malFranchise.name
        }
      }

      // Update content if franchise found
      if (hasFranchise) {
        await Content.findByIdAndUpdate(content._id, {
          franchise: franchiseName,
          'relationships.franchise': franchiseName,
        })
        console.log(`✅ Updated ${content.title} with franchise: ${franchiseName}`)
        updated++
      }
    }

    console.log(`🎉 Updated ${updated} content items with franchise information`)
  } catch (error) {
    console.error('❌ Error updating franchises:', error)
  } finally {
    await mongoose.disconnect()
    console.log('🔌 Database disconnected')
  }
}

// Run the update
updateFranchises()
