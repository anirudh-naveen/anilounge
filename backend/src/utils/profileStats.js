/**
 * Watch statistics derived from a user's watchlist.
 *
 * Layer: utils. Pure functions over populated watchlist rows: totals, watch
 * time by month for the trailing year, genre breakdown, and rating spread.
 */

/** Series rows carry no per-episode runtime, so episodes are counted at a typical anime length. */
export const DEFAULT_EPISODE_MINUTES = 24
const MONTHS_SHOWN = 12
const TOP_GENRES = 8
const IGNORED_GENRES = new Set(['animation'])

/**
 * How many full watches a completed row stands for (the first one plus rewatches).
 * @param {{ rewatchCount?: number }} item
 * @returns {number}
 */
function completedWatches(item) {
  return 1 + Math.max(0, Number(item.rewatchCount) || 0)
}

/**
 * Episodes the user has watched for one watchlist row.
 * Completed series count every episode once per watch; in-progress, paused, and
 * dropped rows count `currentEpisode`.
 *
 * @param {{ status: string, currentEpisode?: number, rewatchCount?: number, content: object }} item
 * @returns {number}
 */
export function episodesWatched(item) {
  const content = item.content || {}
  const total = Number(content.episodeCount || content.malEpisodes || 0)
  const current = Number(item.currentEpisode || 0)
  if (item.status === 'completed') return Math.max(total, current, 1) * completedWatches(item)
  if (['watching', 'on_hold', 'dropped'].includes(item.status)) return current
  return 0
}

/**
 * Units one watchlist row stands for: episodes for series (every episode once per
 * watch when completed), whole watches for movies and single-episode specials. The
 * unit of watch history (services/watchEvents.js); `minutesWatched / watchUnits` is
 * the row's minutes per unit.
 * @param {{ status: string, currentEpisode?: number, rewatchCount?: number, content: object }} item
 * @returns {number}
 */
export function watchUnits(item) {
  const content = item.content || {}
  const episodeTotal = Number(content.episodeCount || content.malEpisodes || 0)
  const isSingle =
    content.contentType === 'movie' || (content.contentType === 'special' && episodeTotal <= 1)
  if (isSingle) return item.status === 'completed' ? completedWatches(item) : 0
  return episodesWatched(item)
}

/**
 * Minutes watched for one watchlist row.
 * Movies and single-episode specials use their runtime once completed; series and
 * multi-episode specials multiply episodes by the per-episode runtime (or the default).
 *
 * @param {{ status: string, currentEpisode?: number, content: object }} item
 * @returns {number}
 */
export function minutesWatched(item) {
  const content = item.content || {}
  const runtime = Number(content.runtime || 0)
  const episodeTotal = Number(content.episodeCount || content.malEpisodes || 0)
  const isMovie = content.contentType === 'movie'
  const isSingleSpecial = content.contentType === 'special' && episodeTotal <= 1
  if (isMovie || isSingleSpecial) {
    return item.status === 'completed' ? runtime * completedWatches(item) : 0
  }
  const perEpisode = content.contentType === 'special' && runtime ? runtime : DEFAULT_EPISODE_MINUTES
  return episodesWatched(item) * perEpisode
}

/**
 * `YYYY-MM` key in UTC.
 * @param {Date} date
 * @returns {string}
 */
function monthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * `YYYY-MM-DD` key in UTC.
 * @param {Date} date
 * @returns {string}
 */
function dayKey(date) {
  return date.toISOString().slice(0, 10)
}

/**
 * Aggregate profile statistics.
 * Daily (and monthly) watch time follows each title's watch history: its minutes are
 * shared out over the logged units at the row's minutes per unit. Minutes beyond what
 * the history covers (rows from before it was kept) fall on the row's last update;
 * history beyond the row (progress later lowered) is scaled down to fit.
 *
 * @param {Array<{ status: string, rating?: number|null, currentEpisode?: number, updatedAt?: string|Date, addedAt?: string|Date, content: object }>} watchlist - Rows with `content` populated.
 * @param {Date} [now=new Date()] - Reference point for the trailing 12 months.
 * @param {Map<string, Array<{ day: string, units: number }>>} [history] - Watch history by content id.
 * @returns {{
 *   totals: { titles: number, completed: number, watching: number, planToWatch: number, onHold: number, dropped: number, completedSeries: number, completedMovies: number, episodesWatched: number, minutesWatched: number, averageRating: number|null, ratedCount: number },
 *   monthly: Array<{ month: string, minutes: number }>,
 *   daily: Record<string, number>,
 *   genres: Array<{ name: string, titles: number, minutes: number }>,
 *   ratingDistribution: number[],
 * }}
 */
export function computeProfileStats(watchlist, now = new Date(), history = new Map()) {
  const rows = (watchlist || []).filter((item) => item?.content && typeof item.content === 'object')

  const monthly = []
  for (let offset = MONTHS_SHOWN - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1))
    monthly.push({ month: monthKey(date), minutes: 0 })
  }
  const monthIndex = new Map(monthly.map((entry, index) => [entry.month, index]))
  // Sparse `YYYY-MM-DD` -> minutes over the whole history (UTC, up to today).
  const daily = {}
  const today = dayKey(now)
  const addMinutes = (day, minutes) => {
    if (!day || day > today || !(minutes > 0)) return
    daily[day] = (daily[day] || 0) + minutes
  }

  const totals = {
    titles: rows.length,
    completed: 0,
    watching: 0,
    planToWatch: 0,
    onHold: 0,
    dropped: 0,
    completedSeries: 0,
    completedMovies: 0,
    episodesWatched: 0,
    minutesWatched: 0,
    averageRating: null,
    ratedCount: 0,
  }
  const genreTotals = new Map()
  const ratingDistribution = Array(10).fill(0)
  let ratingSum = 0

  for (const item of rows) {
    const { content } = item
    if (item.status === 'completed') totals.completed += 1
    else if (item.status === 'watching') totals.watching += 1
    else if (item.status === 'on_hold') totals.onHold += 1
    else if (item.status === 'dropped') totals.dropped += 1
    else totals.planToWatch += 1

    if (item.status === 'completed') {
      if (content.contentType === 'tv') totals.completedSeries += 1
      else totals.completedMovies += 1
    }

    const minutes = minutesWatched(item)
    if (content.contentType !== 'movie') totals.episodesWatched += episodesWatched(item)
    totals.minutesWatched += minutes

    if (minutes) {
      const units = watchUnits(item)
      const events = history.get(String(content._id ?? content.id ?? '')) || []
      const logged = events.reduce((sum, event) => sum + event.units, 0)
      const covered = Math.min(logged, units)
      const perUnit = units ? minutes / units : 0
      const scale = logged ? covered / logged : 0
      for (const event of events) addMinutes(event.day, event.units * scale * perUnit)
      const when = new Date(item.updatedAt || item.addedAt || 0)
      if (!Number.isNaN(when.getTime())) addMinutes(dayKey(when), minutes - covered * perUnit)
    }

    if (item.status !== 'plan_to_watch') {
      for (const genre of content.genres || []) {
        const name = typeof genre === 'string' ? genre : genre?.name
        if (!name || IGNORED_GENRES.has(name.toLowerCase())) continue
        const entry = genreTotals.get(name) || { name, titles: 0, minutes: 0 }
        entry.titles += 1
        entry.minutes += minutes
        genreTotals.set(name, entry)
      }
    }

    const rating = Number(item.rating)
    if (rating >= 1 && rating <= 10) {
      ratingDistribution[Math.round(rating) - 1] += 1
      ratingSum += rating
      totals.ratedCount += 1
    }
  }

  for (const [day, minutes] of Object.entries(daily)) {
    daily[day] = Math.round(minutes)
    const index = monthIndex.get(day.slice(0, 7))
    if (index !== undefined) monthly[index].minutes += minutes
  }
  for (const entry of monthly) entry.minutes = Math.round(entry.minutes)

  if (totals.ratedCount) {
    totals.averageRating = Math.round((ratingSum / totals.ratedCount) * 10) / 10
  }

  const genres = [...genreTotals.values()]
    .sort((a, b) => b.minutes - a.minutes || b.titles - a.titles || a.name.localeCompare(b.name))
    .slice(0, TOP_GENRES)

  return { totals, monthly, daily, genres, ratingDistribution }
}
