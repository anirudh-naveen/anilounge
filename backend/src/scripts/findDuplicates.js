/**
 * Read-only diagnostic script: print likely duplicate Content rows.
 * Run before mergeDuplicates.js. Logs known pairs (Ne Zha, A Silent Voice) plus groups that
 * share any English/native/original/alternative name. Does not mutate the database.
 */
import mongoose from 'mongoose'
import dotenv from 'dotenv'
import Content from '../models/Content.js'
import { collectContentTitles } from '../utils/titles.js'

dotenv.config()

/**
 * Strip punctuation for latin titles; keep the original lowercased string when that would empty Japanese names.
 * @param {string} title
 * @returns {string}
 */
function normalizeForGrouping(title) {
  const lower = String(title).toLowerCase().trim()
  const stripped = lower.replace(/[^\w\s]/g, '').trim()
  return stripped || lower
}

/**
 * Group catalog rows that share any searchable name on the same contentType.
 * @param {object[]} allContent
 * @returns {object[][]}
 */
function groupContentBySharedTitles(allContent) {
  const parent = allContent.map((_, i) => i)
  const find = (i) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]]
      i = parent[i]
    }
    return i
  }
  const union = (a, b) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[rb] = ra
  }

  const keyToIndex = new Map()
  allContent.forEach((item, index) => {
    const keys = new Set(
      collectContentTitles(item)
        .map(normalizeForGrouping)
        .filter(Boolean)
        .map((key) => `${item.contentType}::${key}`),
    )
    for (const key of keys) {
      const existing = keyToIndex.get(key)
      if (existing != null) {
        union(existing, index)
      } else {
        keyToIndex.set(key, index)
      }
    }
  })

  const groups = new Map()
  allContent.forEach((item, i) => {
    const root = find(i)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root).push(item)
  })

  return [...groups.values()].filter((items) => items.length > 1)
}

/**
 * Print Ne Zha / Silent Voice matches and groups that share any searchable title.
 * @returns {Promise<void>}
 */
async function findDuplicates() {
  try {
    await mongoose.connect(process.env.MONGODB_URI)
    console.log('Database connected')

    const nezhaItems = await Content.find({
      $or: [{ title: { $regex: /nezha/i } }, { title: { $regex: /ne zha/i } }],
    }).lean()

    console.log('\nNe Zha items:')
    nezhaItems.forEach((item) => {
      const year = item.releaseDate ? new Date(item.releaseDate).getFullYear() : 'N/A'
      console.log(
        `- ${item.title} (${year}) - ${item.contentType} - Genres: ${(item.genres || []).map((g) => g.name || g).join(', ')} - ID: ${item._id}`,
      )
    })

    const silentVoiceItems = await Content.find({
      $or: [
        { title: { $regex: /silent voice/i } },
        { title: { $regex: /koe no katachi/i } },
        { title: { $regex: /a silent voice/i } },
      ],
    }).lean()

    console.log('\nA Silent Voice items:')
    silentVoiceItems.forEach((item) => {
      const year = item.releaseDate ? new Date(item.releaseDate).getFullYear() : 'N/A'
      console.log(
        `- ${item.title} (${year}) - ${item.contentType} - Genres: ${(item.genres || []).map((g) => g.name || g).join(', ')} - ID: ${item._id}`,
      )
    })

    console.log('\nSearching for potential duplicates across all content...')
    const allContent = await Content.find({}).lean()
    const duplicateGroups = groupContentBySharedTitles(allContent)

    if (duplicateGroups.length > 0) {
      console.log(`\n📋 Found ${duplicateGroups.length} potential duplicate groups:\n`)
      duplicateGroups.forEach((items) => {
        console.log(`\n"${items[0].title}" (${items.length} items):`)
        items.forEach((item) => {
          const year = item.releaseDate ? new Date(item.releaseDate).getFullYear() : 'N/A'
          const sources = []
          if (item.tmdbId) sources.push('TMDB')
          if (item.malId) sources.push('MAL')
          console.log(
            `  - ${item.title} (${year}) [${sources.join(' + ')}] - ${item.contentType} - ID: ${item._id}`,
          )
        })
      })
    } else {
      console.log('\nNo duplicate titles found!')
    }

    await mongoose.disconnect()
    console.log('\nDatabase disconnected')
  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  }
}

findDuplicates()
