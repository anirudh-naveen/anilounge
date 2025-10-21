import mongoose from 'mongoose'
import dotenv from 'dotenv'
import Content from '../models/Content.js'

dotenv.config()

async function checkRelationships() {
  try {
    await mongoose.connect(process.env.MONGODB_URI)
    console.log('📡 Database connected')

    // Get all content with relationships
    const contentWithRelationships = await Content.find({
      'relationships.sequels': { $exists: true, $ne: [] },
    }).lean()

    console.log(`\n📊 Found ${contentWithRelationships.length} items with sequel relationships`)

    if (contentWithRelationships.length > 0) {
      console.log('\n🔗 Content with Sequels:\n')
      for (const item of contentWithRelationships) {
        console.log(`\n"${item.title}" (${item.contentType})`)
        if (item.relationships?.sequels?.length > 0) {
          console.log('  Sequels:')
          for (const sequelId of item.relationships.sequels) {
            const sequel = await Content.findOne({
              $or: [{ malId: sequelId }, { tmdbId: sequelId }],
            }).lean()
            if (sequel) {
              console.log(`    - ${sequel.title}`)
            } else {
              console.log(`    - [Not found: ${sequelId}]`)
            }
          }
        }
      }
    }

    // Get all content with prequel relationships
    const contentWithPrequels = await Content.find({
      'relationships.prequels': { $exists: true, $ne: [] },
    }).lean()

    console.log(`\n\n📊 Found ${contentWithPrequels.length} items with prequel relationships`)

    if (contentWithPrequels.length > 0) {
      console.log('\n🔗 Content with Prequels:\n')
      for (const item of contentWithPrequels) {
        console.log(`\n"${item.title}" (${item.contentType})`)
        if (item.relationships?.prequels?.length > 0) {
          console.log('  Prequels:')
          for (const prequelId of item.relationships.prequels) {
            const prequel = await Content.findOne({
              $or: [{ malId: prequelId }, { tmdbId: prequelId }],
            }).lean()
            if (prequel) {
              console.log(`    - ${prequel.title}`)
            } else {
              console.log(`    - [Not found: ${prequelId}]`)
            }
          }
        }
      }
    }

    // Check for broken relationships (sequels/prequels that don't exist in DB)
    console.log('\n\n🔍 Checking for broken relationships...\n')
    let brokenCount = 0

    for (const item of [...contentWithRelationships, ...contentWithPrequels]) {
      const brokenLinks = []

      if (item.relationships?.sequels) {
        for (const sequelId of item.relationships.sequels) {
          const sequel = await Content.findOne({
            $or: [{ malId: sequelId }, { tmdbId: sequelId }],
          }).lean()
          if (!sequel) {
            brokenLinks.push({ type: 'sequel', id: sequelId })
          }
        }
      }

      if (item.relationships?.prequels) {
        for (const prequelId of item.relationships.prequels) {
          const prequel = await Content.findOne({
            $or: [{ malId: prequelId }, { tmdbId: prequelId }],
          }).lean()
          if (!prequel) {
            brokenLinks.push({ type: 'prequel', id: prequelId })
          }
        }
      }

      if (brokenLinks.length > 0) {
        console.log(`❌ "${item.title}" has ${brokenLinks.length} broken link(s):`)
        brokenLinks.forEach((link) => {
          console.log(`   - ${link.type}: ${link.id}`)
        })
        brokenCount += brokenLinks.length
      }
    }

    if (brokenCount === 0) {
      console.log('✅ No broken relationships found!')
    } else {
      console.log(`\n⚠️ Found ${brokenCount} broken relationship(s)`)
    }

    await mongoose.disconnect()
    console.log('\n🔌 Database disconnected')
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

checkRelationships()

