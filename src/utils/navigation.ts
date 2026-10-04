/**
 * navigation.ts — "Back" button behaviour shared by detail pages (utils).
 */

import type { Router } from 'vue-router'

/**
 * Whether the previous history entry is a page of this app. Vue Router records
 * it as `history.state.back`; it is null on a page opened from a link, a new
 * tab, or the home-screen icon.
 */
export const hasInAppHistory = (): boolean =>
  typeof window !== 'undefined' && Boolean(window.history.state?.back)

/**
 * Return to the page the user came from, keeping its scroll position. Pages
 * opened directly (nothing to go back to) run `fallback` instead.
 */
export const goBackOr = (router: Router, fallback: () => void): void => {
  if (hasInAppHistory()) router.back()
  else fallback()
}
