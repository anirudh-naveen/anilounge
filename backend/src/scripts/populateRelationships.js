import mongoose from 'mongoose'
import dotenv from 'dotenv'
import Content from '../models/Content.js'
import relationshipService from '../services/relationshipService.js'

dotenv.config()

const populateRelationships = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/find-animation')
    console.log('Connected to MongoDB')

    // Get all content with MAL IDs that don't have relationships populated
    const contentWithMAL = await Content.find({
      malId: { $exists: true, $ne: null },
      $or: [
        { 'relationships.sequels': { $size: 0 } },
        { 'relationships.prequels': { $size: 0 } },
        { 'relationships.related': { $size: 0 } },
        { relationships: { $exists: false } },
      ],
    }).limit(50) // Process in batches to avoid rate limiting

    console.log(`Found ${contentWithMAL.length} items to process`)

    let processed = 0
    for (const content of contentWithMAL) {
      try {
        console.log(`Processing ${content.title} (MAL ID: ${content.malId})`)

        // Populate relationships from MAL API
        const updatedContent = await relationshipService.populateRelationshipsFromMAL(content)

        if (updatedContent.relationships) {
          await updatedContent.save()
          console.log(`✅ Updated relationships for ${content.title}`)
        } else {
          console.log(`⚠️ No relationships found for ${content.title}`)
        }

        processed++

        // Add delay to respect MAL API rate limits
        await new Promise((resolve) => setTimeout(resolve, 1000))
      } catch (error) {
        console.error(`❌ Error processing ${content.title}:`, error.message)
      }
    }

    console.log(`✅ Processed ${processed} items`)
  } catch (error) {
    console.error('Error populating relationships:', error)
  } finally {
    await mongoose.disconnect()
    console.log('Disconnected from MongoDB')
  }
}

// Run the script
populateRelationships()
