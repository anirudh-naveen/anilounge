import mongoose from 'mongoose'
import dotenv from 'dotenv'
import Content from '../models/Content.js'

dotenv.config()

async function checkSearchContent() {
  try {
    await mongoose.connect(process.env.MONGODB_URI)
    console.log('📡 Database connected')
    
    const totalContent = await Content.countDocuments()
    console.log(`Total content in database: ${totalContent}`)
    
    const familyGuy = await Content.find({ title: { $regex: /family guy/i } }).lean()
    console.log(`Family Guy items: ${familyGuy.length}`)
    
    const sampleContent = await Content.find({}).limit(10).lean()
    console.log('\nSample content titles:')
    sampleContent.forEach(item => {
      console.log(`- ${item.title} (${item.contentType})`)
    })
    
    // Check what happens when we search for "animated"
    const animatedContent = await Content.find({
      $or: [
        { title: { $regex: 'animated', $options: 'i' } },
        { overview: { $regex: 'animated', $options: 'i' } },
        { 'genres.name': { $regex: 'animation', $options: 'i' } }
      ]
    }).limit(5).lean()
    
    console.log('\nContent matching "animated":')
    animatedContent.forEach(item => {
      console.log(`- ${item.title} (${item.contentType})`)
    })
    
    await mongoose.disconnect()
    console.log('🔌 Database disconnected')
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

checkSearchContent()
