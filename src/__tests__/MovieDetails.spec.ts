import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import MovieDetails from '@/views/MovieDetails.vue'

const loadWatchlist = vi.fn().mockResolvedValue(undefined)
const getWatchlistItem = vi.fn().mockReturnValue(undefined)
const movie = {
  _id: 'movie-1',
  title: 'Spirited Away',
  overview: 'A girl enters a spirit world.',
  contentType: 'movie',
  genres: [],
}

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: vi.fn(), success: vi.fn() }),
}))

vi.mock('@/stores/content', () => ({
  useContentStore: () => ({
    loadWatchlist,
    getWatchlistItem,
    findContentById: () => movie,
    cacheContent: vi.fn(),
    scrollToTop: vi.fn(),
    restoreScrollPosition: vi.fn(),
  }),
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    isAuthenticated: true,
  }),
}))

vi.mock('@/services/api', () => ({
  contentAPI: {
    getRelatedContent: vi.fn().mockResolvedValue({
      data: { data: { sequels: [], prequels: [], related: [] } },
    }),
  },
  getPosterUrl: () => '',
  getCardContentTypeDisplay: () => 'Movie',
  getDetailsRouteName: () => 'MovieDetails',
}))

vi.mock('@/stores/entities', () => ({
  useEntityStore: () => ({
    getContentCharacters: vi.fn().mockResolvedValue([]),
  }),
}))

const mountPage = async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/movie/:id', name: 'MovieDetails', component: MovieDetails }],
  })
  await router.push('/movie/movie-1')
  await router.isReady()

  const wrapper = mount(MovieDetails, {
    global: {
      plugins: [router],
      stubs: { StatusDropdown: true, EntityCastRow: true },
    },
  })
  await flushPromises()
  return wrapper
}

describe('MovieDetails watchlist action', () => {
  beforeEach(() => {
    getWatchlistItem.mockReset()
    getWatchlistItem.mockReturnValue(undefined)
    loadWatchlist.mockClear()
  })

  it('shows Add to Watchlist when the title is not saved', async () => {
    const wrapper = await mountPage()
    expect(wrapper.get('[data-testid="watchlist-action"]').text()).toContain('Add to Watchlist')
  })

  it('shows the current status and opens the editor when the title is saved', async () => {
    getWatchlistItem.mockReturnValue({ status: 'watching' })
    const wrapper = await mountPage()

    const button = wrapper.get('[data-testid="watchlist-action"]')
    expect(button.text()).toContain('Watching')
    expect(button.text()).not.toContain('In Watchlist')

    await button.trigger('click')
    expect(wrapper.find('status-dropdown-stub').exists()).toBe(true)
  })
})
