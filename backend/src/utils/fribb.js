/**
 * Fribb's anime-lists (github.com/Fribb/anime-lists): one entry per MAL/AniList anime
 * with its ids on other sites (Kitsu, AniDB, LiveChart, Anime-Planet, TVDB, IMDb)
 * and the TMDB show, season, and episode offset it is part of.
 *
 * Utils layer: pure. services/fribbService.js downloads the list.
 */

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function positive(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

/**
 * One list entry, normalized.
 * @param {object} entry
 * @returns {{ malId: number | null, anilistId: number | null, externalIds: Record<string, string>,
 *   tmdbTvId: number | null, tmdbMovieId: number | null, tmdbSeason: number | null,
 *   tmdbOffset: number, tvdbSeason: number | null, tvdbOffset: number }}
 */
export function mapFribbEntry(entry) {
  const ids = {
    kitsu: positive(entry.kitsu_id),
    anidb: positive(entry.anidb_id),
    livechart: positive(entry.livechart_id),
    anime_planet: typeof entry['anime-planet_id'] === 'string' ? entry['anime-planet_id'] : null,
    tvdb: positive(entry.tvdb_id),
    imdb: Array.isArray(entry.imdb_id) ? entry.imdb_id[0] : entry.imdb_id,
  }
  const tmdb = entry.themoviedb_id
  return {
    malId: positive(entry.mal_id),
    anilistId: positive(entry.anilist_id),
    externalIds: Object.fromEntries(
      Object.entries(ids)
        .filter(([, id]) => id != null && id !== '')
        .map(([site, id]) => [site, String(id)]),
    ),
    tmdbTvId: positive(typeof tmdb === 'object' ? tmdb?.tv : null),
    tmdbMovieId: positive(typeof tmdb === 'object' ? tmdb?.movie : null),
    tmdbSeason: positive(entry.season?.tmdb),
    tmdbOffset: positive(entry.episode_offset?.tmdb) || 0,
    // TVDB numbers seasons the way fans count them (a split cour stays one season).
    tvdbSeason: positive(entry.season?.tvdb),
    tvdbOffset: positive(entry.episode_offset?.tvdb) || 0,
  }
}

/**
 * Index the list by MAL and AniList id, and group entries by the TMDB show they're on.
 * @param {object[]} list
 * @returns {{ byMal: Map<number, object>, byAnilist: Map<number, object>, byTmdbTv: Map<number, object[]> }}
 */
export function indexFribb(list) {
  const byMal = new Map()
  const byAnilist = new Map()
  const byTmdbTv = new Map()
  for (const raw of Array.isArray(list) ? list : []) {
    const entry = mapFribbEntry(raw)
    if (entry.malId && !byMal.has(entry.malId)) byMal.set(entry.malId, entry)
    if (entry.anilistId && !byAnilist.has(entry.anilistId)) byAnilist.set(entry.anilistId, entry)
    if (entry.tmdbTvId)
      byTmdbTv.set(entry.tmdbTvId, [...(byTmdbTv.get(entry.tmdbTvId) || []), entry])
  }
  return { byMal, byAnilist, byTmdbTv }
}

/**
 * MAL and AniList ids of the other entries Fribb puts on the same TMDB show as `entry`
 * (the show's other seasons).
 * @param {{ byTmdbTv?: Map<number, object[]> } | null} index
 * @param {object | null} entry - From `fribbEntryFor`
 * @returns {{ malIds: number[], anilistIds: number[] }}
 */
export function fribbSiblingIds(index, entry) {
  const siblings = (entry?.tmdbTvId && index?.byTmdbTv?.get(entry.tmdbTvId)) || []
  const others = siblings.filter(
    (other) => other.malId !== entry.malId || other.anilistId !== entry.anilistId,
  )
  return {
    malIds: others.map((other) => other.malId).filter(Boolean),
    anilistIds: others.map((other) => other.anilistId).filter(Boolean),
  }
}

/**
 * The entry for a row, by MAL id then AniList id.
 * @param {{ byMal: Map<number, object>, byAnilist: Map<number, object> } | null} index
 * @param {{ malId?: number | null, anilistId?: number | null }} row
 * @returns {object | null}
 */
export function fribbEntryFor(index, row) {
  if (!index) return null
  return index.byMal.get(Number(row.malId)) || index.byAnilist.get(Number(row.anilistId)) || null
}

/**
 * Where a season sits on TMDB per Fribb, when that fits TMDB's own seasons: the
 * season exists and has episodes past the offset. Fribb can run ahead of TMDB (a
 * "season 2" TMDB still lists as episodes 26+ of season 1), so a mapping that
 * doesn't fit is ignored.
 * @param {object | null} entry - From `fribbEntryFor`
 * @param {number} seriesTmdbId
 * @param {{ seasonNumber: number, episodeCount?: number }[]} tmdbSeasons
 * @returns {{ tmdbSeasonNumber: number, tmdbEpisodeOffset: number } | null}
 */
export function fribbTmdbPlacement(entry, seriesTmdbId, tmdbSeasons) {
  if (!entry?.tmdbSeason || entry.tmdbTvId !== Number(seriesTmdbId)) return null
  const season = tmdbSeasons.find((item) => item.seasonNumber === entry.tmdbSeason)
  if (!season || !(Number(season.episodeCount) > entry.tmdbOffset)) return null
  return { tmdbSeasonNumber: entry.tmdbSeason, tmdbEpisodeOffset: entry.tmdbOffset }
}
