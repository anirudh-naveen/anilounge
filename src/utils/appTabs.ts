/**
 * appTabs.ts — the app layout's bottom tab bar sections (utils).
 *
 * Each tab's root page fills the top bar itself (AppBar.vue); any other page gets a
 * back button there instead.
 */

import type { RouteLocationNormalizedLoaded } from 'vue-router'
import { FORUM_HOME } from '@/utils/forum'

export type AppTabName = 'home' | 'forum' | 'watchlist' | 'search' | 'profile'

export interface AppTab {
  name: AppTabName
  label: string
  to: string
  /** Icon strokes on a 24×24 grid (the profile tab shows the avatar instead). */
  paths: string[]
}

export const APP_TABS: AppTab[] = [
  {
    name: 'home',
    label: 'Home',
    to: '/',
    paths: ['M3 10.5 12 3l9 7.5V20a1.5 1.5 0 0 1-1.5 1.5H15v-6H9v6H4.5A1.5 1.5 0 0 1 3 20V10.5Z'],
  },
  {
    name: 'forum',
    label: 'Forum',
    to: FORUM_HOME,
    paths: [
      'M4.5 3.5h10A1.5 1.5 0 0 1 16 5v7a1.5 1.5 0 0 1-1.5 1.5H9L5 17v-3.5h-.5A1.5 1.5 0 0 1 3 12V5a1.5 1.5 0 0 1 1.5-1.5Z',
      'M16 8h3.5A1.5 1.5 0 0 1 21 9.5v7a1.5 1.5 0 0 1-1.5 1.5H19v3l-4-3H9.5A1.5 1.5 0 0 1 8 16.5v-3',
    ],
  },
  { name: 'profile', label: 'Profile', to: '/profile', paths: [] },
  {
    name: 'watchlist',
    label: 'Watchlist',
    to: '/watchlist',
    paths: [
      'M7 3.75h10A1.75 1.75 0 0 1 18.75 5.5v15.1L12 16.75 5.25 20.6V5.5A1.75 1.75 0 0 1 7 3.75Z',
    ],
  },
  {
    name: 'search',
    label: 'Search',
    to: '/search',
    paths: ['m16 16 4.25 4.25'],
  },
]

const TAB_ROUTES: Record<string, AppTabName> = {
  home: 'home',
  forum: 'forum',
  watchlist: 'watchlist',
  search: 'search',
  profile: 'profile',
}

/** The tab whose root page is open, or null on any other page. */
export function appTabFor(route: Pick<RouteLocationNormalizedLoaded, 'name'>): AppTabName | null {
  return TAB_ROUTES[String(route.name ?? '')] ?? null
}
