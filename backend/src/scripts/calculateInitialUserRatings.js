/**
 * One-off maintenance script: rebuild Find Animation rating aggregates on every Content row.
 * Run after a ratings schema change or when userRatingAverage/Count/Sum drift from User documents.
 * Mutates Content.userRatingAverage, userRatingCount, userRatingSum, and unifiedScore.
 * Watchlist ratings win over the legacy `ratings` array for the same title.
 */
import dotenv from 'dotenv'
import { connectPostgres, closePostgres, query } from '../../config/postgres.js'
import Content from '../models/Content.js'
import { calculateUnifiedScore } from '../utils/ratings.js'

dotenv.config()

/**
 * Zero user-rating fields, then rewrite them from ratings rows.
 * @returns {Promise<void>}
 */
async function calculateInitialUserRatings() {
  try {
    await connectPostgres()
    console.log('Database connected')

    const { rows: ratingRows } = await query(`
      SELECT content_id, score AS rating FROM ratings
    `)

    const contentRatings = {}
    for (const row of ratingRows) {
      const contentId = String(row.content_id)
      if (!contentRatings[contentId]) contentRatings[contentId] = []
      contentRatings[contentId].push(Number(row.rating))
    }

    console.log(`Found ratings for ${Object.keys(contentRatings).length} content items`)

    await Content.updateMany(
      {},
      { $set: { userRatingAverage: null, userRatingCount: 0, userRatingSum: 0 } },
    )

    let updated = 0
    for (const [contentId, ratings] of Object.entries(contentRatings)) {
      try {
        const sum = ratings.reduce((total, value) => total + value, 0)
        const count = ratings.length
        const average = sum / count

        const content = await Content.findById(contentId)
        if (!content) {
          console.log(`Content ${contentId} not found, skipping...`)
          continue
        }

        content.userRatingAverage = average
        content.userRatingCount = count
        content.userRatingSum = sum
        content.unifiedScore = calculateUnifiedScore(
          content.voteAverage,
          content.voteCount,
          content.malScore,
          content.malScoredBy,
          content.userRatingAverage,
          content.userRatingCount,
        )

        await content.save()
        updated++

        if (updated % 10 === 0) {
          console.log(`Updated ${updated} content items...`)
        }
      } catch (error) {
        console.error(`Error updating content ${contentId}:`, error.message)
      }
    }

    console.log(`\nCompleted! Updated ${updated} content items with user ratings`)
    if (Object.keys(contentRatings).length > 0) {
      const totalRatings = Object.values(contentRatings).reduce(
        (sum, ratings) => sum + ratings.length,
        0,
      )
      console.log(
        `Average ratings per content: ${(totalRatings / Object.keys(contentRatings).length).toFixed(2)}`,
      )
    }

    await closePostgres()
    console.log('Database disconnected')
  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  }
}

calculateInitialUserRatings()
