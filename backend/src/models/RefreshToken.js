/**
 * Refresh-token table maintenance.
 *
 * Sessions are issued, rotated, and revoked in `services/sessionService.js`
 * (tokens are stored hashed); this model only prunes old rows.
 */
import { query } from '../../config/postgres.js'

function RefreshToken(data = {}) {
  Object.assign(this, data)
}

RefreshToken.deleteMany = async function deleteMany(filter = {}) {
  if (filter.$or) {
    const result = await query(
      `DELETE FROM refresh_tokens
       WHERE expires_at < now()
          OR (is_revoked = true AND created_at < now() - interval '30 days')`,
    )
    return { deletedCount: result.rowCount || 0 }
  }
  const result = await query('DELETE FROM refresh_tokens')
  return { deletedCount: result.rowCount || 0 }
}

export default RefreshToken
