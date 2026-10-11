/**
 * Photos for people without one (mostly western voice actors and staff from TMDB
 * credits): TMDB's profile photo when it has gained one since, else the person's
 * Wikidata image (a freely licensed photo on Wikimedia Commons). Anime voice actors
 * without a photo have none on AniList or MAL either, so they're left alone.
 *
 * Domain service used by `npm run db:reload -- --phases photos`.
 */
import { query } from '../../config/postgres.js'
import { fetchJson } from '../utils/fetchJson.js'

const TMDB_BASE = 'https://api.themoviedb.org/3'
const WIKIDATA_API = 'https://www.wikidata.org/w/api.php'
/** Wikimedia asks API clients to name themselves. */
const WIKIMEDIA_HEADERS = { 'User-Agent': 'AniLounge/1.0 (https://www.anilounge.net)' }

/**
 * Commons URL for a file name, scaled for a profile picture.
 * @param {string} fileName - e.g. "BenFoster07.jpg"
 * @returns {string}
 */
export function commonsFileUrl(fileName) {
  const name = String(fileName || '')
    .trim()
    .replace(/ /g, '_')
  return name
    ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(name)}?width=400`
    : ''
}

/**
 * The file name in a Wikidata `wbgetclaims` P18 (image) answer.
 * @param {object} body
 * @returns {string}
 */
export function wikidataImageName(body) {
  const claim = (body?.claims?.P18 || []).find((item) => item?.rank !== 'deprecated')
  const value = claim?.mainsnak?.datavalue?.value
  return typeof value === 'string' ? value : ''
}

/**
 * Give people without a photo one, from TMDB then Wikidata.
 * @param {{ limit?: number }} [options]
 * @returns {Promise<{ checked: number, filled: number }>}
 */
export async function fillPersonPhotos({ limit = 1000 } = {}) {
  const apiKey = process.env.TMDB_API_KEY
  if (!apiKey) return { checked: 0, filled: 0 }
  const { rows } = await query(
    `SELECT id::text AS id, tmdb_id FROM content
     WHERE kind = 'voice' AND coalesce(image_path, '') = '' AND tmdb_id IS NOT NULL
     ORDER BY id LIMIT $1`,
    [limit],
  )
  let filled = 0
  for (const row of rows) {
    const { body: person } = await fetchJson(
      `${TMDB_BASE}/person/${row.tmdb_id}?api_key=${encodeURIComponent(apiKey)}&append_to_response=external_ids`,
    )
    let photo = person?.profile_path || ''
    const wikidataId = person?.external_ids?.wikidata_id
    if (!photo && /^Q\d+$/.test(String(wikidataId || ''))) {
      const { body: claims } = await fetchJson(
        `${WIKIDATA_API}?action=wbgetclaims&entity=${wikidataId}&property=P18&format=json`,
        { headers: WIKIMEDIA_HEADERS },
      )
      photo = commonsFileUrl(wikidataImageName(claims))
    }
    if (!photo) continue
    await query(
      `UPDATE content SET image_path = $2, updated_at = now()
       WHERE id = $1 AND coalesce(image_path, '') = ''`,
      [row.id, photo],
    )
    filled += 1
  }
  return { checked: rows.length, filled }
}
