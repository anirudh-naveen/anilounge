/**
 * PostgreSQL connection bootstrap for the API process.
 *
 * Layer: config. Opens a pg pool from `DATABASE_URL`. Production exits on
 * failure; development logs and continues so the HTTP server can still bind.
 */

import { connectPostgres } from './postgres.js'

export default connectPostgres
