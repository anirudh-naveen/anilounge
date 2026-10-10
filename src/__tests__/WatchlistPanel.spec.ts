import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import WatchlistPanel from '@/components/WatchlistPanel.vue'

const addToWatchlist = vi.fn().mockResolvedValue(true)
const updateWatchlistItem = vi.fn().mockResolvedValue(true)
const removeFromWatchlist = vi.fn().mockResolvedValue(true)
const getWatchlistItem = vi.fn().mockReturnValue(undefined)
const auth = { isAuthenticated: true }

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: vi.fn(), success: vi.fn() }),
}))

vi.mock('@/stores/content', () => ({
  useContentStore: () => ({
    addToWatchlist,
    updateWatchlistItem,
    removeFromWatchlist,
    getWatchlistItem,
  }),
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => auth,
}))

const mountPanel = (props: Record<string, unknown> = {}) =>
  mount(WatchlistPanel, {
    props: { contentId: 'tv-1', contentType: 'tv', totalEpisodes: 12, totalSeasons: 2, ...props },
    global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
  })

describe('WatchlistPanel', () => {
  beforeEach(() => {
    auth.isAuthenticated = true
    addToWatchlist.mockClear()
    updateWatchlistItem.mockClear()
    removeFromWatchlist.mockClear()
    getWatchlistItem.mockReset()
    getWatchlistItem.mockReturnValue(undefined)
  })

  it('asks guests to log in', () => {
    auth.isAuthenticated = false
    const wrapper = mountPanel()
    expect(wrapper.text()).toContain('Log in to track this title')
    expect(wrapper.find('[data-testid="watchlist-add"]').exists()).toBe(false)
  })

  it('adds a planned or dropped title in one tap', async () => {
    const wrapper = mountPanel()
    await wrapper.get('select').setValue('dropped')
    expect(wrapper.find('[data-testid="watchlist-panel-episodes"]').exists()).toBe(false)
    await wrapper.get('[data-testid="watchlist-add"]').trigger('click')
    await flushPromises()

    expect(addToWatchlist).toHaveBeenCalledWith('tv-1', 'dropped')
  })

  it('opens the editor for other starting statuses and adds with progress', async () => {
    const wrapper = mountPanel()
    await wrapper.get('select').setValue('watching')

    const episodes = wrapper.get('[data-testid="watchlist-panel-episodes"]')
    await episodes.setValue(4)
    await wrapper.get('[data-testid="watchlist-panel-plus-one"]').trigger('click')
    expect(wrapper.find('[data-testid="watchlist-remove"]').exists()).toBe(false)
    await wrapper.get('[data-testid="watchlist-add"]').trigger('click')
    await flushPromises()

    expect(addToWatchlist).toHaveBeenCalledWith('tv-1', 'watching', undefined, 5, 1, undefined, {
      startedOn: null,
      completedOn: null,
      rewatchCount: 0,
    })

    // Back to Planned collapses to the one-tap add.
    await wrapper.get('[data-testid="watchlist-panel-status-select"]').setValue('plan_to_watch')
    expect(wrapper.find('[data-testid="watchlist-panel-episodes"]').exists()).toBe(false)
  })

  it('prefills a saved series and saves progress, season, and details', async () => {
    getWatchlistItem.mockReturnValue({
      status: 'watching',
      rating: 8,
      currentEpisode: 3,
      currentSeason: 1,
      notes: 'Halfway',
      startedOn: '2026-09-01',
      completedOn: null,
      rewatchCount: 0,
    })
    const wrapper = mountPanel()

    expect(wrapper.get('[data-testid="watchlist-panel-status"]').text()).toBe('Watching')
    const episodes = wrapper.get('[data-testid="watchlist-panel-episodes"]')
    expect((episodes.element as HTMLInputElement).value).toBe('3')

    await wrapper.get('[data-testid="watchlist-panel-plus-one"]').trigger('click')
    await wrapper.findAll('select')[1]!.setValue('2')
    await wrapper.get('[data-testid="watchlist-save"]').trigger('click')
    await flushPromises()

    expect(updateWatchlistItem).toHaveBeenCalledWith('tv-1', {
      status: 'watching',
      rating: 8,
      notes: 'Halfway',
      startedOn: '2026-09-01',
      completedOn: null,
      rewatchCount: 0,
      currentEpisode: 4,
      currentSeason: 2,
    })
  })

  it('does not send episode progress for movies', async () => {
    getWatchlistItem.mockReturnValue({ status: 'completed', currentEpisode: 1 })
    const wrapper = mountPanel({ contentId: 'movie-1', contentType: 'movie' })

    expect(wrapper.find('[data-testid="watchlist-panel-episodes"]').exists()).toBe(false)
    await wrapper.get('[data-testid="watchlist-save"]').trigger('click')
    await flushPromises()

    const [, updates] = updateWatchlistItem.mock.calls[0]!
    expect(updates).not.toHaveProperty('currentEpisode')
    expect(updates).not.toHaveProperty('currentSeason')
  })

  it('removes a saved title', async () => {
    getWatchlistItem.mockReturnValue({ status: 'dropped', currentEpisode: 2 })
    const wrapper = mountPanel()
    await wrapper.get('[data-testid="watchlist-remove"]').trigger('click')
    await flushPromises()

    expect(removeFromWatchlist).toHaveBeenCalledWith('tv-1')
  })
})
