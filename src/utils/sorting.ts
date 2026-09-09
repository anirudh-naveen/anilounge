export type SortByOption = 'relevance' | 'alphabetical' | 'rating' | 'popularity'
export type SortDirection = 'asc' | 'desc'

export const DEFAULT_SORT_OPTIONS: { value: SortByOption; label: string }[] = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'alphabetical', label: 'Alphabetical' },
  { value: 'rating', label: 'Rating' },
  { value: 'popularity', label: 'Popularity' },
]

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
