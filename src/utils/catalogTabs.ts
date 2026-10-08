/**
 * catalogTabs.ts — movie and TV catalog tab helpers.
 *
 * Tab ids, labels, `/movies` `/tv` query/path builders, and Search browse
 * rails used by the catalog page and detail-view back navigation. Currently Trending
 * (popular) is a single page.
 */

export const TV_CATALOG_TABS = [
  {
    id: 'popular',
    label: 'Currently Trending',
    subtitle: 'Discover amazing animated series from around the world',
    emptyTitle: 'No series found',
    emptyBody: "We couldn't find any animated series at the moment.",
  },
  {
    id: 'airing',
    label: 'Airing Right Now',
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
    label: 'Currently Trending',
    subtitle: 'Discover amazing animated films from around the world',
    emptyTitle: 'No movies found',
    emptyBody: "We couldn't find any animated movies at the moment.",
  },
  {
    id: 'theatres',
    label: 'In Theatres Now',
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

/** Which catalog: animated movies (specials included) or series. */
export type BrowseContentType = 'movie' | 'tv'

type CatalogTabFor<K extends BrowseContentType> = K extends 'movie' ? MovieCatalogTab : TvCatalogTab

interface CatalogTabMeta {
  id: string
  label: string
  subtitle: string
  emptyTitle: string
  emptyBody: string
}

const CATALOGS: Record<
  BrowseContentType,
  { tabs: readonly CatalogTabMeta[]; path: string; scrollPrefix: string }
> = {
  movie: { tabs: MOVIE_CATALOG_TABS, path: '/movies', scrollPrefix: 'movies-page' },
  tv: { tabs: TV_CATALOG_TABS, path: '/tv', scrollPrefix: 'tv-page' },
}

/**
 * Currently Trending is a single highlight page; other tabs paginate.
 * @param tab - Normalized tab id.
 */
export function catalogTabHasPagination(tab: string) {
  return tab !== 'popular'
}

/**
 * Coerce an unknown query value to one of the catalog's tab ids (`popular` if unknown).
 * @param kind - `movie` or `tv`.
 * @param value - Raw `tab` query string (or array from Vue Router).
 */
export function normalizeCatalogTab<K extends BrowseContentType>(
  kind: K,
  value: unknown,
): CatalogTabFor<K> {
  const raw = Array.isArray(value) ? value[0] : value
  const known = typeof raw === 'string' && CATALOGS[kind].tabs.some((tab) => tab.id === raw)
  return (known ? raw : 'popular') as CatalogTabFor<K>
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
 * Look up copy (label, subtitle, empty state) for a catalog tab.
 * @param kind - `movie` or `tv`.
 * @param tab - Normalized tab id.
 */
export function getCatalogTab(kind: BrowseContentType, tab: string): CatalogTabMeta {
  const { tabs } = CATALOGS[kind]
  return tabs.find((item) => item.id === tab) ?? tabs[0]!
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
 * Path plus query used as the `from` param when opening a title from the catalog.
 * @param kind - `movie` or `tv`.
 * @param tab - Active tab.
 * @param page - 1-based page index.
 */
export function catalogPath(kind: BrowseContentType, tab: string, page: number) {
  const search = new URLSearchParams(catalogRouteQuery(tab, page)).toString()
  const { path } = CATALOGS[kind]
  return search ? `${path}?${search}` : path
}

/**
 * Scroll-restoration key for a catalog tab page.
 * @param kind - `movie` or `tv`.
 * @param tab - Active tab.
 * @param page - 1-based page index.
 */
export function catalogScrollKey(kind: BrowseContentType, tab: string, page: number) {
  return `${CATALOGS[kind].scrollPrefix}-${tab}-${page}`
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
 * Tab, page, router location, and scroll key parsed from a catalog URL.
 * @param kind - `movie` or `tv`.
 * @param url - Absolute or site-relative catalog URL.
 */
export function catalogLocationFromUrl(kind: BrowseContentType, url: URL) {
  const tab = normalizeCatalogTab(kind, url.searchParams.get('tab'))
  const page = parseCatalogPage(url.searchParams.get('page'), tab)
  return {
    tab,
    page,
    path: CATALOGS[kind].path,
    query: catalogRouteQuery(tab, page),
    scrollKey: catalogScrollKey(kind, tab, page),
  }
}

export const MOVIE_BROWSE_RAILS = [
  {
    id: 'popular' as const,
    title: 'Currently Trending',
    viewAll: catalogPath('movie', 'popular', 1),
  },
  {
    id: 'theatres' as const,
    title: 'In Theatres Now',
    viewAll: catalogPath('movie', 'theatres', 1),
  },
  {
    id: 'upcoming' as const,
    title: 'Upcoming Highlights',
    viewAll: catalogPath('movie', 'upcoming', 1),
  },
]

export const TV_BROWSE_RAILS = [
  {
    id: 'popular' as const,
    title: 'Currently Trending',
    viewAll: catalogPath('tv', 'popular', 1),
  },
  {
    id: 'airing' as const,
    title: 'Airing Right Now',
    viewAll: catalogPath('tv', 'airing', 1),
  },
  {
    id: 'upcoming' as const,
    title: 'Upcoming Highlights',
    viewAll: catalogPath('tv', 'upcoming', 1),
  },
]

/**
 * Coerce an unknown query value to the Search browse type. Movies are default.
 * @param value - Raw `type` query string (or array from Vue Router).
 * @returns `movie` or `tv`.
 */
export function normalizeBrowseType(value: unknown): BrowseContentType {
  const raw = Array.isArray(value) ? value[0] : value
  return raw === 'tv' ? 'tv' : 'movie'
}
