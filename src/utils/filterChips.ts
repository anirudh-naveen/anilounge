/**
 * filterChips.ts — multi-select filter chips where every chip starts picked (utils).
 *
 * A row's picks are stored as `[]` while every chip is on (shown as All) and `null` while
 * every chip is off (All switched off). Used by the watchlist's status chips and the
 * forum's post-type chips.
 */

/** A row's picked chips: some of them, `[]` for every chip (All), or `null` for none. */
export type ChipPicks<T extends string> = T[] | null

/**
 * Pick or unpick a chip. Unpicking the last one leaves none (`null`), and picking every
 * chip goes back to All (`[]`).
 * @param picked - The picked chips; empty means all of them, `null` none of them.
 * @param value - The chip clicked.
 * @param all - Every chip in the row.
 */
export function toggleChipOfAll<T extends string>(
  picked: ChipPicks<T>,
  value: T,
  all: readonly T[],
): ChipPicks<T> {
  const current = picked === null ? [] : picked.length ? picked : [...all]
  const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
  if (!next.length) return null
  return all.every((chip) => next.includes(chip)) ? [] : all.filter((chip) => next.includes(chip))
}

/** Whether every chip in the row is picked (All on). */
export const isAllPicked = <T extends string>(picked: ChipPicks<T>) =>
  picked !== null && !picked.length

/** The All toggle: off while every chip is picked (leaving none), else on (every chip). */
export const toggleAllChips = <T extends string>(picked: ChipPicks<T>): ChipPicks<T> =>
  isAllPicked(picked) ? null : []

/** Whether a chip shows as picked (every chip is, while the row is All). */
export const isChipPicked = <T extends string>(picked: ChipPicks<T>, value: T) =>
  picked !== null && (!picked.length || picked.includes(value))
