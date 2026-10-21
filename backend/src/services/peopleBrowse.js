/**
 * Search's Characters and Voice Actors tabs: one page of trending people by default,
 * else search, filter, and sort over everyone stored.
 *
 * Layer: domain service used by `entityController.browseEntities`. Reads only the
 * database. Trending characters are the main characters of the most popular titles
 * (by catalog score, a series through its seasons); trending voice actors are who
 * voices them. "Popularity" is the AniList favourites count stored in a character's
 * appearance importance (utils/entities.js `characterImportanceScore`).
 */

import { query, withReplica } from '../../config/postgres.js'
import { escapeLike } from '../db/mongoFilter.js'
import { characterPortraitPath } from '../utils/entities.js'

export const PEOPLE_PAGE_SIZE = 24
const TRENDING_TITLES = 40
const MAX_PAGE = 500
const ROLES = ['main', 'supporting', 'cameo']
const MEDIA_KINDS = { movie: ['movie', 'special'], series: ['series', 'season'] }
const CHARACTER_SORTS = ['popularity', 'titles', 'favorites', 'name']
const VOICE_SORTS = ['popularity', 'roles', 'favorites', 'name']
const LANGUAGES_TTL_MS = 60 * 60 * 1000

let languagesCache = { at: 0, value: [] }

/** The most popular titles, a series standing for itself and its seasons. */
const TRENDING_WORKS = `
  trending AS (
    SELECT id, row_number() OVER (ORDER BY catalog_score DESC, id) AS rank FROM content
    WHERE kind IN ('movie', 'series', 'special')
    ORDER BY catalog_score DESC, id LIMIT ${TRENDING_TITLES}
  ),
  trending_works AS (
    SELECT t.rank, t.id AS work_id FROM trending t
    UNION ALL
    SELECT t.rank, sn.content_id FROM trending t JOIN seasons sn ON sn.series_id = t.id
  )`

/**
 * @param {Record<string, unknown>} raw - Request query.
 * @param {'character' | 'voice_actor'} type
 * @returns {{ q: string, role: string | null, media: string | null, language: string | null,
 *   sort: string, direction: 'asc' | 'desc', page: number }}
 */
export function parseBrowseQuery(raw, type) {
  const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '')
  const sorts = type === 'voice_actor' ? VOICE_SORTS : CHARACTER_SORTS
  const sort = sorts.includes(raw.sort) ? raw.sort : 'popularity'
  const defaultDirection = sort === 'name' ? 'asc' : 'desc'
  const page = Math.min(MAX_PAGE, Math.max(1, parseInt(String(raw.page), 10) || 1))
  return {
    q: text(raw.q, 100),
    role: type === 'character' && ROLES.includes(raw.role) ? raw.role : null,
    media: type === 'character' && MEDIA_KINDS[raw.media] ? raw.media : null,
    language: type === 'voice_actor' ? text(raw.language, 40) || null : null,
    sort,
    direction:
      raw.direction === 'asc' || raw.direction === 'desc' ? raw.direction : defaultDirection,
    page,
  }
}

/**
 * Whether a parsed query asks for nothing but the default view (the trending page).
 * @param {ReturnType<typeof parseBrowseQuery>} parsed
 * @returns {boolean}
 */
export function isTrendingQuery(parsed) {
  return (
    !parsed.q &&
    !parsed.role &&
    !parsed.media &&
    !parsed.language &&
    parsed.sort === 'popularity' &&
    parsed.direction === 'desc'
  )
}

/**
 * @param {'character' | 'voice_actor'} type
 * @param {Record<string, unknown>} raw - Request query (`q`, `role`, `media`,
 *   `language`, `sort`, `direction`, `page`).
 * @returns {Promise<{ items: object[], page: number, pageSize: number, total: number,
 *   trending: boolean, languages?: string[] }>}
 */
export async function browsePeople(type, raw = {}) {
  const parsed = parseBrowseQuery(raw, type)
  const trending = isTrendingQuery(parsed)
  const result =
    type === 'voice_actor'
      ? trending
        ? await trendingVoices()
        : await searchVoices(parsed)
      : trending
        ? await trendingCharacters()
        : await searchCharacters(parsed)
  return {
    ...result,
    page: trending ? 1 : parsed.page,
    pageSize: PEOPLE_PAGE_SIZE,
    trending,
    ...(type === 'voice_actor' ? { languages: await voiceLanguages() } : {}),
  }
}

/**
 * @param {object} row
 * @returns {object} Card for a character.
 */
function characterCard(row) {
  return {
    _id: row.id,
    entityType: 'character',
    name: row.name,
    imagePath: characterPortraitPath(row.image_path),
    subtitle: row.work_name || '',
    titleCount: Number(row.works) || 0,
  }
}

/**
 * @param {object} row
 * @returns {object} Card for a voice actor.
 */
function voiceCard(row) {
  return {
    _id: row.id,
    entityType: 'voice_actor',
    name: row.name,
    imagePath: row.image_path || '',
    subtitle: row.character_name || '',
    languages: (row.languages || []).filter(Boolean),
    roleCount: Number(row.roles) || 0,
  }
}

async function trendingCharacters() {
  const { rows } = await withReplica(() =>
    query(
      `WITH ${TRENDING_WORKS}
       SELECT c.id::text AS id, c.name, c.image_path,
              (array_agg(w.name ORDER BY tw.rank))[1] AS work_name,
              count(DISTINCT a.work_id)::int AS works
       FROM trending_works tw
       JOIN appearances a ON a.work_id = tw.work_id AND a.role = 'main'
       JOIN content c ON c.id = a.character_id
       JOIN content w ON w.id = tw.work_id
       GROUP BY c.id, c.name, c.image_path
       ORDER BY min(tw.rank), max(a.importance) DESC, c.name
       LIMIT ${PEOPLE_PAGE_SIZE}`,
    ),
  )
  return { items: rows.map(characterCard), total: rows.length }
}

async function trendingVoices() {
  const { rows } = await withReplica(() =>
    query(
      `WITH ${TRENDING_WORKS}
       SELECT p.id::text AS id, p.name, p.image_path,
              (array_agg(ch.name ORDER BY tw.rank, a.importance DESC))[1] AS character_name,
              array_agg(DISTINCT vc.language) AS languages,
              count(DISTINCT a.character_id)::int AS roles
       FROM trending_works tw
       JOIN appearances a ON a.work_id = tw.work_id AND a.role = 'main'
       JOIN voice_credits vc ON vc.appearance_id = a.id
       JOIN content p ON p.id = vc.voice_id
       JOIN content ch ON ch.id = a.character_id
       GROUP BY p.id, p.name, p.image_path
       ORDER BY min(tw.rank), count(DISTINCT a.character_id) DESC, p.name
       LIMIT ${PEOPLE_PAGE_SIZE}`,
    ),
  )
  return { items: rows.map(voiceCard), total: rows.length }
}

/**
 * WHERE clause matching a name, its English and native forms, and aliases.
 * @param {string} alias - Table alias of the content row.
 * @param {string} extraName - Column with the English name.
 * @param {string} param - Placeholder holding the LIKE pattern.
 * @returns {string}
 */
function nameMatch(alias, extraName, param) {
  return `(${alias}.name ILIKE ${param} OR ${alias}.native_name ILIKE ${param}
    OR ${extraName} ILIKE ${param}
    OR EXISTS (SELECT 1 FROM content_akas k WHERE k.content_id = ${alias}.id AND k.name ILIKE ${param}))`
}

const FAVORITES = (alias) =>
  `(SELECT count(*) FROM favorites f WHERE f.content_id = ${alias}.id)::int`

async function searchCharacters({ q, role, media, sort, direction, page }) {
  const params = []
  const where = []
  if (q) where.push(nameMatch('c', 'ch.english_name', `$${params.push(`%${escapeLike(q)}%`)}`))
  if (role) {
    where.push(`EXISTS (SELECT 1 FROM appearances x WHERE x.character_id = c.id
      AND x.role = $${params.push(role)})`)
  }
  if (media) {
    where.push(`EXISTS (SELECT 1 FROM appearances x JOIN content xw ON xw.id = x.work_id
      WHERE x.character_id = c.id AND xw.kind = ANY($${params.push(MEDIA_KINDS[media])}::text[]))`)
  }
  const filter = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const dir = direction === 'asc' ? 'ASC' : 'DESC'
  const order = {
    popularity: `max(a.importance % 1000000) ${dir} NULLS LAST`,
    titles: `count(DISTINCT a.work_id) ${dir}`,
    favorites: `${FAVORITES('c')} ${dir}`,
    name: `c.name ${dir}`,
  }[sort]
  const [{ rows }, count] = await withReplica(() =>
    Promise.all([
      query(
        `SELECT c.id::text AS id, c.name, c.image_path,
                (array_agg(w.name ORDER BY w.catalog_score DESC NULLS LAST))[1] AS work_name,
                count(DISTINCT a.work_id)::int AS works
         FROM content c
         JOIN characters ch ON ch.content_id = c.id
         LEFT JOIN appearances a ON a.character_id = c.id
         LEFT JOIN content w ON w.id = a.work_id
         ${filter}
         GROUP BY c.id, c.name, c.image_path
         ORDER BY ${order}, c.name, c.id
         LIMIT ${PEOPLE_PAGE_SIZE} OFFSET ${(page - 1) * PEOPLE_PAGE_SIZE}`,
        params,
      ),
      query(
        `SELECT count(*)::int AS n FROM content c JOIN characters ch ON ch.content_id = c.id ${filter}`,
        params,
      ),
    ]),
  )
  return { items: rows.map(characterCard), total: count.rows[0].n }
}

async function searchVoices({ q, language, sort, direction, page }) {
  const params = []
  const where = []
  if (q) where.push(nameMatch('p', 'v.english_name', `$${params.push(`%${escapeLike(q)}%`)}`))
  if (language) {
    where.push(`EXISTS (SELECT 1 FROM voice_credits x WHERE x.voice_id = p.id
      AND x.language ILIKE $${params.push(escapeLike(language))})`)
  }
  const filter = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const dir = direction === 'asc' ? 'ASC' : 'DESC'
  const order = {
    popularity: `count(DISTINCT a.character_id) FILTER (WHERE a.role = 'main') ${dir}`,
    roles: `count(DISTINCT a.character_id) ${dir}`,
    favorites: `${FAVORITES('p')} ${dir}`,
    name: `p.name ${dir}`,
  }[sort]
  const [{ rows }, count] = await withReplica(() =>
    Promise.all([
      query(
        `SELECT p.id::text AS id, p.name, p.image_path,
                (array_agg(ch.name ORDER BY a.importance DESC NULLS LAST))[1] AS character_name,
                array_agg(DISTINCT vc.language) AS languages,
                count(DISTINCT a.character_id)::int AS roles
         FROM content p
         JOIN voices v ON v.content_id = p.id
         LEFT JOIN voice_credits vc ON vc.voice_id = p.id
         LEFT JOIN appearances a ON a.id = vc.appearance_id
         LEFT JOIN content ch ON ch.id = a.character_id
         ${filter}
         GROUP BY p.id, p.name, p.image_path
         ORDER BY ${order}, p.name, p.id
         LIMIT ${PEOPLE_PAGE_SIZE} OFFSET ${(page - 1) * PEOPLE_PAGE_SIZE}`,
        params,
      ),
      query(
        `SELECT count(*)::int AS n FROM content p JOIN voices v ON v.content_id = p.id ${filter}`,
        params,
      ),
    ]),
  )
  return { items: rows.map(voiceCard), total: count.rows[0].n }
}

/**
 * Dub languages with voice credits, most credited first (for the language filter).
 * @returns {Promise<string[]>}
 */
async function voiceLanguages() {
  if (Date.now() - languagesCache.at < LANGUAGES_TTL_MS) return languagesCache.value
  const { rows } = await withReplica(() =>
    query(
      `SELECT language FROM voice_credits WHERE language IS NOT NULL AND language <> 'Unknown'
       GROUP BY language ORDER BY count(*) DESC LIMIT 20`,
    ),
  )
  languagesCache = { at: Date.now(), value: rows.map((row) => row.language) }
  return languagesCache.value
}
