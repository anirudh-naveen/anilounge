/**
 * Search's Characters and Voice Actors tabs: each tab's search text, filters, page,
 * and results, kept apart from the Movies/Series search so switching tabs swaps in
 * that tab's own filters. Module state, so it survives opening a result and coming
 * back. With nothing searched, a tab shows one page of trending people.
 */
import { reactive } from 'vue'
import { entityAPI } from '@/services/api'
import type { SortDirection } from '@/utils/sorting'

export type PeopleKind = 'character' | 'voice_actor'
export type PeopleSort = 'popularity' | 'titles' | 'roles' | 'favorites' | 'name'

export interface PeopleFilters {
  /** Characters: has a Main / Supporting / Cameo role somewhere. */
  role: 'all' | 'main' | 'supporting' | 'cameo'
  /** Characters: appears in a movie (or special) / a series. */
  media: 'all' | 'movie' | 'series'
  /** Voice actors: has a credit in this dub language. */
  language: string
  sortBy: PeopleSort
  sortDirection: SortDirection
}

export interface PersonCard {
  _id: string
  entityType: PeopleKind
  name: string
  imagePath: string
  /** Characters: their best-known title. Voice actors: their best-known role. */
  subtitle: string
  titleCount?: number
  roleCount?: number
  languages?: string[]
}

export interface PeopleResult {
  items: PersonCard[]
  page: number
  pageSize: number
  total: number
  trending: boolean
  languages?: string[]
}

export const PEOPLE_SORT_OPTIONS: Record<PeopleKind, { value: PeopleSort; label: string }[]> = {
  character: [
    { value: 'popularity', label: 'Popularity' },
    { value: 'titles', label: 'Most Titles' },
    { value: 'favorites', label: 'Most Favorited' },
    { value: 'name', label: 'Name' },
  ],
  voice_actor: [
    { value: 'popularity', label: 'Popularity' },
    { value: 'roles', label: 'Most Roles' },
    { value: 'favorites', label: 'Most Favorited' },
    { value: 'name', label: 'Name' },
  ],
}

export const defaultPeopleFilters = (): PeopleFilters => ({
  role: 'all',
  media: 'all',
  language: 'all',
  sortBy: 'popularity',
  sortDirection: 'desc',
})

/** Whether any filter or the sort differs from the trending defaults. */
export const hasActivePeopleFilters = (filters: PeopleFilters) => {
  const defaults = defaultPeopleFilters()
  return (Object.keys(defaults) as (keyof PeopleFilters)[]).some(
    (key) => filters[key] !== defaults[key],
  )
}

interface PeopleTab {
  /** Search text last submitted. */
  query: string
  /** Filters being edited in the panel. */
  filters: PeopleFilters
  /** Filters last submitted. */
  applied: PeopleFilters
  page: number
  result: PeopleResult | null
  loading: boolean
  error: string
}

const blankTab = (): PeopleTab => ({
  query: '',
  filters: defaultPeopleFilters(),
  applied: defaultPeopleFilters(),
  page: 1,
  result: null,
  loading: false,
  error: '',
})

const tabs = reactive<Record<PeopleKind, PeopleTab>>({
  character: blankTab(),
  voice_actor: blankTab(),
})
const requestSeq: Record<PeopleKind, number> = { character: 0, voice_actor: 0 }

/** Fetch the tab's current page for its submitted search. */
async function load(kind: PeopleKind) {
  const tab = tabs[kind]
  const seq = ++requestSeq[kind]
  const { applied } = tab
  tab.loading = true
  tab.error = ''
  try {
    const response = await entityAPI.browse({
      type: kind,
      q: tab.query || undefined,
      role: kind === 'character' && applied.role !== 'all' ? applied.role : undefined,
      media: kind === 'character' && applied.media !== 'all' ? applied.media : undefined,
      language: kind === 'voice_actor' && applied.language !== 'all' ? applied.language : undefined,
      sort: applied.sortBy,
      direction: applied.sortDirection,
      page: tab.page,
    })
    if (seq === requestSeq[kind]) tab.result = response.data.data
  } catch (error) {
    if (seq === requestSeq[kind]) {
      console.error('People search failed:', error)
      tab.error =
        kind === 'voice_actor' ? "Couldn't load voice actors." : "Couldn't load characters."
    }
  } finally {
    if (seq === requestSeq[kind]) tab.loading = false
  }
}

/** Search with the text and the panel's filters. */
function submit(kind: PeopleKind, query: string) {
  const tab = tabs[kind]
  tab.query = query.trim()
  tab.applied = { ...tab.filters }
  tab.page = 1
  return load(kind)
}

/** Back to the trending page. */
function reset(kind: PeopleKind) {
  const tab = tabs[kind]
  tab.query = ''
  tab.filters = defaultPeopleFilters()
  tab.applied = defaultPeopleFilters()
  tab.page = 1
  return load(kind)
}

function goToPage(kind: PeopleKind, page: number) {
  tabs[kind].page = page
  return load(kind)
}

/** Load the tab unless it already has results (returning to Search keeps them). */
function ensureLoaded(kind: PeopleKind) {
  if (!tabs[kind].result && !tabs[kind].loading) void load(kind)
}

/** Whether the tab shows a search rather than the trending page. */
const hasSearched = (kind: PeopleKind) =>
  Boolean(tabs[kind].query) || hasActivePeopleFilters(tabs[kind].applied)

export function usePeopleSearch() {
  return { tabs, submit, reset, goToPage, ensureLoaded, hasSearched }
}
