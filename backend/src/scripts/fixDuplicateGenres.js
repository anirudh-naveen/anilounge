import mongoose from 'mongoose'
import dotenv from 'dotenv'
import Content from '../models/Content.js'

dotenv.config()

// Helper function to deduplicate genres by id or name
function deduplicateGenres(genres) {
  if (!genres || !Array.isArray(genres)) return []
  
  const genreMap = new Map()
  
  genres.forEach((genre) => {
    if (!genre) return
    
    // Handle both object format {id, name} and string format
    const genreId = typeof genre === 'object' ? genre.id : null
    const genreName = typeof genre === 'object' ? genre.name : genre
    
    if (!genreName) return
    
    // Use id as primary key if available, otherwise use name
    const key = genreId ? `id:${genreId}` : `name:${genreName.toLowerCase()}`
    
    if (!genreMap.has(key)) {
      genreMap.set(key, typeof genre === 'object' ? genre : { name: genre })
    }
  })
  
  return Array.from(genreMap.values())
}

async function fixDuplicateGenres() {
  try {
    await mongoose.connect(process.env.MONGODB_URI)
    console.log('📡 Database connected')

    const allContent = await Content.find({})
    console.log(`📊 Found ${allContent.length} content items to process`)

    let fixed = 0

    for (const content of allContent) {
      if (content.genres && Array.isArray(content.genres)) {
        const originalLength = content.genres.length
        const deduplicated = deduplicateGenres(content.genres)
        
        if (deduplicated.length !== originalLength) {
          content.genres = deduplicated
          await content.save()
          fixed++
          console.log(
            `✅ Fixed ${content.title}: ${originalLength} → ${deduplicated.length} genres`,
          )
        }
      }
    }

    console.log(`🎉 Fixed duplicate genres in ${fixed} content items`)
  } catch (error) {
    console.error('❌ Error fixing duplicate genres:', error)
  } finally {
    await mongoose.disconnect()
    console.log('🔌 Database disconnected')
  }
}

// Run the fix
fixDuplicateGenres()

