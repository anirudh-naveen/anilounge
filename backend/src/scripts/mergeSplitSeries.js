/**
 * Put series that were split off part-way through a show back into it ("KONOSUBA 3",
 * holding seasons 3 and 4, into "KONOSUBA", holding 1 and 2): `mergeSeriesInto` moves
 * the seasons, users' rows, and links, then rebuilds the show's totals and watchlists.
 *
 *   npm run db:merge-split-series                              # list splits and likely shows
 *   npm run db:merge-split-series -- --from <id> --into <id>   # merge one
 *   npm run db:merge-split-series -- --fribb                   # series Fribb puts on one TMDB show
 *
 * Both lists only suggest: some listed series are separate shows (or Fribb is wrong),
 * so nothing is merged without --from and --into.
 */
import dotenv from 'dotenv'
import { connectPostgres, closePostgres } from '../../config/postgres.js'
import { findFribbSplits, findSplitSeries, mergeSeriesInto } from '../services/catalogRepair.js'

dotenv.config()

const arg = (name) => {
  const index = process.argv.indexOf(name)
  return index > -1 ? process.argv[index + 1] : null
}

async function mergeSplitSeries() {
  try {
    await connectPostgres()
    const from = arg('--from')
    const into = arg('--into')
    if (from && into) {
      const { seasons } = await mergeSeriesInto(from, into)
      console.log(`Moved ${seasons} seasons into ${into} and merged ${from} away`)
      return
    }
    if (process.argv.includes('--fribb')) {
      const splits = await findFribbSplits()
      for (const { from, into, tmdbTvId } of splits) {
        console.log(`${from.name}  ${from.id}\n    -> ${into.name}  ${into.id}  (TMDB ${tmdbTvId})`)
      }
      console.log(`Found ${splits.length} split series`)
      return
    }
    for (const { split, parents } of await findSplitSeries()) {
      console.log(`${split.name} (from season ${split.firstSeason})  ${split.id}`)
      if (!parents.length) console.log('    no likely show found')
      for (const parent of parents) {
        console.log(`    -> ${parent.name} (seasons 1-${parent.lastSeason})  ${parent.id}`)
      }
    }
  } catch (error) {
    console.error('Series merge failed:', error)
    process.exitCode = 1
  } finally {
    await closePostgres()
  }
}

mergeSplitSeries()
