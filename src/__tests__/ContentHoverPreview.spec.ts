import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
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
