/**
 * catalogTabs.ts — TV catalog tab helpers.
 *
 * Tab ids, labels, and `/tv` query/path builders used by the TV Shows page
 * and detail-view back navigation.
 */

export const TV_CATALOG_TABS = [
  {
    id: 'popular',
    label: 'Popular Right Now',
    subtitle: 'Discover amazing animated series from around the world',
    emptyTitle: 'No TV shows found',
    emptyBody: "We couldn't find any animated TV shows at the moment.",
  },
  {
    id: 'airing',
    label: 'Currently Airing',
    subtitle: 'Series broadcasting new episodes right now',
    emptyTitle: 'No currently airing shows',
    emptyBody: 'Nothing is marked as currently airing right now. Check back soon.',
  },
  {
    id: 'upcoming',
    label: 'Upcoming Highlights',
    subtitle: 'Most anticipated series yet to premiere',
    emptyTitle: 'No upcoming highlights',
    emptyBody: 'No unreleased series to highlight right now. Check back soon.',
  },
] as const

export type TvCatalogTab = (typeof TV_CATALOG_TABS)[number]['id']

const TAB_IDS = new Set<string>(TV_CATALOG_TABS.map((tab) => tab.id))

/**
 * Coerce an unknown query value to a TV catalog tab id.
 * @param value - Raw `tab` query string (or array from Vue Router).
 * @returns `popular`, `airing`, or `upcoming`.
 */
export function normalizeTvCatalogTab(value: unknown): TvCatalogTab {
  const raw = Array.isArray(value) ? value[0] : value
  if (typeof raw === 'string' && TAB_IDS.has(raw) && raw !== 'popular') {
    return raw as TvCatalogTab
  }
  return 'popular'
}

/**
 * Coerce a page query value to a 1-based page index.
 * @param value - Raw `page` query string (or array from Vue Router).
 */
export function parseTvCatalogPage(value: unknown): number {
  const raw = Array.isArray(value) ? value[0] : value
  const page = typeof raw === 'number' ? raw : parseInt(String(raw || ''), 10)
  return Number.isFinite(page) && page > 1 ? Math.floor(page) : 1
}

/**
 * Look up copy for a TV catalog tab.
 * @param tab - Normalized tab id.
 */
export function getTvCatalogTab(tab: TvCatalogTab) {
  return TV_CATALOG_TABS.find((item) => item.id === tab) ?? TV_CATALOG_TABS[0]
}

/**
 * Vue Router query for the TV catalog, omitting default popular/page-1 params.
 * @param tab - Active tab.
 * @param page - 1-based page index.
 */
export function tvCatalogRouteQuery(tab: TvCatalogTab, page: number): Record<string, string> {
  const query: Record<string, string> = {}
  if (tab !== 'popular') query.tab = tab
  if (page > 1) query.page = String(page)
  return query
}

/**
 * Path plus query used as the `from` param when opening a TV show from the catalog.
 * @param tab - Active tab.
 * @param page - 1-based page index.
 */
export function tvCatalogPath(tab: TvCatalogTab, page: number) {
  const search = new URLSearchParams(tvCatalogRouteQuery(tab, page)).toString()
  return search ? `/tv?${search}` : '/tv'
}

/**
 * Scroll-restoration key for a TV catalog tab page.
 * @param tab - Active tab.
 * @param page - 1-based page index.
 */
export function tvCatalogScrollKey(tab: TvCatalogTab, page: number) {
  return `tv-page-${tab}-${page}`
}

/**
 * Whether a pathname is the TV catalog (including the legacy `/tv-shows` path).
 * @param pathname - URL pathname.
 */
export function isTvCatalogPath(pathname: string) {
  return pathname === '/tv' || pathname === '/tv-shows'
}

/**
 * Tab, page, router location, and scroll key parsed from a TV catalog URL.
 * @param url - Absolute or site-relative catalog URL.
 */
export function tvCatalogLocationFromUrl(url: URL) {
  const tab = normalizeTvCatalogTab(url.searchParams.get('tab'))
  const page = parseTvCatalogPage(url.searchParams.get('page'))
  return {
    tab,
    page,
    path: '/tv' as const,
    query: tvCatalogRouteQuery(tab, page),
    scrollKey: tvCatalogScrollKey(tab, page),
  }
}
