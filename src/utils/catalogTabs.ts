/**
 * catalogTabs.ts — movie and TV catalog tab helpers.
 *
 * Tab ids, labels, and `/movies` `/tv` query/path builders used by catalog
 * pages and detail-view back navigation. Popular Right Now is a single page.
 */

export const TV_CATALOG_TABS = [
  {
    id: 'popular',
    label: 'Popular Right Now',
    subtitle: 'Discover amazing animated series from around the world',
    emptyTitle: 'No series found',
    emptyBody: "We couldn't find any animated series at the moment.",
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

export const MOVIE_CATALOG_TABS = [
  {
    id: 'popular',
    label: 'Popular Right Now',
    subtitle: 'Discover amazing animated films from around the world',
    emptyTitle: 'No movies found',
    emptyBody: "We couldn't find any animated movies at the moment.",
  },
  {
    id: 'theatres',
    label: 'Now in Theatres',
    subtitle: 'Animated films currently showing in theatres',
    emptyTitle: 'No movies in theatres',
    emptyBody: 'Nothing looks like it is in theatres right now. Check back soon.',
  },
  {
    id: 'upcoming',
    label: 'Upcoming Highlights',
    subtitle: 'Most anticipated films yet to premiere',
    emptyTitle: 'No upcoming highlights',
    emptyBody: 'No unreleased movies to highlight right now. Check back soon.',
  },
] as const

export type TvCatalogTab = (typeof TV_CATALOG_TABS)[number]['id']
export type MovieCatalogTab = (typeof MOVIE_CATALOG_TABS)[number]['id']
export type CatalogTab = TvCatalogTab | MovieCatalogTab

const TV_TAB_IDS = new Set<string>(TV_CATALOG_TABS.map((tab) => tab.id))
const MOVIE_TAB_IDS = new Set<string>(MOVIE_CATALOG_TABS.map((tab) => tab.id))

/**
 * Popular Right Now is a single highlight page; other tabs paginate.
 * @param tab - Normalized tab id.
 */
export function catalogTabHasPagination(tab: string) {
  return tab !== 'popular'
}

/**
 * Coerce an unknown query value to a TV catalog tab id.
 * @param value - Raw `tab` query string (or array from Vue Router).
 * @returns `popular`, `airing`, or `upcoming`.
 */
export function normalizeTvCatalogTab(value: unknown): TvCatalogTab {
  const raw = Array.isArray(value) ? value[0] : value
  if (typeof raw === 'string' && TV_TAB_IDS.has(raw) && raw !== 'popular') {
    return raw as TvCatalogTab
  }
  return 'popular'
}

/**
 * Coerce an unknown query value to a movie catalog tab id.
 * @param value - Raw `tab` query string (or array from Vue Router).
 * @returns `popular`, `theatres`, or `upcoming`.
 */
export function normalizeMovieCatalogTab(value: unknown): MovieCatalogTab {
  const raw = Array.isArray(value) ? value[0] : value
  if (typeof raw === 'string' && MOVIE_TAB_IDS.has(raw) && raw !== 'popular') {
    return raw as MovieCatalogTab
  }
  return 'popular'
}

/**
 * Coerce a page query value to a 1-based page index. Popular always returns 1.
 * @param value - Raw `page` query string (or array from Vue Router).
 * @param tab - Active tab; popular ignores page.
 */
export function parseCatalogPage(value: unknown, tab?: string): number {
  if (tab && !catalogTabHasPagination(tab)) return 1
  const raw = Array.isArray(value) ? value[0] : value
  const page = typeof raw === 'number' ? raw : parseInt(String(raw || ''), 10)
  return Number.isFinite(page) && page > 1 ? Math.floor(page) : 1
}

/**
 * Coerce a page query value to a 1-based page index for the TV catalog.
 * @param value - Raw `page` query string (or array from Vue Router).
 * @param tab - Active TV tab; popular ignores page.
 */
export function parseTvCatalogPage(value: unknown, tab?: TvCatalogTab): number {
  return parseCatalogPage(value, tab)
}

/**
 * Coerce a page query value to a 1-based page index for the movie catalog.
 * @param value - Raw `page` query string (or array from Vue Router).
 * @param tab - Active movie tab; popular ignores page.
 */
export function parseMovieCatalogPage(value: unknown, tab?: MovieCatalogTab): number {
  return parseCatalogPage(value, tab)
}

/**
 * Look up copy for a TV catalog tab.
 * @param tab - Normalized tab id.
 */
export function getTvCatalogTab(tab: TvCatalogTab) {
  return TV_CATALOG_TABS.find((item) => item.id === tab) ?? TV_CATALOG_TABS[0]
}

/**
 * Look up copy for a movie catalog tab.
 * @param tab - Normalized tab id.
 */
export function getMovieCatalogTab(tab: MovieCatalogTab) {
  return MOVIE_CATALOG_TABS.find((item) => item.id === tab) ?? MOVIE_CATALOG_TABS[0]
}

/**
 * Router query for a catalog, omitting default popular/page-1 params.
 * Popular never includes `page` because it is a single-page list.
 * @param tab - Active tab.
 * @param page - 1-based page index.
 */
export function catalogRouteQuery(tab: string, page: number): Record<string, string> {
  const query: Record<string, string> = {}
  if (tab !== 'popular') query.tab = tab
  if (page > 1 && catalogTabHasPagination(tab)) query.page = String(page)
  return query
}

/**
 * Vue Router query for the TV catalog, omitting default popular/page-1 params.
 * @param tab - Active tab.
 * @param page - 1-based page index.
 */
export function tvCatalogRouteQuery(tab: TvCatalogTab, page: number): Record<string, string> {
  return catalogRouteQuery(tab, page)
}

/**
 * Vue Router query for the movie catalog, omitting default popular/page-1 params.
 * @param tab - Active tab.
 * @param page - 1-based page index.
 */
export function movieCatalogRouteQuery(tab: MovieCatalogTab, page: number): Record<string, string> {
  return catalogRouteQuery(tab, page)
}

/**
 * Path plus query used as the `from` param when opening a series from the catalog.
 * @param tab - Active tab.
 * @param page - 1-based page index.
 */
export function tvCatalogPath(tab: TvCatalogTab, page: number) {
  const search = new URLSearchParams(tvCatalogRouteQuery(tab, page)).toString()
  return search ? `/tv?${search}` : '/tv'
}

/**
 * Path plus query used as the `from` param when opening a movie from the catalog.
 * @param tab - Active tab.
 * @param page - 1-based page index.
 */
export function movieCatalogPath(tab: MovieCatalogTab, page: number) {
  const search = new URLSearchParams(movieCatalogRouteQuery(tab, page)).toString()
  return search ? `/movies?${search}` : '/movies'
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
 * Scroll-restoration key for a movie catalog tab page.
 * @param tab - Active tab.
 * @param page - 1-based page index.
 */
export function movieCatalogScrollKey(tab: MovieCatalogTab, page: number) {
  return `movies-page-${tab}-${page}`
}

/**
 * Whether a pathname is the TV catalog (including the legacy `/tv-shows` path).
 * @param pathname - URL pathname.
 */
export function isTvCatalogPath(pathname: string) {
  return pathname === '/tv' || pathname === '/tv-shows'
}

/**
 * Whether a pathname is the movie catalog.
 * @param pathname - URL pathname.
 */
export function isMovieCatalogPath(pathname: string) {
  return pathname === '/movies'
}

/**
 * Tab, page, router location, and scroll key parsed from a TV catalog URL.
 * @param url - Absolute or site-relative catalog URL.
 */
export function tvCatalogLocationFromUrl(url: URL) {
  const tab = normalizeTvCatalogTab(url.searchParams.get('tab'))
  const page = parseTvCatalogPage(url.searchParams.get('page'), tab)
  return {
    tab,
    page,
    path: '/tv' as const,
    query: tvCatalogRouteQuery(tab, page),
    scrollKey: tvCatalogScrollKey(tab, page),
  }
}

/**
 * Tab, page, router location, and scroll key parsed from a movie catalog URL.
 * @param url - Absolute or site-relative catalog URL.
 */
export function movieCatalogLocationFromUrl(url: URL) {
  const tab = normalizeMovieCatalogTab(url.searchParams.get('tab'))
  const page = parseMovieCatalogPage(url.searchParams.get('page'), tab)
  return {
    tab,
    page,
    path: '/movies' as const,
    query: movieCatalogRouteQuery(tab, page),
    scrollKey: movieCatalogScrollKey(tab, page),
  }
}
