import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import Watchlist from '@/views/Watchlist.vue'

const loadWatchlist = vi.fn().mockResolvedValue(undefined)

const watchlist = [
  {
    content: {
      _id: 'movie-1',
      title: 'Spirited Away',
      overview: 'A girl enters a spirit world.',
      contentType: 'movie',
      genres: [],
    },
    status: 'completed',
    currentEpisode: 0,
    addedAt: '2024-01-01',
    updatedAt: '2024-01-01',
  },
  {
    content: {
      _id: 'tv-1',
      title: 'Frieren',
      overview: 'An elf journeys after the hero party disbands.',
      contentType: 'tv',
      episodeCount: 28,
      genres: [],
    },
    status: 'watching',
    currentEpisode: 4,
    addedAt: '2024-01-02',
    updatedAt: '2024-01-02',
  },
]

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: vi.fn(), success: vi.fn() }),
}))

vi.mock('@/stores/content', () => ({
  useContentStore: () => ({
    watchlist,
    loadWatchlist,
    scrollToTop: vi.fn(),
  }),
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    isAuthenticated: true,
  }),
}))

const mountPage = async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/watchlist', name: 'watchlist', component: Watchlist },
      { path: '/login', name: 'login', component: { template: '<div />' } },
      { path: '/search', name: 'search', component: { template: '<div />' } },
    ],
  })
  await router.push('/watchlist')
  await router.isReady()

  const wrapper = mount(Watchlist, {
    global: {
      plugins: [router],
      stubs: { AiringBadge: true },
    },
  })
  await flushPromises()
  return wrapper
}

describe('Watchlist status sections', () => {
  beforeEach(() => {
    loadWatchlist.mockClear()
    localStorage.clear()
  })

  it('groups titles into status sections next to the sort control, with no status dropdown', async () => {
    const wrapper = await mountPage()

    expect(wrapper.find('[data-testid="watchlist-status-filter"]').exists()).toBe(false)
    expect(wrapper.find('.watchlist-toolbar .sort-by-controls').exists()).toBe(true)

    const headers = wrapper.findAll('.section-header').map((header) => header.text())
    expect(headers).toEqual(['Watching1', 'Completed1'])
    expect(wrapper.get('[data-testid="watchlist-section-watching"]').text()).toContain('Frieren')
    expect(wrapper.get('[data-testid="watchlist-section-completed"]').text()).toContain(
      'Spirited Away',
    )
  })

  it('lists watching titles before completed ones', async () => {
    const wrapper = await mountPage()
    const titles = wrapper.findAll('.item-title').map((title) => title.text())
    expect(titles).toEqual(['Frieren', 'Spirited Away'])
  })

  it('collapses a section and remembers it', async () => {
    const wrapper = await mountPage()
    const header = wrapper.get('[data-testid="watchlist-section-completed"] .section-header')
    const items = wrapper.get('[data-testid="watchlist-section-completed"] .section-items')

    expect(header.attributes('aria-expanded')).toBe('true')
    await header.trigger('click')

    expect(header.attributes('aria-expanded')).toBe('false')
    expect((items.element as HTMLElement).style.display).toBe('none')
    expect(JSON.parse(localStorage.getItem('anilounge:watchlist-collapsed') || '[]')).toEqual([
      'completed',
    ])
  })

  it("shows a series' episode count from the catalog", async () => {
    const wrapper = await mountPage()
    const progress = wrapper.get('.episode-progress').text().replace(/\s+/g, '')
    expect(progress).toBe('4/28🆕')
  })
})
