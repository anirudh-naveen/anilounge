/**
 * "Share to AniLounge" from other apps: find the title behind a shared AniList,
 * MyAnimeList, TMDB, or AniLounge link and add it to the sharer's watchlist.
 *
 * Layer: service. Used by the iOS share extension, which signs in with the device's
 * widget token (services/widgetService.js) because it can't use the app's session.
 * Adding only ever creates a Plan to Watch entry; it never changes an existing one.
 */

import { query } from '../../config/postgres.js'
import { isUuid } from '../db/ids.js'
import { contentTypeFromKind } from '../db/kinds.js'
import Content from '../models/Content.js'
import User from '../models/User.js'
import { HttpError } from '../utils/httpError.js'
import { contentPagePath } from '../utils/slug.js'
import { mirrorWatchlistChange } from './connectionSync.js'

const TITLE_KINDS = ['series', 'movie', 'special']
const UUID_IN_PATH = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i

/**
 * The first web address in shared text (apps often share "Title https://...").
 * @param {unknown} text
 * @returns {string | null}
 */
export function firstUrl(text) {
  const match = String(text || '').match(/https?:\/\/[^\s<>"]+/i)
  return match ? match[0].replace(/[).,]+$/, '') : null
}

/**
 * Which catalog id a link names.
 * @param {unknown} shared - A URL, or text containing one.
 * @returns {{ column: 'id' | 'anilist_id' | 'mal_id' | 'tmdb_id', value: string | number, kinds: string[] } | null}
 */
export function parseTitleLink(shared) {
  const address = firstUrl(shared)
  if (!address) return null
  let url
  try {
    url = new URL(address)
  } catch {
    return null
  }
  const host = url.hostname.replace(/^(www|m)\./, '')
  const path = url.pathname
  let match
  if (host === 'anilist.co' && (match = path.match(/^\/anime\/(\d+)/))) {
    return { column: 'anilist_id', value: Number(match[1]), kinds: TITLE_KINDS }
  }
  if (host === 'myanimelist.net') {
    match = path.match(/^\/anime\/(\d+)/)
    const id = match ? match[1] : path === '/anime.php' ? url.searchParams.get('id') : null
    if (id && /^\d+$/.test(id)) return { column: 'mal_id', value: Number(id), kinds: TITLE_KINDS }
  }
  if (host === 'themoviedb.org' && (match = path.match(/^\/(movie|tv)\/(\d+)/))) {
    return {
      column: 'tmdb_id',
      value: Number(match[2]),
      kinds: match[1] === 'movie' ? ['movie'] : ['series'],
    }
  }
  if (host === 'anilounge.net' && /^\/(movie|tv-show)\//.test(path)) {
    match = path.match(UUID_IN_PATH)
    if (match) return { column: 'id', value: match[1].toLowerCase(), kinds: TITLE_KINDS }
  }
  return null
}

/**
 * The title a shared link points to, and whether it's already on the user's watchlist.
 * @param {string} userId
 * @param {unknown} shared - The shared URL or text.
 * @returns {Promise<{ id: string, title: string, contentType: string, path: string, status: string | null }>}
 * @throws {HttpError} 400 not a supported link, 404 not in the catalog.
 */
export async function lookupSharedTitle(userId, shared) {
  const link = parseTitleLink(shared)
  if (!link) {
    throw new HttpError(400, 'Share a title from AniList, MyAnimeList, TMDB, or AniLounge.')
  }
  if (link.column === 'id' && !isUuid(link.value)) throw new HttpError(404, 'Title not found.')
  const { rows } = await query(
    `SELECT c.id, c.kind, c.name, w.status
     FROM content c
     LEFT JOIN watchlist w ON w.content_id = c.id AND w.user_id = $3
     WHERE c.${link.column} = $1 AND c.kind = ANY($2::text[])
     ORDER BY array_position($2::text[], c.kind)
     LIMIT 1`,
    [link.value, link.kinds, userId],
  )
  const row = rows[0]
  if (!row) throw new HttpError(404, "That title isn't on AniLounge yet.")
  return {
    id: String(row.id),
    title: row.name,
    contentType: contentTypeFromKind(row.kind),
    path: contentPagePath({ kind: row.kind, id: row.id, name: row.name }),
    status: row.status || null,
  }
}

/**
 * Add a title to the user's watchlist as Plan to Watch (left alone if already there),
 * mirroring it to their connected AniList/MyAnimeList lists.
 * @param {string} userId
 * @param {unknown} contentId
 * @returns {Promise<{ added: boolean, status: string }>}
 * @throws {HttpError} 404 unknown title.
 */
export async function addSharedTitle(userId, contentId) {
  if (!isUuid(contentId)) throw new HttpError(404, 'Title not found.')
  const { rows: found } = await query(
    'SELECT 1 FROM content WHERE id = $1 AND kind = ANY($2::text[])',
    [contentId, TITLE_KINDS],
  )
  if (!found[0]) throw new HttpError(404, 'Title not found.')
  const { rowCount } = await query(
    `INSERT INTO watchlist (user_id, content_id, status) VALUES ($1, $2, 'plan_to_watch')
     ON CONFLICT (user_id, content_id) DO NOTHING`,
    [userId, contentId],
  )
  if (!rowCount) {
    const { rows } = await query(
      'SELECT status FROM watchlist WHERE user_id = $1 AND content_id = $2',
      [userId, contentId],
    )
    return { added: false, status: rows[0]?.status || 'plan_to_watch' }
  }
  // In the background, as the watchlist endpoints do.
  Promise.all([User.findById(userId), Content.findById(contentId)])
    .then(([user, content]) => {
      const item = user?.watchlist?.find(
        (entry) => String(entry.content?._id || entry.content) === String(contentId),
      )
      if (user && content && item) mirrorWatchlistChange(user, content, item)
    })
    .catch((error) => console.error('Shared title sync failed:', error.message))
  return { added: true, status: 'plan_to_watch' }
}

export default { lookupSharedTitle, addSharedTitle }
