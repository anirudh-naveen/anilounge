/**
 * One-off backfill for series vs seasons:
 * - every series row on users' watchlists is brought in step with its seasons' rows
 *   (`syncSeriesFromSeasons`; new season saves, imports, and list syncs keep it up);
 * - favorites saved on a season move to its series (`moveSeasonFavoritesToSeries`).
 *
 *   npm run db:sync-series-watchlists -- --dry-run   # count what would change
 *   npm run db:sync-series-watchlists
 */
import dotenv from 'dotenv'
import { connectPostgres, closePostgres } from '../../config/postgres.js'
import { syncSeriesFromSeasons } from '../services/watchlistWrites.js'
import { moveSeasonFavoritesToSeries } from '../services/favoriteService.js'

dotenv.config()

const dryRun = process.argv.includes('--dry-run')

async function syncSeriesWatchlists() {
  try {
    await connectPostgres()
    const changed = await syncSeriesFromSeasons({ dryRun })
    console.log(`${dryRun ? 'Would update' : 'Updated'} ${changed} series watchlist rows`)
    const moved = await moveSeasonFavoritesToSeries({ dryRun })
    console.log(`${dryRun ? 'Would move' : 'Moved'} ${moved} season favorites to their series`)
  } catch (error) {
    console.error('Series watchlist backfill failed:', error)
    process.exitCode = 1
  } finally {
    await closePostgres()
  }
}

syncSeriesWatchlists()
