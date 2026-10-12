/**
 * Apply backend/db/schema.sql to DATABASE_URL.
 * Layer: CLI script. Creates tables if they do not exist. Does not drop data.
 *
 * Usage: DATABASE_URL=postgresql://postgres:dev@localhost:5432/anilounge npm run db:schema
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'
import dotenv from 'dotenv'
import { sslForDatabaseUrl } from '../../config/postgres.js'

dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const schemaPath = path.resolve(__dirname, '../../db/schema.sql')

/**
 * Split SQL on semicolons that are not inside single-quoted strings.
 * @param {string} sql
 * @returns {string[]}
 */
function splitStatements(sql) {
  const statements = []
  let current = ''
  let inString = false

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i]
    const next = sql[i + 1]

    if (inString) {
      current += char
      if (char === "'" && next === "'") {
        current += next
        i += 1
      } else if (char === "'") {
        inString = false
      }
      continue
    }

    if (char === '-' && next === '-') {
      while (i < sql.length && sql[i] !== '\n') i += 1
      current += '\n'
      continue
    }

    if (char === "'") {
      inString = true
      current += char
      continue
    }

    if (char === ';') {
      const trimmed = current.trim()
      if (trimmed) statements.push(trimmed)
      current = ''
      continue
    }

    current += char
  }

  const trimmed = current.trim()
  if (trimmed) statements.push(trimmed)
  return statements
}

/**
 * Open a one-off client, run every statement in schema.sql, then disconnect.
 * @returns {Promise<void>}
 */
async function applySchema() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    console.error('DATABASE_URL is not set')
    process.exit(1)
  }

  const sql = fs.readFileSync(schemaPath, 'utf8')
  const statements = splitStatements(sql)
  const client = new pg.Client({
    connectionString,
    ssl: sslForDatabaseUrl(connectionString),
  })

  await client.connect()
  console.log(`Applying ${statements.length} statements from ${schemaPath}`)

  try {
    // The live server writes the same tables (catalog sync, watchlists). All statements
    // run in one transaction, so a lock clash rolls everything back and it is tried
    // again; lock_timeout keeps it from queueing behind a long write for minutes.
    for (let attempt = 1; ; attempt += 1) {
      try {
        await applyOnce(client, statements)
        console.log('Schema applied')
        return
      } catch (error) {
        const retryable = RETRYABLE_CODES.has(error.code) && attempt < MAX_ATTEMPTS
        console.error(
          `Schema apply attempt ${attempt} failed: ${error.message}${retryable ? ' (rolled back; retrying)' : ''}`,
        )
        if (!retryable) throw error
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * attempt))
      }
    }
  } catch {
    process.exitCode = 1
  } finally {
    await client.end()
  }
}

/** Deadlock, lock timeout, serialization failure: safe to retry the whole transaction. */
const RETRYABLE_CODES = new Set(['40P01', '55P03', '40001'])
const MAX_ATTEMPTS = 5
const RETRY_DELAY_MS = 5000

/**
 * Every statement, plus the legacy airing-status fill, in one transaction.
 * @param {pg.Client} client
 * @param {string[]} statements
 * @returns {Promise<void>}
 * @throws The failing statement's error, after rolling back.
 */
async function applyOnce(client, statements) {
  try {
    await client.query('BEGIN')
    await client.query("SET LOCAL lock_timeout = '10s'")
    for (const statement of statements) {
      await client.query(statement)
    }
    const legacy = await client.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'legacy_content'`,
    )
    if (legacy.rowCount) {
      await client.query(`
        UPDATE movies m
        SET airing_status = CASE lc.mal_status
          WHEN 'currently_airing' THEN 'airing'
          WHEN 'not_yet_aired' THEN 'upcoming'
          WHEN 'finished_airing' THEN 'finished'
          ELSE m.airing_status
        END
        FROM legacy_content lc
        WHERE lc.id = m.content_id AND m.airing_status IS NULL
      `)
      await client.query(`
        UPDATE specials sp
        SET airing_status = CASE lc.mal_status
          WHEN 'currently_airing' THEN 'airing'
          WHEN 'not_yet_aired' THEN 'upcoming'
          WHEN 'finished_airing' THEN 'finished'
          ELSE sp.airing_status
        END
        FROM legacy_content lc
        WHERE lc.id = sp.content_id AND sp.airing_status IS NULL
      `)
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  }
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirectRun) {
  applySchema()
}
