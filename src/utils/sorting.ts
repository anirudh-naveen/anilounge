/**
 * sorting.ts — catalog sort helpers.
 *
 * Applies relevance, alphabetical, rating, and popularity order to catalog
 * lists used by search, movies, and TV views.
 */

export type SortByOption = 'relevance' | 'alphabetical' | 'rating' | 'popularity'
export type SortDirection = 'asc' | 'desc'

export const DEFAULT_SORT_OPTIONS: { value: SortByOption; label: string }[] = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'alphabetical', label: 'Alphabetical' },
  { value: 'rating', label: 'Rating' },
  { value: 'popularity', label: 'Popularity' },
]

/**
 * Returns a new array sorted by the selected field and direction.
 * Relevance without a getter keeps input order (reversed when ascending).
 * @param items - Catalog items to sort.
 * @param sortBy - Sort field.
 * @param direction - Ascending or descending.
 * @param getTitle - Title used for alphabetical sort.
 * @param getRating - Numeric rating used for rating sort.
 * @param getPopularity - Numeric popularity used for popularity sort.
 * @param getRelevance - Optional score used for relevance sort.
 * @returns A new sorted array; the original is not mutated.
 */
export function applySort<T>(
  items: T[],
  sortBy: SortByOption,
  direction: SortDirection,
  getTitle: (item: T) => string,
  getRating: (item: T) => number,
  getPopularity: (item: T) => number,
  getRelevance?: (item: T) => number,
): T[] {
  const results = [...items]
  const dir = direction === 'asc' ? 1 : -1

  if (sortBy === 'relevance' && !getRelevance) {
    return direction === 'asc' ? results.reverse() : results
  }

  results.sort((a, b) => {
    let cmp = 0
    switch (sortBy) {
      case 'alphabetical':
        cmp = getTitle(a).localeCompare(getTitle(b), undefined, { sensitivity: 'base' })
        break
      case 'rating':
        cmp = getRating(a) - getRating(b)
        break
      case 'popularity':
        cmp = getPopularity(a) - getPopularity(b)
        break
      case 'relevance':
        cmp = (getRelevance?.(a) ?? 0) - (getRelevance?.(b) ?? 0)
        break
    }
    return cmp * dir
  })

  return results
}
