/**
 * navigation.ts — "Back" button behaviour shared by detail pages (utils).
 */

import { nextTick } from 'vue'
import type { RouteLocationRaw, Router } from 'vue-router'
import { catalogLocationFromUrl, isMovieCatalogPath, isTvCatalogPath } from '@/utils/catalogTabs'

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

/** Remembered scroll positions (the content store). */
interface ScrollMemory {
  restoreScrollPosition: (key: string) => boolean
  scrollToTop: () => void
}

/**
 * Back for a title page opened directly: return to the catalog, search, or home page
 * named in its `from` query (restoring that page's scroll), or home.
 * @param router - App router.
 * @param from - The page's `from` query, if any.
 * @param scroll - Where scroll positions are remembered.
 */
export const returnToListing = (router: Router, from: string | undefined, scroll: ScrollMemory) => {
  const goTo = (location: RouteLocationRaw, scrollKey?: string) => {
    const restored = scrollKey ? scroll.restoreScrollPosition(scrollKey) : false
    router.push(location)
    if (!restored) nextTick(() => scroll.scrollToTop())
  }
  if (!from) return goTo('/')

  const url = new URL(from, window.location.origin)
  const { pathname } = url
  if (isMovieCatalogPath(pathname) || isTvCatalogPath(pathname)) {
    const location = catalogLocationFromUrl(isMovieCatalogPath(pathname) ? 'movie' : 'tv', url)
    return goTo({ path: location.path, query: location.query }, location.scrollKey)
  }
  if (pathname === '/search') {
    // Search keeps its page and browse type in the URL.
    const page = url.searchParams.get('page') || '1'
    const type = url.searchParams.get('type')
    return goTo(
      { path: '/search', query: { page, ...(type ? { type } : {}) } },
      `search-page-${page}`,
    )
  }
  if (pathname === '/') return goTo('/', 'home-page')
  if (pathname.startsWith('/movie/') || pathname.startsWith('/tv-show/')) return goTo(from)
  goTo('/')
}
