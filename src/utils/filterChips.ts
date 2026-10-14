/**
 * filterChips.ts — multi-select filter chips where every chip starts picked (utils).
 *
 * A row's picks are stored as `[]` while every chip is on (shown as All). Used by the
 * watchlist's status chips and the forum's post-type chips.
 */

/**
 * Pick or unpick a chip. The last picked chip can't be unpicked, and picking every chip
 * goes back to All (`[]`).
 * @param picked - The picked chips; empty means all of them.
 * @param value - The chip clicked.
 * @param all - Every chip in the row.
 */
export function toggleChipOfAll<T extends string>(picked: T[], value: T, all: readonly T[]): T[] {
  const current = picked.length ? picked : [...all]
  if (current.includes(value) && current.length === 1) return picked
  const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
  return all.every((chip) => next.includes(chip)) ? [] : all.filter((chip) => next.includes(chip))
}

/** Whether a chip shows as picked (every chip is, while the row is All). */
export const isChipPicked = <T extends string>(picked: T[], value: T) =>
  !picked.length || picked.includes(value)
