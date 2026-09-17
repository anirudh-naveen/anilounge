import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import TVShows from '@/views/TVShows.vue'

const getContent = vi.fn().mockResolvedValue({})
const loadWatchlist = vi.fn().mockResolvedValue({})

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: vi.fn() }),
}))

vi.mock('@/stores/content', () => ({
  useContentStore: () => ({
    tvShows: [],
    tvShowsLoading: false,
    error: null,
    tvShowsPagination: { currentPage: 1, totalPages: 5 },
    getContent,
    isInWatchlist: () => false,
    saveScrollPosition: vi.fn(),
    loadWatchlist,
  }),
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    isAuthenticated: false,
  }),
}))

const mountPage = async (path = '/tv') => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/tv', name: 'tv', component: TVShows },
      { path: '/tv-show/:id', name: 'TVShowDetails', component: { template: '<div />' } },
    ],
  })
  await router.push(path)
  await router.isReady()

  const wrapper = mount(TVShows, {
    global: { plugins: [router] },
  })
  await flushPromises()
  return { wrapper, router }
}

describe('TVShows catalog tabs', () => {
  beforeEach(() => {
    getContent.mockClear()
    window.scrollTo = vi.fn()
  })

  it('renders the three catalog tabs and loads popular by default', async () => {
    const { wrapper } = await mountPage()

    expect(wrapper.text()).toContain('Currently Trending')
    expect(wrapper.text()).toContain('Airing Right Now')
    expect(wrapper.text()).toContain('Upcoming Highlights')
    expect(wrapper.get('[data-testid="tv-tab-popular"]').attributes('aria-selected')).toBe('true')
    expect(getContent).toHaveBeenCalledWith(1, 'tv', 20, 'popular')
    expect(wrapper.find('nav[aria-label="Pagination"]').exists()).toBe(false)
  })

  it('switches the route to the currently airing tab', async () => {
    const { wrapper, router } = await mountPage()

    await wrapper.get('[data-testid="tv-tab-airing"]').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.query.tab).toBe('airing')
    expect(getContent).toHaveBeenCalledWith(1, 'tv', 20, 'airing')
    expect(wrapper.find('nav[aria-label="Pagination"]').exists()).toBe(true)
  })

  it('loads upcoming highlights from the query string', async () => {
    await mountPage('/tv?tab=upcoming')
    expect(getContent).toHaveBeenCalledWith(1, 'tv', 20, 'upcoming')
  })
})
