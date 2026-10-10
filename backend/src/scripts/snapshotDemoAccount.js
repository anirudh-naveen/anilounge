/**
 * Save the demo account's current watchlist, ratings, favorites, and profile as the
 * baseline the nightly reset restores. Set the demo up the way visitors should see it,
 * then run `npm run demo:snapshot`. `npm run demo:reset` (`--reset`) restores the
 * baseline now instead.
 */
import dotenv from 'dotenv'
import { connectPostgres, closePostgres } from '../../config/postgres.js'
import { resetDemoAccount, snapshotDemoAccount } from '../services/demoAccount.js'

dotenv.config()

const run = async () => {
  try {
    await connectPostgres()
    if (process.argv.includes('--reset')) {
      const result = await resetDemoAccount()
      console.log(result === 'reset' ? 'Demo account reset to its baseline.' : 'No demo account.')
      return
    }
    const counts = await snapshotDemoAccount()
    if (!counts) {
      console.log('No demo account. Run `node src/scripts/createDemoUser.js` first.')
      return
    }
    console.log('Saved the demo baseline:')
    for (const [table, count] of Object.entries(counts)) console.log(`  ${table}: ${count}`)
  } catch (error) {
    console.error('Demo snapshot failed:', error)
    process.exitCode = 1
  } finally {
    await closePostgres()
  }
}

run()
