/**
 * One-off maintenance script: stamp franchise names from RelationshipService.franchiseMap.
 * Run after editing the franchise map or when Content.franchise is empty on known series.
 * Mutates Content.franchise and relationships.franchise; does not rewrite sequel/prequel ids.
 */
import mongoose from 'mongoose'
import dotenv from 'dotenv'
import Content from '../models/Content.js'
import relationshipService from '../services/relationshipService.js'

dotenv.config()

/**
 * For each Content row, look up TMDB then MAL id in the franchise map and persist the name.
 * @returns {Promise<void>}
 */
async function updateFranchises() {
  try {
    await mongoose.connect(process.env.MONGODB_URI)
    console.log('Database connected')

    const allContent = await Content.find({})
    console.log(`Found ${allContent.length} content items to process`)

    let updated = 0

    for (const content of allContent) {
      let hasFranchise = false
      let franchiseName = null

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

      if (hasFranchise) {
        await Content.findByIdAndUpdate(content._id, {
          franchise: franchiseName,
          'relationships.franchise': franchiseName,
        })
        console.log(`Updated ${content.title} with franchise: ${franchiseName}`)
        updated++
      }
    }

    console.log(`Updated ${updated} content items with franchise information`)
  } catch (error) {
    console.error('Error updating franchises:', error)
  } finally {
    await mongoose.disconnect()
    console.log('Database disconnected')
  }
}

updateFranchises()
