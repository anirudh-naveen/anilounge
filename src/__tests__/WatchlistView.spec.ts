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

describe('Watchlist status filter', () => {
  beforeEach(() => {
    loadWatchlist.mockClear()
  })

  it('puts a status dropdown next to sort instead of status tabs', async () => {
    const wrapper = await mountPage()

    expect(wrapper.find('.filter-tabs').exists()).toBe(false)
    expect(wrapper.find('.tab-btn').exists()).toBe(false)
    expect(
      wrapper.find('.watchlist-toolbar [data-testid="watchlist-status-filter"]').exists(),
    ).toBe(true)
    expect(wrapper.find('.watchlist-toolbar .sort-by-controls').exists()).toBe(true)

    const options = wrapper
      .findAll('[data-testid="watchlist-status-filter"] option')
      .map((option) => option.text())
    expect(options).toEqual([
      'All (2)',
      'Planned (0)',
      'Watching (1)',
      'Completed (1)',
      'Dropped (0)',
    ])
  })

  it('filters the list when a status is selected', async () => {
    const wrapper = await mountPage()

    expect(wrapper.text()).toContain('Spirited Away')
    expect(wrapper.text()).toContain('Frieren')

    await wrapper.get('[data-testid="watchlist-status-filter"]').setValue('watching')
    await flushPromises()

    expect(wrapper.text()).toContain('Frieren')
    expect(wrapper.text()).not.toContain('Spirited Away')
  })

  it('explains when the selected status has no titles', async () => {
    const wrapper = await mountPage()

    await wrapper.get('[data-testid="watchlist-status-filter"]').setValue('dropped')
    await flushPromises()

    expect(wrapper.text()).toContain('No Dropped titles')
    expect(wrapper.text()).not.toContain('No items in your watchlist')
  })
})
