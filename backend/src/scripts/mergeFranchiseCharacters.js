/**
 * Collapse same-name catalog characters (including swapped first/last)
 * inside each title's home franchise.
 *
 * Usage: node src/scripts/mergeFranchiseCharacters.js
 */
import dotenv from 'dotenv'
import { connectPostgres, closePostgres } from '../../config/postgres.js'
import { mergeAllFranchiseCharacters } from '../services/characterMerge.js'

dotenv.config()

async function run() {
  await connectPostgres()
  console.log('Scanning franchise characters…')
  const merged = await mergeAllFranchiseCharacters()
  console.log(`Merged ${merged} duplicate franchise characters`)
  await closePostgres()
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
