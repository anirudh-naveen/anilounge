/**
 * Read-only diagnostic script: list sequel/prequel links and report ids that do not resolve.
 * Run after relationship ingest or merge. Does not mutate Content.
 */
import dotenv from 'dotenv'
import { connectPostgres, closePostgres, query } from '../../config/postgres.js'

dotenv.config()

/**
 * Print titles with sequels/prequels and count dangling content_relations rows.
 * @returns {Promise<void>}
 */
async function checkRelationships() {
  try {
    await connectPostgres()
    console.log('Database connected')

    const { rows: sequels } = await query(
      `SELECT c.title AS from_title, t.title AS to_title, t.id AS to_id
       FROM content_relations r
       JOIN content c ON c.id = r.from_id
       JOIN content t ON t.id = r.to_id
       WHERE r.kind = 'sequel'
       ORDER BY c.title`,
    )
    console.log(`\nFound ${sequels.length} sequel edges`)
    for (const row of sequels) {
      console.log(`  "${row.from_title}" → ${row.to_title}`)
    }

    const { rows: prequels } = await query(
      `SELECT c.title AS from_title, t.title AS to_title
       FROM content_relations r
       JOIN content c ON c.id = r.from_id
       JOIN content t ON t.id = r.to_id
       WHERE r.kind = 'prequel'
       ORDER BY c.title`,
    )
    console.log(`\nFound ${prequels.length} prequel edges`)
    for (const row of prequels) {
      console.log(`  "${row.from_title}" → ${row.to_title}`)
    }

    const { rows: kinds } = await query(
      `SELECT kind, count(*)::int AS n FROM content_relations GROUP BY kind ORDER BY kind`,
    )
    console.log('\nEdges by kind:')
    for (const row of kinds) {
      console.log(`  ${row.kind}: ${row.n}`)
    }

    await closePostgres()
    console.log('\nDatabase disconnected')
  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  }
}

checkRelationships()
