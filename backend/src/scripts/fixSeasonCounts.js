/**
 * One-off repair: series rows that are one MAL season but were merged with TMDB's
 * whole show stored the show's totals (My Hero Academia season 1: 170 episodes over
 * 7 seasons). Content.save now keeps MAL's own count (utils/episodes.js
 * `seriesEntryCounts`); this re-reads each MAL+TMDB series' episode count from MAL
 * and saves the rows whose counts change. Then watchlist rows past a series' new end
 * (any status) are pulled back to its last episode and season (`clampWatchlistProgress`).
 *
 *   npm run db:fix-season-counts -- --dry-run          # list what would change
 *   npm run db:fix-season-counts
 *   npm run db:fix-season-counts -- --watchlist-only   # just the watchlist step, no MAL calls
 *
 * Needs MAL_CLIENT_ID (except --watchlist-only). Admin-set episode/season counts are left alone.
 */
import dotenv from 'dotenv'
import { connectPostgres, closePostgres, query } from '../../config/postgres.js'
import Content, { clampWatchlistProgress, loadAdminOverrides } from '../models/Content.js'
import unifiedContentService from '../services/unifiedContentService.js'
import { seriesEntryCounts } from '../utils/episodes.js'

dotenv.config()

const dryRun = process.argv.includes('--dry-run')
const watchlistOnly = process.argv.includes('--watchlist-only')

async function fixSeasonCounts() {
  try {
    await connectPostgres()
    if (!watchlistOnly) await fixCounts()
    const clamped = await clampWatchlistProgress({}, { dryRun })
    console.log(
      `${dryRun ? 'Would move' : 'Moved'} ${clamped} watchlist rows back to their series' last episode`,
    )
  } catch (error) {
    console.error('Season count repair failed:', error)
    process.exitCode = 1
  } finally {
    await closePostgres()
  }
}

/**
 * Re-read MAL episode counts and save the series whose stored counts change.
 * @returns {Promise<void>}
 */
async function fixCounts() {
  if (!unifiedContentService.hasMalKey) throw new Error('MAL_CLIENT_ID is not set')

  const { rows } = await query(
    `SELECT id FROM works
     WHERE kind = 'series' AND mal_id IS NOT NULL AND tmdb_id IS NOT NULL
     ORDER BY title`,
  )
  console.log(
    `Checking ${rows.length} series with both MAL and TMDB ids${dryRun ? ' (dry run)' : ''}`,
  )

  let fixed = 0
  let failed = 0
  for (const [index, { id }] of rows.entries()) {
    if (index && index % 100 === 0) console.log(`…${index}/${rows.length}`)
    const doc = await Content.findById(id)
    if (!doc) continue
    const overrides = await loadAdminOverrides(id)
    if ('episodeCount' in overrides && 'seasonCount' in overrides) continue

    const mal = await unifiedContentService.getMalAnimeDetails(doc.malId)
    if (!mal) {
      failed += 1
      continue
    }
    const counts = seriesEntryCounts({ ...doc, malEpisodes: mal.num_episodes })
    const episodesChange =
      !('episodeCount' in overrides) && counts.episodeCount !== doc.episodeCount
    const seasonsChange = !('seasonCount' in overrides) && counts.seasonCount !== doc.seasonCount
    if (!episodesChange && !seasonsChange) continue

    fixed += 1
    console.log(
      `${doc.title}: ${doc.episodeCount} episodes / ${doc.seasonCount} seasons → ` +
        `${counts.episodeCount} / ${counts.seasonCount}`,
    )
    if (dryRun) continue
    doc.malEpisodes = mal.num_episodes
    // A correction, not a sync change for admins to review.
    doc.$acceptFields = ['episodeCount', 'seasonCount']
    await doc.save()
  }

  console.log(
    `${dryRun ? 'Would fix' : 'Fixed'} ${fixed} series` +
      (failed ? `; ${failed} could not be read from MAL (rerun to retry)` : ''),
  )
}

fixSeasonCounts()
