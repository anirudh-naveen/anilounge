/**
 * Group catalog titles into franchises from MAL relations and shared main cast.
 * Prints the plan; pass --apply to write it. Optional: the server's catalog
 * maintenance (services/catalogMaintenance.js) applies this on its own.
 *
 * Usage: node src/scripts/buildFranchises.js [--apply]
 */
import dotenv from 'dotenv'
import { connectPostgres, closePostgres } from '../../config/postgres.js'
import { applyFranchisePlan, loadFranchisePlan } from '../services/franchiseBuilder.js'

dotenv.config()

async function run() {
  const apply = process.argv.includes('--apply')
  await connectPostgres()
  const plan = await loadFranchisePlan()

  console.log(`\nNew franchises (${plan.create.length}):`)
  for (const group of plan.create) console.log(`  ${group.name}: ${group.titles.join(' | ')}`)
  console.log(`\nTitles joining existing franchises (${plan.join.length} franchises):`)
  for (const group of plan.join) console.log(`  ${group.name}: + ${group.titles.join(' | ')}`)
  console.log(`\nSkipped, spans several franchises (${plan.conflicts.length}):`)
  for (const group of plan.conflicts) {
    console.log(`  ${group.franchises.join(' + ')}: ${group.titles.join(' | ')}`)
  }

  console.log(`\nShared universe, kept as separate franchises (${plan.sharedUniverse.length}):`)
  for (const [left, right] of plan.sharedUniverse) console.log(`  ${left} <-> ${right}`)

  if (apply) {
    const result = await applyFranchisePlan(plan)
    console.log(`\nCreated ${result.created} franchises, added ${result.added} memberships`)
  } else {
    console.log('\nDry run. Pass --apply to write this plan.')
  }
  await closePostgres()
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
