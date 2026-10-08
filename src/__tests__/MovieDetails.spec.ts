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
      stubs: { EntityCastRow: true },
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

  it('offers Add to Watchlist in the page when the title is not saved', async () => {
    const wrapper = await mountPage()
    expect(wrapper.get('[data-testid="watchlist-panel"]').text()).toContain('Add to Watchlist')
    expect(wrapper.find('[data-testid="watchlist-save"]').exists()).toBe(false)
  })

  it('shows the current status and the editor in the page when the title is saved', async () => {
    getWatchlistItem.mockReturnValue({ status: 'watching', currentEpisode: 0 })
    const wrapper = await mountPage()

    expect(wrapper.get('[data-testid="watchlist-panel-status"]').text()).toBe('Watching')
    expect(wrapper.find('[data-testid="watchlist-save"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="watchlist-add"]').exists()).toBe(false)
  })
})
