/**
 * Grouping a catalog's TV rows into shows for the series migration
 * (scripts/restructureSeries.js). TMDB-linked shows are planned first
 * (utils/seasonPlan.js `planTmdbShow`); this places the anime TV rows those plans
 * left out: a sequel of a planned show (an announced season TMDB has no episodes for
 * yet) joins it as its next season, and the rest form shows from their sequel/prequel
 * chains.
 *
 * Utils layer: pure.
 */
import { contentSeason } from './titles.js'
import { planChainShow } from './seasonPlan.js'

/**
 * @param {unknown} value
 * @returns {number}
 */
function time(value) {
  const parsed = value ? new Date(value).getTime() : NaN
  return Number.isFinite(parsed) ? parsed : Infinity
}

/**
 * Place the rows no TMDB plan claimed.
 * @param {{
 *   groups: { seasons: { contentId: string, seasonNumber: number, partNumber: number }[] }[],
 *   rows: { _id: string, releaseDate?: unknown, title?: string }[],
 *   edges: { fromId: string, toId: string }[],
 * }} input - `groups`: planned shows (mutated: sequels are appended to their seasons);
 *   `rows`: unclaimed anime TV rows; `edges`: sequel/prequel links between TV rows.
 * @returns {{ appended: number, chains: { seasons: object[] }[] }} New shows from chains.
 */
export function groupRemaining({ groups, rows, edges }) {
  const unclaimed = new Map(rows.map((row) => [String(row._id), row]))
  const groupOf = new Map()
  for (const group of groups) {
    for (const season of group.seasons) groupOf.set(String(season.contentId), group)
  }
  const neighbours = new Map()
  for (const { fromId, toId } of edges) {
    for (const [a, b] of [
      [String(fromId), String(toId)],
      [String(toId), String(fromId)],
    ]) {
      if (!neighbours.has(a)) neighbours.set(a, new Set())
      neighbours.get(a).add(b)
    }
  }

  // Sequels of planned shows, nearest first, until no more join.
  let appended = 0
  for (let changed = true; changed; ) {
    changed = false
    const joining = [...unclaimed.values()]
      .map((row) => {
        const linked = [...(neighbours.get(String(row._id)) || [])]
          .map((id) => groupOf.get(id))
          .filter(Boolean)
        return { row, group: linked[0] }
      })
      .filter(({ group }) => group)
      .sort((left, right) => time(left.row.releaseDate) - time(right.row.releaseDate))
    for (const { row, group } of joining) {
      const last = group.seasons.at(-1)
      const named = contentSeason(row)
      const continues = named.part > 1
      const seasonNumber = continues ? last.seasonNumber : last.seasonNumber + 1
      const partNumber = continues ? named.part : 1
      group.seasons.push({
        contentId: String(row._id),
        seasonNumber,
        partNumber,
        label:
          partNumber > 1 ? `Season ${seasonNumber} Part ${partNumber}` : `Season ${seasonNumber}`,
        tmdbSeasonNumber: null,
        tmdbEpisodeOffset: 0,
      })
      groupOf.set(String(row._id), group)
      unclaimed.delete(String(row._id))
      appended += 1
      changed = true
    }
  }

  // The rest: one show per sequel/prequel chain.
  const chains = []
  const seen = new Set()
  for (const id of unclaimed.keys()) {
    if (seen.has(id)) continue
    const component = []
    const stack = [id]
    seen.add(id)
    while (stack.length) {
      const current = stack.pop()
      component.push(unclaimed.get(current))
      for (const next of neighbours.get(current) || []) {
        if (unclaimed.has(next) && !seen.has(next)) {
          seen.add(next)
          stack.push(next)
        }
      }
    }
    chains.push({
      seasons: planChainShow(component).map((season) => ({
        ...season,
        tmdbSeasonNumber: null,
        tmdbEpisodeOffset: 0,
      })),
    })
  }
  return { appended, chains }
}

/**
 * Make each season's (season, part) unique within its show. Two rows can claim the
 * same place (the catalog storing one cour twice under two MAL ids); a later one moves
 * to the next free part of its season and is reported for review.
 * @param {{ seasons: { contentId: string, seasonNumber: number, partNumber?: number,
 *   label?: string }[] }} show - Mutated
 * @returns {string[]} Content ids that moved.
 */
export function dedupeSeasonNumbers(show) {
  const parts = new Map()
  const moved = []
  for (const season of show.seasons) {
    const used = parts.get(season.seasonNumber) || new Set()
    const part = season.partNumber || 1
    if (used.has(part)) {
      const next = Math.max(...used) + 1
      season.partNumber = next
      season.label = `Season ${season.seasonNumber} Part ${next}`
      moved.push(season.contentId)
    }
    used.add(season.partNumber || 1)
    parts.set(season.seasonNumber, used)
  }
  return moved
}

const PLAIN_LABEL = /^season \d+( part \d+)?$/i

/**
 * Number a show's seasons the way fans count them, from TVDB's season numbers in
 * Fribb's anime-lists: rows in one TVDB season are its parts, in episode order (Attack
 * on Titan's Final Season, Part 2, and Kanketsu-hen are season 4 parts 1-3). Rows the
 * list doesn't know follow as further seasons, in airing order. A season starting a
 * TMDB season keeps TMDB's name ("Stone Wars") as its label.
 * @param {{ seasons: object[] }} show - Mutated: seasons renumbered and sorted
 * @param {(contentId: string) => { tvdbSeason?: number | null, tvdbOffset?: number } | null} entryFor
 * @returns {boolean} Whether the list numbered any season.
 */
export function renumberByTvdb(show, entryFor) {
  const placed = []
  const rest = []
  for (const season of show.seasons) {
    const entry = entryFor(season.contentId)
    if (entry?.tvdbSeason) placed.push({ season, entry })
    else rest.push(season)
  }
  if (!placed.length) return false
  placed.sort(
    (left, right) =>
      left.entry.tvdbSeason - right.entry.tvdbSeason ||
      (left.entry.tvdbOffset || 0) - (right.entry.tvdbOffset || 0),
  )
  const label = (season, number, part, keep) =>
    keep && season.label && !PLAIN_LABEL.test(season.label)
      ? season.label
      : part > 1
        ? `Season ${number} Part ${part}`
        : `Season ${number}`
  const parts = new Map()
  for (const { season, entry } of placed) {
    const part = (parts.get(entry.tvdbSeason) || 0) + 1
    parts.set(entry.tvdbSeason, part)
    season.label = label(season, entry.tvdbSeason, part, part === 1 && !season.tmdbEpisodeOffset)
    season.seasonNumber = entry.tvdbSeason
    season.partNumber = part
  }
  let last = Math.max(...parts.keys())
  for (const season of rest) {
    last += 1
    season.seasonNumber = last
    season.partNumber = 1
    season.label = label(season, last, 1, !season.tmdbEpisodeOffset)
  }
  show.seasons = [...placed.map(({ season }) => season), ...rest]
  return true
}
