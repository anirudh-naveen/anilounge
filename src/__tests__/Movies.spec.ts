import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import Movies from '@/views/Movies.vue'

const getContent = vi.fn().mockResolvedValue({})
const loadWatchlist = vi.fn().mockResolvedValue({})

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: vi.fn() }),
}))

vi.mock('@/stores/content', () => ({
  useContentStore: () => ({
    movies: [],
    moviesLoading: false,
    error: null,
    moviesPagination: { currentPage: 1, totalPages: 5 },
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

const mountPage = async (path = '/movies') => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/movies', name: 'movies', component: Movies },
      { path: '/movie/:id', name: 'MovieDetails', component: { template: '<div />' } },
    ],
  })
  await router.push(path)
  await router.isReady()

  const wrapper = mount(Movies, {
    global: { plugins: [router] },
  })
  await flushPromises()
  return { wrapper, router }
}

describe('Movies catalog tabs', () => {
  beforeEach(() => {
    getContent.mockClear()
    window.scrollTo = vi.fn()
  })

  it('renders the three catalog tabs and loads popular by default', async () => {
    const { wrapper } = await mountPage()

    expect(wrapper.text()).toContain('Popular Right Now')
    expect(wrapper.text()).toContain('Now in Theatres')
    expect(wrapper.text()).toContain('Upcoming Highlights')
    expect(wrapper.get('[data-testid="movie-tab-popular"]').attributes('aria-selected')).toBe(
      'true',
    )
    expect(getContent).toHaveBeenCalledWith(1, 'movie', 20, 'popular')
    expect(wrapper.find('nav[aria-label="Pagination"]').exists()).toBe(false)
  })

  it('switches the route to the now in theatres tab', async () => {
    const { wrapper, router } = await mountPage()

    await wrapper.get('[data-testid="movie-tab-theatres"]').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.query.tab).toBe('theatres')
    expect(getContent).toHaveBeenCalledWith(1, 'movie', 20, 'theatres')
    expect(wrapper.find('nav[aria-label="Pagination"]').exists()).toBe(true)
  })

  it('loads upcoming highlights from the query string', async () => {
    await mountPage('/movies?tab=upcoming')
    expect(getContent).toHaveBeenCalledWith(1, 'movie', 20, 'upcoming')
  })
})
