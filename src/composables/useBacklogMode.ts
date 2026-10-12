/**
 * Backlog mode: while on, watchlist saves are for titles watched long ago. They still
 * count toward total watch time, but not toward today on the profile calendar (they
 * land on the start/finish dates if given, otherwise on no day), and they stay out of
 * friends' activity feeds.
 *
 * Kept per device in localStorage and switched off after `BACKLOG_MODE_HOURS`, so a
 * forgotten toggle can't quietly swallow real watching on later days.
 */
import { computed, ref } from 'vue'

const STORAGE_KEY = 'anilounge-backlog-mode'
export const BACKLOG_MODE_HOURS = 12
const LIFETIME_MS = BACKLOG_MODE_HOURS * 3_600_000

/** When backlog mode was turned on (ms since epoch), or null when off. */
const readStart = (): number | null => {
  try {
    const since = Number(localStorage.getItem(STORAGE_KEY))
    return since && Date.now() - since < LIFETIME_MS ? since : null
  } catch {
    return null
  }
}

const since = ref<number | null>(readStart())

const setActive = (value: boolean) => {
  since.value = value ? Date.now() : null
  try {
    if (value) localStorage.setItem(STORAGE_KEY, String(since.value))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage can be unavailable (private mode); the mode still applies for this visit.
  }
}

/**
 * Whether a save made now is a backlog save. Turns the mode off once it has run out.
 * @returns `true` while backlog mode is on.
 */
export function isBacklogSave(): boolean {
  if (since.value !== null && Date.now() - since.value >= LIFETIME_MS) setActive(false)
  return since.value !== null
}

/**
 * Backlog mode state and toggle.
 * @returns `active` and `setActive`.
 */
export function useBacklogMode() {
  const active = computed(() => since.value !== null)
  return { active, setActive }
}
