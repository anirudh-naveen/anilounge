/**
 * useTheme.ts — light/dark theme preference (composable).
 *
 * Shared state for the navbar toggle and the Settings appearance picker. The
 * choice is `light`, `dark`, or `system` (follows the OS), saved in localStorage
 * as a display preference, and applied as `data-theme` on <html>. index.html
 * applies the saved theme before first paint so pages do not flash.
 */

import { computed, ref, watch } from 'vue'

export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'anilounge-theme'
const THEME_COLORS: Record<ResolvedTheme, string> = { light: '#152238', dark: '#0b1220' }

const readPreference = (): ThemePreference => {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY)
    return saved === 'light' || saved === 'dark' ? saved : 'system'
  } catch {
    return 'system'
  }
}

const darkQuery =
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null

const preference = ref<ThemePreference>(readPreference())
const systemPrefersDark = ref(Boolean(darkQuery?.matches))
darkQuery?.addEventListener?.('change', (event) => {
  systemPrefersDark.value = event.matches
})

const resolved = computed<ResolvedTheme>(() =>
  preference.value === 'system' ? (systemPrefersDark.value ? 'dark' : 'light') : preference.value,
)

const applyTheme = (theme: ResolvedTheme) => {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme])
}

watch(resolved, applyTheme, { immediate: true })

/**
 * Theme state and actions.
 * @returns `preference` (saved choice), `resolved` (what is shown), `setPreference`, and `toggle`.
 */
export function useTheme() {
  const setPreference = (value: ThemePreference) => {
    preference.value = value
    try {
      if (value === 'system') localStorage.removeItem(THEME_STORAGE_KEY)
      else localStorage.setItem(THEME_STORAGE_KEY, value)
    } catch {
      // Storage can be unavailable (private mode); the choice still applies for this visit.
    }
  }

  /** Flip between light and dark (saves an explicit choice). */
  const toggle = () => setPreference(resolved.value === 'dark' ? 'light' : 'dark')

  return { preference, resolved, setPreference, toggle }
}
