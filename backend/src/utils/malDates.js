/**
 * malDates.js — parse MAL `start_date` / `end_date` strings.
 *
 * Utils layer: MAL often returns partial dates (`2011`, `2011-07`, or `2011-07-16`).
 */

/**
 * Parse a MAL date string into a UTC Date.
 * @param {string} [value]
 * @param {{ bound?: 'start' | 'end' }} [options] - Partial dates use the start or end of that month/year.
 * @returns {Date | null}
 */
export function parseMalDate(value, { bound = 'start' } = {}) {
  if (!value || typeof value !== 'string') return null
  const trimmed = value.trim()

  const full = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed)
  if (full) {
    return new Date(Date.UTC(Number(full[1]), Number(full[2]) - 1, Number(full[3])))
  }

  const yearMonth = /^(\d{4})-(\d{2})$/.exec(trimmed)
  if (yearMonth) {
    const year = Number(yearMonth[1])
    const month = Number(yearMonth[2]) - 1
    if (bound === 'end') return new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999))
    return new Date(Date.UTC(year, month, 1))
  }

  const yearOnly = /^(\d{4})$/.exec(trimmed)
  if (yearOnly) {
    const year = Number(yearOnly[1])
    if (bound === 'end') return new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999))
    return new Date(Date.UTC(year, 0, 1))
  }

  return null
}
