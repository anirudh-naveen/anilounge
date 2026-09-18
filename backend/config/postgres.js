/**
 * PostgreSQL pool for the API process.
 *
 * Layer: config. Opens a `pg` pool from `DATABASE_URL`. SSL is on for Railway
 * public hosts and off for localhost / Railway private networking.
 * Request handlers use `query` / `startSession` instead of Mongoose.
 */

import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config()

/** @type {pg.Pool | null} */
let pool = null

/** Nested transaction clients; `query` uses the innermost. */
/** @type {pg.PoolClient[]} */
const txClients = []

/**
 * SSL for hosted Postgres; skip for local Docker and Railway private DNS.
 * @param {string} connectionString
 * @returns {false | { rejectUnauthorized: boolean }}
 */
export function sslForDatabaseUrl(connectionString) {
  if (!connectionString) return false
  const local =
    connectionString.includes('localhost') ||
    connectionString.includes('127.0.0.1') ||
    connectionString.includes('.railway.internal')
  if (local) return false
  return { rejectUnauthorized: false }
}

/**
 * Shared pool. Creates one on first call.
 * @returns {pg.Pool}
 */
export function getPool() {
  if (pool) return pool

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set')
  }

  pool = new pg.Pool({
    connectionString,
    ssl: sslForDatabaseUrl(connectionString),
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  })

  pool.on('error', (error) => {
    console.error('PostgreSQL pool error:', error.message)
  })

  return pool
}

/**
 * Connect and `SELECT 1`. Production should treat failure as fatal once this
 * replaces mongoose; development logs and continues.
 * @returns {Promise<void>}
 */
export async function connectPostgres() {
  try {
    const result = await getPool().query('SELECT 1 AS ok')
    if (result.rows[0]?.ok !== 1) {
      throw new Error('Unexpected PostgreSQL ping response')
    }
    const { host } = new URL(process.env.DATABASE_URL)
    console.log(`PostgreSQL connected: ${host}`)
  } catch (error) {
    console.error('PostgreSQL connection error:', error.message)
    if (process.env.NODE_ENV === 'production') {
      console.error('Exiting due to database connection failure in production')
      process.exit(1)
    } else {
      console.warn('Server will continue without PostgreSQL (development mode)')
    }
  }
}

/**
 * Close the pool (scripts and tests).
 * @returns {Promise<void>}
 */
export async function closePostgres() {
  if (!pool) return
  await pool.end()
  pool = null
}

/**
 * Run a parameterized query on the open transaction client, or the pool.
 * @param {string} text
 * @param {unknown[]} [params]
 * @returns {Promise<pg.QueryResult>}
 */
export function query(text, params) {
  const client = txClients[txClients.length - 1]
  if (client) return client.query(text, params)
  return getPool().query(text, params)
}

/**
 * Mongoose-shaped session used by watchlist/rating handlers.
 * `startTransaction` pushes this client so subsequent `query` calls join the tx.
 * @returns {Promise<{ startTransaction: Function, commitTransaction: Function, abortTransaction: Function, endSession: Function }>}
 */
export async function startSession() {
  const client = await getPool().connect()
  let inStack = false
  return {
    async startTransaction() {
      if (!inStack) {
        txClients.push(client)
        inStack = true
      }
      await client.query('BEGIN')
    },
    async commitTransaction() {
      await client.query('COMMIT')
    },
    async abortTransaction() {
      try {
        await client.query('ROLLBACK')
      } catch {
        // Connection already aborted.
      }
    },
    endSession() {
      if (inStack) {
        const index = txClients.lastIndexOf(client)
        if (index >= 0) txClients.splice(index, 1)
        inStack = false
      }
      client.release()
    },
  }
}

export default { getPool, connectPostgres, closePostgres, query, startSession }
