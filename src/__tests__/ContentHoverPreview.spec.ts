import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ContentHoverPreview from '@/components/ContentHoverPreview.vue'

const addToWatchlist = vi.fn().mockResolvedValue(true)
const updateWatchlistItem = vi.fn().mockResolvedValue(true)
const getWatchlistItem = vi.fn().mockReturnValue(undefined)

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }),
}))

vi.mock('@/stores/content', () => ({
  useContentStore: () => ({
    addToWatchlist,
    updateWatchlistItem,
    getWatchlistItem,
  }),
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    isAuthenticated: true,
  }),
}))

const item = {
  _id: 'tv-1',
  title: 'Frieren',
  overview: 'An elf journeys after the hero party disbands.',
  contentType: 'tv' as const,
  genres: [],
}

const mountPreview = () =>
  mount(ContentHoverPreview, {
    props: {
      item,
      isAuthenticated: true,
      showWatchlist: true,
    },
  })

describe('ContentHoverPreview watchlist action', () => {
  beforeEach(() => {
    addToWatchlist.mockClear()
    updateWatchlistItem.mockClear()
    getWatchlistItem.mockReset()
    getWatchlistItem.mockReturnValue(undefined)
  })

  it('lets you add a title that is not on the watchlist', async () => {
    const wrapper = mountPreview()
    const button = wrapper.get('[data-testid="hover-watchlist-btn"]')
    expect(button.text()).toBe('Add to Watchlist')
    expect(button.attributes('disabled')).toBeUndefined()

    await button.trigger('click')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(addToWatchlist).toHaveBeenCalled()
    expect(updateWatchlistItem).not.toHaveBeenCalled()
  })

  it('shows the current status and updates an existing item', async () => {
    getWatchlistItem.mockReturnValue({
      status: 'plan_to_watch',
      rating: 9,
      currentEpisode: 4,
      notes: 'Later',
    })

    const wrapper = mountPreview()
    const button = wrapper.get('[data-testid="hover-watchlist-btn"]')
    expect(button.text()).toBe('Planned')
    expect(button.attributes('disabled')).toBeUndefined()

    await button.trigger('click')
    expect((wrapper.get('select').element as HTMLSelectElement).value).toBe('plan_to_watch')
    await wrapper.get('select').setValue('watching')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(updateWatchlistItem).toHaveBeenCalledWith('tv-1', {
      status: 'watching',
      rating: 9,
      currentEpisode: 4,
      notes: 'Later',
    })
    expect(addToWatchlist).not.toHaveBeenCalled()
  })
})
