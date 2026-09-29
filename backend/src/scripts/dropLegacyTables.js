/**
 * Drop the legacy_* tables left behind by `npm run db:migrate-legacy`.
 * Layer: CLI script. Dry run by default: lists each legacy table with its row
 * count and changes nothing. Pass --confirm to drop them in one transaction.
 *
 * All tables go in a single DROP TABLE without CASCADE, so foreign keys between
 * legacy tables are fine, but anything outside legacy_* that still depends on
 * them (a view, a foreign key) makes Postgres refuse and nothing is dropped.
 *
 * Usage: DATABASE_URL=... npm run db:drop-legacy
 *        DATABASE_URL=... npm run db:drop-legacy -- --confirm
 */

import path from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'
import dotenv from 'dotenv'
import { sslForDatabaseUrl } from '../../config/postgres.js'

dotenv.config()

/**
 * Host/database part of a connection string, without credentials.
 * @param {string} connectionString
 * @returns {string}
 */
function describeTarget(connectionString) {
  try {
    const url = new URL(connectionString)
    return `${url.hostname}:${url.port || 5432}${url.pathname}`
  } catch {
    return '(unparseable DATABASE_URL)'
  }
}

/**
 * List legacy tables, then drop them when --confirm is passed.
 * @returns {Promise<void>}
 */
async function dropLegacyTables() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    console.error('DATABASE_URL is not set')
    process.exit(1)
  }
  const confirm = process.argv.includes('--confirm')

  const client = new pg.Client({
    connectionString,
    ssl: sslForDatabaseUrl(connectionString),
  })
  await client.connect()
  console.log(`Database: ${describeTarget(connectionString)}`)

  try {
    const { rows: tables } = await client.query(
      `SELECT tablename FROM pg_tables
       WHERE schemaname = 'public' AND tablename LIKE 'legacy\\_%'
       ORDER BY tablename`,
    )
    if (!tables.length) {
      console.log('No legacy_* tables found. Nothing to do.')
      return
    }

    console.log(`Found ${tables.length} legacy tables:`)
    for (const { tablename } of tables) {
      const { rows } = await client.query(
        `SELECT count(*)::int AS n FROM ${client.escapeIdentifier(tablename)}`,
      )
      console.log(`  ${tablename.padEnd(40)} ${rows[0].n} rows`)
    }

    if (!confirm) {
      console.log('\nDry run: nothing dropped. Re-run with --confirm to drop these tables.')
      return
    }

    const list = tables.map(({ tablename }) => client.escapeIdentifier(tablename)).join(', ')
    await client.query('BEGIN')
    try {
      await client.query(`DROP TABLE ${list}`)
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    }
    console.log(`\nDropped ${tables.length} legacy tables.`)
  } catch (error) {
    console.error('Drop failed, nothing was changed:', error.message)
    process.exitCode = 1
  } finally {
    await client.end()
  }
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirectRun) {
  dropLegacyTables()
}
