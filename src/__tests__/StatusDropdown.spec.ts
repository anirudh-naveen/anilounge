import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import StatusDropdown from '@/components/StatusDropdown.vue'

const addToWatchlist = vi.fn().mockResolvedValue(true)
const updateWatchlistItem = vi.fn().mockResolvedValue(true)
const getWatchlistItem = vi.fn().mockReturnValue(undefined)

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: vi.fn(), success: vi.fn() }),
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

const mountDropdown = () =>
  mount(StatusDropdown, {
    props: {
      showDropdown: true,
      contentId: 'movie-1',
      contentType: 'movie',
    },
  })

describe('StatusDropdown', () => {
  beforeEach(() => {
    addToWatchlist.mockClear()
    updateWatchlistItem.mockClear()
    getWatchlistItem.mockReset()
    getWatchlistItem.mockReturnValue(undefined)
  })

  it('adds a new title to the watchlist', async () => {
    const wrapper = mountDropdown()

    expect(wrapper.text()).toContain('Add to Watchlist')
    await wrapper.get('.btn-primary').trigger('click')
    await flushPromises()

    expect(addToWatchlist).toHaveBeenCalledWith(
      'movie-1',
      'plan_to_watch',
      undefined,
      undefined,
      undefined,
      undefined,
    )
    expect(updateWatchlistItem).not.toHaveBeenCalled()
  })

  it('prefills and updates an existing watchlist item', async () => {
    getWatchlistItem.mockReturnValue({
      status: 'watching',
      rating: 8,
      currentEpisode: 3,
      notes: 'Halfway',
    })

    const wrapper = mountDropdown()

    expect(wrapper.text()).toContain('Watchlist Status')
    expect((wrapper.get('select').element as HTMLSelectElement).value).toBe('watching')
    expect((wrapper.get('.rating-input').element as HTMLInputElement).value).toBe('8')
    expect((wrapper.get('.notes-textarea').element as HTMLTextAreaElement).value).toBe('Halfway')

    await wrapper.get('select').setValue('completed')
    await wrapper.get('.btn-primary').trigger('click')
    await flushPromises()

    expect(updateWatchlistItem).toHaveBeenCalledWith('movie-1', {
      status: 'completed',
      rating: 8,
      currentEpisode: undefined,
      notes: 'Halfway',
    })
    expect(addToWatchlist).not.toHaveBeenCalled()
  })
})
