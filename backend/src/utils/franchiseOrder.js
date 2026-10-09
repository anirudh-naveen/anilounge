/**
 * Watch order for a franchise's titles: release order, bent so every title comes
 * after its prequels (MAL relations), so a recap or side story released out of
 * sequence still lands after the story it follows.
 */

/**
 * Sort key for a title's release: its release date, else January of its start year.
 * Undated titles sort last.
 * @param {{ releaseDate?: string | Date | null, startSeasonYear?: number | null }} work
 * @returns {number}
 */
export function releaseKey(work) {
  const date = work.releaseDate ? new Date(work.releaseDate).getTime() : NaN
  if (Number.isFinite(date)) return date
  if (work.startSeasonYear) return Date.UTC(Number(work.startSeasonYear), 0, 1)
  return Number.POSITIVE_INFINITY
}

/**
 * @param {{ releaseDate?: string | Date | null, startSeasonYear?: number | null, title?: string }} a
 * @param {{ releaseDate?: string | Date | null, startSeasonYear?: number | null, title?: string }} b
 * @returns {number}
 */
function byRelease(a, b) {
  return releaseKey(a) - releaseKey(b) || String(a.title || '').localeCompare(String(b.title || ''))
}

/**
 * Titles in watch order. `sequel` edges (from → to) put `to` after `from`; `prequel`
 * edges put `to` before `from`. Edges leaving the set are ignored. Among titles whose
 * prequels are all placed, the earliest release goes next; a relation loop falls back
 * to release order for what is left.
 * @template {{ _id: string, releaseDate?: string | Date | null, startSeasonYear?: number | null, title?: string }} T
 * @param {T[]} works
 * @param {{ from_id: string, to_id: string, kind: string }[]} edges
 * @returns {T[]}
 */
export function watchOrder(works, edges) {
  const byId = new Map(works.map((work) => [String(work._id), work]))
  /** id -> ids that must come first */
  const before = new Map(works.map((work) => [String(work._id), new Set()]))
  for (const edge of edges) {
    const from = String(edge.from_id)
    const to = String(edge.to_id)
    if (from === to || !byId.has(from) || !byId.has(to)) continue
    if (edge.kind === 'sequel') before.get(to).add(from)
    else if (edge.kind === 'prequel') before.get(from).add(to)
  }

  const placed = new Set()
  const order = []
  const pending = [...works].sort(byRelease)
  while (pending.length) {
    let index = pending.findIndex((work) =>
      [...before.get(String(work._id))].every((id) => placed.has(id)),
    )
    if (index === -1) index = 0
    const [next] = pending.splice(index, 1)
    placed.add(String(next._id))
    order.push(next)
  }
  return order
}
