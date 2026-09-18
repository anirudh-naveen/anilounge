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
    await client.query('BEGIN')
    for (const statement of statements) {
      await client.query(statement)
    }
    await client.query('COMMIT')
    console.log('Schema applied')
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Schema apply failed:', error.message)
    process.exitCode = 1
  } finally {
    await client.end()
  }
}

applySchema()
