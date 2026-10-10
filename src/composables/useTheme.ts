/**
 * useTheme.ts — site theme preference (composable).
 *
 * Shared state for the Settings appearance picker (App.vue initializes it). The
 * choice runs light → dawn → penumbra → dusk → dark (the default), is saved in
 * localStorage as a display preference, and is applied as `data-theme` on <html>.
 * Settings can preview a theme before saving it. index.html applies the saved
 * theme before first paint so pages do not flash.
 */

import { computed, ref, watch } from 'vue'

export const THEMES = ['light', 'dawn', 'penumbra', 'dusk', 'dark'] as const
export type ThemePreference = (typeof THEMES)[number]

export const THEME_STORAGE_KEY = 'anilounge-theme'
export const DEFAULT_THEME: ThemePreference = 'dark'
/** Browser chrome color (`theme-color` meta) per theme: each theme's navbar. */
const THEME_COLORS: Record<ThemePreference, string> = {
  light: '#152238',
  dawn: '#3a2a3f',
  penumbra: '#283041',
  dusk: '#1a1428',
  dark: '#0b1220',
}

const isTheme = (value: unknown): value is ThemePreference =>
  THEMES.includes(value as ThemePreference)

const readPreference = (): ThemePreference => {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY)
    return isTheme(saved) ? saved : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

const preference = ref<ThemePreference>(readPreference())
/** Theme shown on top of the saved one while Settings previews it. */
const previewed = ref<ThemePreference | null>(null)
const shown = computed(() => previewed.value ?? preference.value)

const applyTheme = (theme: ThemePreference) => {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme])
}

watch(shown, applyTheme, { immediate: true })

/**
 * Theme state and actions.
 * @returns `preference` (saved choice), `shown` (what is on screen), `setPreference`, and `preview`.
 */
export function useTheme() {
  const setPreference = (value: ThemePreference) => {
    preference.value = value
    previewed.value = null
    try {
      localStorage.setItem(THEME_STORAGE_KEY, value)
    } catch {
      // Storage can be unavailable (private mode); the choice still applies for this visit.
    }
  }

  /** Show a theme without saving it; `null` goes back to the saved one. */
  const preview = (value: ThemePreference | null) => {
    previewed.value = value === preference.value ? null : value
  }

  return { preference, shown, setPreference, preview }
}
