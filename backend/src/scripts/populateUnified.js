/**
 * CLI entry for DatabasePopulator: pull TMDB/MAL pages into MongoDB Content.
 * Run for initial catalog load or a manual refresh. Mutates Content (insert/update/merge).
 * `--clear` deletes all Content first — never used by the hourly scheduler.
 *
 * Flags: --tmdbLimit N, --malLimit N, --clear
 */
import dotenv from 'dotenv'
import DatabasePopulator from '../services/contentSyncService.js'

dotenv.config()

/**
 * Parse --tmdbLimit, --malLimit, and --clear from process.argv.
 * @returns {{ tmdbLimit: number, malLimit: number, clear: boolean }}
 */
const parseArgs = () => {
  const args = process.argv.slice(2)
  const options = { tmdbLimit: 100, malLimit: 100, clear: false }

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--tmdbLimit' && args[i + 1]) {
      options.tmdbLimit = parseInt(args[i + 1], 10)
      i++
    } else if (args[i] === '--malLimit' && args[i + 1]) {
      options.malLimit = parseInt(args[i + 1], 10)
      i++
    } else if (args[i] === '--clear') {
      options.clear = true
    }
  }

  return options
}

/**
 * Run populateDatabase with this process owning the mongoose connection.
 * @returns {Promise<void>}
 */
const runPopulation = async () => {
  const options = parseArgs()
  const populator = new DatabasePopulator()

  try {
    await populator.populateDatabase({ ...options, manageConnection: true })
  } catch (error) {
    console.error('Population failed:', error)
    process.exit(1)
  } finally {
    process.exit(0)
  }
}

process.on('SIGINT', () => {
  console.log('\nReceived SIGINT, shutting down gracefully...')
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('\nReceived SIGTERM, shutting down gracefully...')
  process.exit(0)
})

runPopulation()
