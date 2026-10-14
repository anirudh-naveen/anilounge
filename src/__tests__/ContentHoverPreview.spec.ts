import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import ContentHoverPreview from '@/components/ContentHoverPreview.vue'

const addToWatchlist = vi.fn().mockResolvedValue(true)
const updateWatchlistItem = vi.fn().mockResolvedValue(true)
const getWatchlistItem = vi.fn().mockReturnValue(undefined)
const hasSeasonRows = vi.fn().mockReturnValue(false)
const getSoleSeasonId = vi.fn().mockReturnValue(null)
const getWatchlistStatus = vi.fn().mockReturnValue(undefined)
const getWatchlistRating = vi.fn().mockReturnValue(undefined)

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }),
}))

vi.mock('@/stores/content', () => ({
  useContentStore: () => ({
    addToWatchlist,
    updateWatchlistItem,
    getWatchlistItem,
    hasSeasonRows,
    getSoleSeasonId,
    getWatchlistStatus,
    getWatchlistRating,
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

const mountPreview = () => {
  const card = document.createElement('div')
  card.className = 'rail-card'
  document.body.appendChild(card)
  return mount(ContentHoverPreview, {
    attachTo: card,
    props: {
      item,
      isAuthenticated: true,
      showWatchlist: true,
    },
  })
}

/** The open form is teleported to <body>, outside the wrapper. */
const getBody = () => new DOMWrapper(document.body)

describe('ContentHoverPreview watchlist action', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    addToWatchlist.mockClear()
    updateWatchlistItem.mockClear()
    getWatchlistItem.mockReset()
    getWatchlistItem.mockReturnValue(undefined)
    hasSeasonRows.mockReturnValue(false)
    getSoleSeasonId.mockReturnValue(null)
    addToWatchlist.mockClear()
    getWatchlistStatus.mockReturnValue(undefined)
    getWatchlistRating.mockReturnValue(undefined)
  })

  it("saves a one-season series to its season's watchlist row", async () => {
    hasSeasonRows.mockReturnValue(true)
    getSoleSeasonId.mockReturnValue('tv-1-s1')
    const wrapper = mountPreview()

    await wrapper.get('[data-testid="hover-watchlist-btn"]').trigger('click')
    await getBody().get('form').trigger('submit')
    await flushPromises()

    expect(addToWatchlist.mock.calls[0]?.[0]).toBe('tv-1-s1')
  })

  it('offers no add button for a series tracked season by season', () => {
    hasSeasonRows.mockReturnValue(true)
    const wrapper = mountPreview()
    expect(wrapper.find('[data-testid="hover-watchlist-btn"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="hover-season-summary"]').text()).toBe(
      'Add its seasons to your watchlist',
    )
  })

  it("sums up a series from its seasons' status and average rating", () => {
    hasSeasonRows.mockReturnValue(true)
    getWatchlistStatus.mockReturnValue('watching')
    getWatchlistRating.mockReturnValue(8.5)
    const wrapper = mountPreview()
    expect(wrapper.get('[data-testid="hover-season-summary"]').text()).toBe('Watching · 8.5')
  })

  it('lets you add a title that is not on the watchlist', async () => {
    const wrapper = mountPreview()
    const button = wrapper.get('[data-testid="hover-watchlist-btn"]')
    expect(button.text()).toBe('Add to Watchlist')
    expect(button.attributes('disabled')).toBeUndefined()

    await button.trigger('click')
    await getBody().get('form').trigger('submit')
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
    const body = getBody()
    expect((body.get('select').element as HTMLSelectElement).value).toBe('plan_to_watch')
    await body.get('select').setValue('watching')
    await body.get('form').trigger('submit')
    await flushPromises()

    expect(updateWatchlistItem).toHaveBeenCalledWith('tv-1', {
      status: 'watching',
      rating: 9,
      currentEpisode: 4,
      notes: 'Later',
    })
    expect(addToWatchlist).not.toHaveBeenCalled()
  })

  it('limits the rating to tenths and saves it as a number', async () => {
    const wrapper = mountPreview()
    await wrapper.get('[data-testid="hover-watchlist-btn"]').trigger('click')
    const body = getBody()
    const rating = body.get('[data-testid="hover-watchlist-rating"]')

    await rating.setValue('8.56')
    expect((rating.element as HTMLInputElement).value).toBe('8.5')
    await rating.setValue('85')
    expect((rating.element as HTMLInputElement).value).toBe('8.5')

    await body.get('form').trigger('submit')
    await flushPromises()

    expect(addToWatchlist).toHaveBeenCalledWith('tv-1', 'plan_to_watch', 8.5, 0, undefined, undefined)
  })

  it('floats the open form on the page so a scrolling rail cannot clip it', async () => {
    const wrapper = mountPreview()
    const card = wrapper.element.parentElement as HTMLElement
    expect(card.querySelector('.hover-preview')).not.toBeNull()

    await wrapper.get('[data-testid="hover-watchlist-btn"]').trigger('click')
    const preview = document.body.querySelector(':scope > .hover-preview.is-adding')
    expect(preview).not.toBeNull()
    expect(card.contains(preview)).toBe(false)

    await getBody().get('.form-cancel').trigger('click')
    expect(card.querySelector('.hover-preview')).not.toBeNull()
  })

  it('locks episodes to the last one when the status is completed', async () => {
    const wrapper = mount(ContentHoverPreview, {
      attachTo: document.body.appendChild(document.createElement('div')),
      props: { item: { ...item, episodeCount: 28 }, isAuthenticated: true },
    })
    await wrapper.get('[data-testid="hover-watchlist-btn"]').trigger('click')
    const body = getBody()
    await body.get('select').setValue('completed')
    const episodes = body.get('input[type="number"][min="0"]')
    expect((episodes.element as HTMLInputElement).value).toBe('28')
    expect(episodes.attributes('disabled')).toBeDefined()

    await body.get('form').trigger('submit')
    await flushPromises()
    expect(addToWatchlist).toHaveBeenCalledWith(
      'tv-1',
      'completed',
      undefined,
      28,
      undefined,
      undefined,
    )
  })
})
