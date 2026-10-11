/**
 * Extra fields on a title's detail response: tags, key staff, its ids on other sites,
 * and where it sits in its show (a season's series, a series' seasons).
 *
 * Domain service used by `contentController.getContentById`.
 */
import { query } from '../../config/postgres.js'
import { WATCHABLE_KINDS, kindFromContentType } from '../db/kinds.js'

/** Pages on other sites, by id source. */
const EXTERNAL_URLS = {
  mal: (id) => `https://myanimelist.net/anime/${id}`,
  anilist: (id) => `https://anilist.co/anime/${id}`,
  imdb: (id) => `https://www.imdb.com/title/${id}`,
  tvdb: (id) => `https://thetvdb.com/dereferrer/series/${id}`,
  kitsu: (id) => `https://kitsu.app/anime/${id}`,
  anidb: (id) => `https://anidb.net/anime/${id}`,
  livechart: (id) => `https://www.livechart.me/anime/${id}`,
  anime_planet: (id) => `https://www.anime-planet.com/anime/${id}`,
  wikidata: (id) => `https://www.wikidata.org/wiki/${id}`,
}

/**
 * Links to a title on other sites, MAL/AniList/TMDB first.
 * @param {object} content - Content document
 * @param {Array<{ source: string, external_id: string }>} rows - `content_external_ids`
 * @param {number | null} showTmdbId - The season's series' TMDB id
 * @returns {Array<{ source: string, id: string, url: string }>}
 */
export function externalLinks(content, rows, showTmdbId = null) {
  const links = []
  const add = (source, id, url) => {
    if (id) links.push({ source, id: String(id), url })
  }
  add('mal', content.malId, EXTERNAL_URLS.mal(content.malId))
  add('anilist', content.anilistId, EXTERNAL_URLS.anilist(content.anilistId))
  const tmdbId = content.tmdbId || showTmdbId
  const tmdbType = content.contentType === 'movie' ? 'movie' : 'tv'
  add('tmdb', tmdbId, `https://www.themoviedb.org/${tmdbType}/${tmdbId}`)
  for (const row of rows) {
    const url = EXTERNAL_URLS[row.source]?.(row.external_id)
    if (url) add(row.source, row.external_id, url)
  }
  return links
}

/**
 * Attach tags, staff, external links, and show placement to a watchable document.
 * @param {object} content - Content document (mutated)
 * @returns {Promise<object>} `content`
 */
export async function attachTitleDetails(content) {
  const kind = kindFromContentType(content.contentType)
  if (!WATCHABLE_KINDS.includes(kind)) return content
  const id = String(content._id)
  const [tags, staff, ids, show, seasons] = await Promise.all([
    query(
      `SELECT t.name, t.category, ct.rank, ct.is_spoiler FROM content_tags ct
       JOIN tags t ON t.id = ct.tag_id
       WHERE ct.content_id = $1 AND NOT t.is_adult ORDER BY ct.rank DESC, t.name`,
      [id],
    ),
    query(
      `SELECT p.id::text AS id, p.name, p.image_path, sc.role FROM staff_credits sc
       JOIN content p ON p.id = sc.person_id
       WHERE sc.work_id = $1 ORDER BY sc.position, p.name`,
      [id],
    ),
    query('SELECT source, external_id FROM content_external_ids WHERE content_id = $1', [id]),
    kind === 'season'
      ? query(
          `SELECT w.id::text AS id, w.title, w.poster_path, w.tmdb_id FROM works w
           WHERE w.id = $1`,
          [content.seriesId],
        )
      : { rows: [] },
    kind === 'series'
      ? query(
          `SELECT id::text AS id, title, season_label, season_number, part_number, poster_path,
                  release_date, episode_count, airing_status, unified_score
           FROM works WHERE series_id = $1 ORDER BY season_number, part_number`,
          [id],
        )
      : { rows: [] },
  ])

  content.tags = tags.rows.map((row) => ({
    name: row.name,
    category: row.category || '',
    rank: Number(row.rank),
    isSpoiler: Boolean(row.is_spoiler),
  }))
  content.staff = staff.rows.map((row) => ({
    _id: row.id,
    name: row.name,
    imagePath: row.image_path || '',
    role: row.role,
  }))
  const series = show.rows[0]
  content.externalLinks = externalLinks(content, ids.rows, series?.tmdb_id ?? null)
  if (series) {
    content.series = { _id: series.id, title: series.title, posterPath: series.poster_path || '' }
  }
  if (kind === 'series') {
    content.seasons = seasons.rows.map((row) => ({
      _id: row.id,
      title: row.title,
      label: row.season_label || `Season ${row.season_number}`,
      seasonNumber: Number(row.season_number),
      partNumber: Number(row.part_number),
      posterPath: row.poster_path || '',
      releaseDate: row.release_date,
      episodeCount: row.episode_count != null ? Number(row.episode_count) : null,
      airingStatus: row.airing_status,
      unifiedScore: row.unified_score != null ? Number(row.unified_score) : null,
    }))
  }
  return content
}
