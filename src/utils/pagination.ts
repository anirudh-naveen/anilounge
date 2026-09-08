const DEFAULT_VISIBLE_PAGES = 7

export type PaginationItem = number | 'ellipsis'

export function getVisiblePages(
  currentPage: number,
  totalPages: number,
  count = DEFAULT_VISIBLE_PAGES,
): number[] {
  if (totalPages <= 0) return []

  const current = Math.min(Math.max(1, currentPage), totalPages)

  if (totalPages <= count) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }

  const pages = new Set<number>([1, totalPages, current])
  pages.add(current - 2)
  pages.add(current - 1)
  pages.add(current + 1)
  pages.add(current + 2)

  for (const page of [...pages]) {
    if (page < 1 || page > totalPages) pages.delete(page)
  }

  let offset = 3
  while (pages.size < count) {
    const sizeBefore = pages.size
    const before = current - offset
    const after = current + offset

    if (before > 1) pages.add(before)
    if (pages.size >= count) break
    if (after < totalPages) pages.add(after)
    if (pages.size === sizeBefore) break

    offset++
  }

  return [...pages].sort((a, b) => a - b)
}

export function getPaginationItems(
  currentPage: number,
  totalPages: number,
  count = DEFAULT_VISIBLE_PAGES,
): PaginationItem[] {
  const pages = getVisiblePages(currentPage, totalPages, count)
  const items: PaginationItem[] = []

  for (let i = 0; i < pages.length; i++) {
    if (i > 0 && pages[i] - pages[i - 1] > 1) {
      items.push('ellipsis')
    }
    items.push(pages[i])
  }

  return items
}
