/**
 * PostgreSQL pool for the API process.
 *
 * Layer: config. Opens a `pg` pool from `DATABASE_URL`. SSL is on for Railway
 * public hosts and off for localhost / Railway private networking.
 * Request handlers use `query` / `startSession` instead of Mongoose.
 */

import { AsyncLocalStorage } from 'node:async_hooks'
import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config()

/** @type {pg.Pool | null} */
let pool = null
/** @type {pg.Pool | null} Read replica (DATABASE_READ_URL), when configured. */
let readPool = null

/** Set inside `withReplica`: plain queries in that async context may use the replica. */
const replicaContext = new AsyncLocalStorage()

/**
 * Nested transaction clients for the current async context; `query` uses the
 * innermost. Must be per-context so concurrent requests never share a client.
 * @type {AsyncLocalStorage<pg.PoolClient[]>}
 */
const txContext = new AsyncLocalStorage()

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

  pool = createPool(connectionString, 'primary')
  return pool
}

/**
 * Pool settings shared by the primary and the replica.
 *
 * PG_POOL_MAX (default 10) is per server instance: keep instances × PG_POOL_MAX under
 * the database's max_connections (Railway Postgres: 100), or put PgBouncer in front.
 * PG_STATEMENT_TIMEOUT_MS (0/unset = none) cancels a runaway statement instead of
 * letting it hold a connection; the API server sets a default at startup.
 * @param {string} connectionString
 * @param {string} label
 * @returns {pg.Pool}
 */
function createPool(connectionString, label) {
  const statementTimeout = Number(process.env.PG_STATEMENT_TIMEOUT_MS) || 0
  const created = new pg.Pool({
    connectionString,
    ssl: sslForDatabaseUrl(connectionString),
    max: Number(process.env.PG_POOL_MAX) || 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    application_name: process.env.PG_APPLICATION_NAME || 'anilounge-api',
    ...(statementTimeout > 0 ? { statement_timeout: statementTimeout } : {}),
  })
  created.on('error', (error) => {
    console.error(`PostgreSQL ${label} pool error:`, error.message)
  })
  return created
}

/**
 * The replica pool, or null when DATABASE_READ_URL is unset.
 * @returns {pg.Pool | null}
 */
function getReadPool() {
  if (readPool) return readPool
  const connectionString = process.env.DATABASE_READ_URL
  if (!connectionString) return null
  readPool = createPool(connectionString, 'replica')
  return readPool
}

/**
 * Run `fn` with its plain queries sent to the read replica (when one is configured).
 * Only for reads that tolerate replication lag, such as the public catalog: anything
 * that writes, or must see a write it just made, stays outside. Queries inside a
 * transaction still use the transaction's client.
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 * @template T
 */
export function withReplica(fn) {
  return replicaContext.run(true, fn)
}

/**
 * Connect and `SELECT 1`. Never rejects: production exits on failure; development
 * logs and continues so the HTTP server can still bind.
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
  const pools = [pool, readPool].filter(Boolean)
  pool = null
  readPool = null
  await Promise.all(pools.map((open) => open.end()))
}

/**
 * Run a parameterized query on the open transaction client, or the pool.
 * @param {string} text
 * @param {unknown[]} [params]
 * @returns {Promise<pg.QueryResult>}
 */
export function query(text, params) {
  const client = txContext.getStore()?.at(-1)
  if (client) return client.query(text, params)
  if (replicaContext.getStore()) {
    const replica = getReadPool()
    if (replica) return replica.query(text, params)
  }
  return getPool().query(text, params)
}

/**
 * Mongoose-shaped session used by watchlist/rating handlers.
 * `startTransaction` binds this client to the caller's async context so its
 * later `query` calls (and only those) join the tx. It is deliberately not
 * `async`: the context switch has to happen in the caller's frame.
 * @returns {Promise<{ startTransaction: Function, commitTransaction: Function, abortTransaction: Function, endSession: Function }>}
 */
export async function startSession() {
  const client = await getPool().connect()
  let outerStack = null
  return {
    startTransaction() {
      if (!outerStack) {
        outerStack = txContext.getStore() || []
        txContext.enterWith([...outerStack, client])
      }
      return client.query('BEGIN')
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
      if (outerStack) {
        txContext.enterWith(outerStack)
        outerStack = null
      }
      client.release()
    },
  }
}

/**
 * Run `fn` in one transaction: its `query` calls join it, a throw rolls it back.
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 * @template T
 */
export async function withTransaction(fn) {
  const session = await startSession()
  try {
    await session.startTransaction()
    const result = await fn()
    await session.commitTransaction()
    return result
  } catch (error) {
    await session.abortTransaction()
    throw error
  } finally {
    session.endSession()
  }
}
