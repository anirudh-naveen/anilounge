import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import Search from '@/views/Search.vue'
import { defaultSearchFilters, hasActiveSearchFilters, useContentStore } from '@/stores/content'

const toastInfo = vi.fn()

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: vi.fn(), info: toastInfo }),
}))

vi.mock('@/services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/api')>()
  return {
    ...actual,
    contentAPI: {
      ...actual.contentAPI,
      getContent: vi.fn().mockResolvedValue({
        data: { success: true, data: [], pagination: { totalItems: 0 } },
      }),
    },
  }
})

const mountPage = async (path = '/search') => {
  const pinia = createPinia()
  setActivePinia(pinia)

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/search', name: 'search', component: Search },
      { path: '/movies', name: 'movies', component: { template: '<div />' } },
      { path: '/tv', name: 'tv', component: { template: '<div />' } },
    ],
  })
  await router.push(path)
  await router.isReady()

  const wrapper = mount(Search, {
    global: {
      plugins: [pinia, router],
      stubs: {
        PaginationNav: true,
        ContentHoverPreview: true,
        AiringBadge: true,
      },
    },
  })
  await flushPromises()
  return { wrapper, store: useContentStore(), router }
}

const openFilters = async (wrapper: Awaited<ReturnType<typeof mountPage>>['wrapper']) => {
  await wrapper.get('[data-testid="search-filters-toggle"]').trigger('click')
}

describe('hasActiveSearchFilters', () => {
  it('is false for the default filter set', () => {
    expect(hasActiveSearchFilters(defaultSearchFilters())).toBe(false)
  })

  it('is true when any filter differs from the defaults', () => {
    expect(hasActiveSearchFilters({ ...defaultSearchFilters(), genre: 'Action' })).toBe(true)
    expect(hasActiveSearchFilters({ ...defaultSearchFilters(), ratingMin: 3 })).toBe(true)
    expect(hasActiveSearchFilters({ ...defaultSearchFilters(), sortBy: 'rating' })).toBe(true)
    expect(hasActiveSearchFilters({ ...defaultSearchFilters(), year: '2024' })).toBe(true)
    expect(hasActiveSearchFilters({ ...defaultSearchFilters(), season: 'summer' })).toBe(true)
    expect(hasActiveSearchFilters({ ...defaultSearchFilters(), status: 'airing' })).toBe(true)
    expect(hasActiveSearchFilters({ ...defaultSearchFilters(), country: 'JP' })).toBe(true)
    expect(hasActiveSearchFilters({ ...defaultSearchFilters(), type: 'movie' })).toBe(false)
    expect(hasActiveSearchFilters({ ...defaultSearchFilters(), type: 'tv' })).toBe(false)
  })
})

describe('Search empty query gating', () => {
  beforeEach(() => {
    toastInfo.mockClear()
    window.scrollTo = vi.fn()
  })

  it('keeps Search disabled when the query and filters are empty', async () => {
    const { wrapper, store } = await mountPage()
    const spy = vi.spyOn(store, 'searchContent')

    expect(wrapper.get('[data-testid="search-query"]').attributes('required')).toBeUndefined()
    expect(wrapper.get('[data-testid="search-submit"]').attributes('disabled')).toBeDefined()

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(spy).not.toHaveBeenCalled()
  })

  it('allows Search with an empty query when a filter is set', async () => {
    const { wrapper, store } = await mountPage()
    const spy = vi.spyOn(store, 'searchContent').mockResolvedValue({
      success: true,
      data: { content: [], pagination: store.pagination },
    })

    await openFilters(wrapper)
    await wrapper.get('[data-testid="filter-genre"]').setValue('Action')
    expect(wrapper.get('[data-testid="search-submit"]').attributes('disabled')).toBeUndefined()

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(spy).toHaveBeenCalledWith('', 'all')
    expect(store.searchAppliedFilters.genre).toBe('Action')
  })

  it('allows Search when a query is typed with default filters', async () => {
    const { wrapper, store } = await mountPage()
    const spy = vi.spyOn(store, 'searchContent').mockResolvedValue({
      success: true,
      data: { content: [], pagination: store.pagination },
    })

    await wrapper.get('[data-testid="search-query"]').setValue('naruto')
    expect(wrapper.get('[data-testid="search-submit"]').attributes('disabled')).toBeUndefined()

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(spy).toHaveBeenCalledWith('naruto', 'all')
  })

  it('allows Search with a status or a country of origin and no query', async () => {
    const { wrapper, store } = await mountPage()
    const spy = vi.spyOn(store, 'searchContent').mockResolvedValue({
      success: true,
      data: { content: [], pagination: store.pagination },
    })

    await openFilters(wrapper)
    expect(wrapper.get('[data-testid="filter-status"]').text()).toContain('Airing')
    expect(wrapper.get('[data-testid="filter-country"]').text()).toContain('Japan')

    await wrapper.get('[data-testid="filter-status"]').setValue('airing')
    expect(wrapper.get('[data-testid="search-submit"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.get('[data-testid="filter-year"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.get('[data-testid="filter-season"]').attributes('disabled')).toBeUndefined()

    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(spy).toHaveBeenCalledWith('', 'all')
    expect(store.searchAppliedFilters.status).toBe('airing')

    spy.mockClear()
    await wrapper.get('[data-testid="filter-status"]').setValue('all')
    await wrapper.get('[data-testid="filter-country"]').setValue('JP')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(store.searchAppliedFilters.country).toBe('JP')
  })

  it('lets year, season, and status be combined', async () => {
    const { wrapper } = await mountPage()
    await openFilters(wrapper)
    const yearSelect = wrapper.get('[data-testid="filter-year"]')
    const yearValue = yearSelect.findAll('option')[1]?.element.value
    expect(yearValue).toBeTruthy()

    await yearSelect.setValue(yearValue!)
    await wrapper.get('[data-testid="filter-season"]').setValue('summer')
    await wrapper.get('[data-testid="filter-status"]').setValue('completed')

    expect(wrapper.get('[data-testid="filter-year"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.get('[data-testid="filter-season"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.get('[data-testid="filter-status"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.get('[data-testid="search-submit"]').attributes('disabled')).toBeUndefined()
    expect((yearSelect.element as HTMLSelectElement).value).toBe(yearValue)
    expect((wrapper.get('[data-testid="filter-season"]').element as HTMLSelectElement).value).toBe(
      'summer',
    )
    expect((wrapper.get('[data-testid="filter-status"]').element as HTMLSelectElement).value).toBe(
      'completed',
    )
  })

  it('filters results by status and country of origin', async () => {
    const { wrapper, store } = await mountPage()
    await openFilters(wrapper)
    const catalog = [
      {
        _id: 'airing-jp',
        title: 'Airing Japan Show',
        overview: 'Now on air',
        contentType: 'tv' as const,
        malStatus: 'currently_airing',
        malId: 11,
        genres: [],
      },
      {
        _id: 'done-us',
        title: 'Finished US Show',
        overview: 'Already over',
        contentType: 'tv' as const,
        malStatus: 'finished_airing',
        originCountries: ['US'],
        genres: [],
      },
      {
        _id: 'soon-jp',
        title: 'Upcoming Japan Show',
        overview: 'Not yet aired',
        contentType: 'tv' as const,
        malStatus: 'not_yet_aired',
        malId: 12,
        genres: [],
      },
    ]

    vi.spyOn(store, 'searchContent').mockImplementation(async () => {
      store.searchResults = catalog
      return { success: true, data: { content: catalog, pagination: store.pagination } }
    })

    await wrapper.get('[data-testid="browse-type-tv"]').trigger('click')
    await wrapper.get('[data-testid="filter-status"]').setValue('airing')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('Airing Japan Show')
    expect(wrapper.text()).not.toContain('Finished US Show')
    expect(wrapper.text()).not.toContain('Upcoming Japan Show')

    await wrapper.get('[data-testid="filter-status"]').setValue('completed')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('Finished US Show')
    expect(wrapper.text()).not.toContain('Airing Japan Show')
    expect(wrapper.text()).not.toContain('Upcoming Japan Show')

    await wrapper.get('[data-testid="filter-status"]').setValue('all')
    await wrapper.get('[data-testid="filter-country"]').setValue('US')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('Finished US Show')
    expect(wrapper.text()).not.toContain('Airing Japan Show')
  })
})

describe('Search browse rails', () => {
  beforeEach(() => {
    window.scrollTo = vi.fn()
  })

  it('shows movie rails and keeps filters collapsed by default', async () => {
    const { wrapper } = await mountPage()

    expect(wrapper.get('[data-testid="browse-type-movie"]').attributes('aria-selected')).toBe(
      'true',
    )
    expect(wrapper.get('[data-testid="browse-rail-popular"]').text()).toContain('Currently Trending')
    expect(wrapper.get('[data-testid="browse-rail-theatres"]').text()).toContain('In Theatres Now')
    expect(wrapper.get('[data-testid="browse-rail-upcoming"]').text()).toContain(
      'Upcoming Highlights',
    )
    expect(wrapper.find('[data-testid="filter-genre"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="search-filters-toggle"]').attributes('aria-expanded')).toBe(
      'false',
    )
  })

  it('switches to series rails immediately', async () => {
    const { wrapper, router } = await mountPage()

    await wrapper.get('[data-testid="browse-type-tv"]').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.query.type).toBe('tv')
    expect(wrapper.get('[data-testid="browse-type-tv"]').attributes('aria-selected')).toBe('true')
    expect(wrapper.get('[data-testid="browse-rail-airing"]').text()).toContain('Airing Right Now')
    expect(wrapper.find('[data-testid="browse-rail-theatres"]').exists()).toBe(false)
  })

  it('reveals filters from the toolbar toggle', async () => {
    const { wrapper } = await mountPage()

    await openFilters(wrapper)

    expect(wrapper.get('[data-testid="search-filters-toggle"]').attributes('aria-expanded')).toBe(
      'true',
    )
    expect(wrapper.find('[data-testid="filter-genre"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('Type:')
  })
})
