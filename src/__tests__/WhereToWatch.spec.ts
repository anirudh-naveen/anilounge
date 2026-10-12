import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import WhereToWatch from '@/components/WhereToWatch.vue'

const whereToWatch = vi.fn()

vi.mock('@/services/api', () => ({
  contentAPI: { whereToWatch: (...args: unknown[]) => whereToWatch(...args) },
}))

const inUS = vi.hoisted(() => ({ value: true }))

vi.mock('@/utils/nativeApp', () => ({
  isNativeApp: false,
  isViewerInUS: () => inUS.value,
  openInOtherApp: vi.fn(),
}))

const reply = (data: object) => ({ data: { data } })

describe('WhereToWatch', () => {
  beforeEach(() => {
    whereToWatch.mockReset()
    inUS.value = true
  })

  it('stays hidden, without asking, for viewers outside the United States', async () => {
    inUS.value = false
    const wrapper = mount(WhereToWatch, { props: { contentId: 'c1' } })
    await flushPromises()
    expect(whereToWatch).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="where-to-watch"]').exists()).toBe(false)
  })

  it('shows one logo per service, named on hover, with the JustWatch credit', async () => {
    whereToWatch.mockResolvedValue(
      reply({
        region: 'US',
        streaming: [
          {
            site: 'Crunchyroll',
            url: 'https://www.crunchyroll.com/series/x',
            language: null,
            icon: 'https://s4.anilist.co/cr.png',
            color: '#F88D1A',
          },
          { site: 'Netflix', url: 'https://www.netflix.com/title/1', language: 'Japanese' },
        ],
        providers: {
          link: 'https://www.themoviedb.org/tv/1/watch?locale=US',
          stream: [{ id: 283, name: 'Crunchyroll', logo: 'https://image.tmdb.org/t/p/w92/cr.jpg' }],
          buy: [{ id: 2, name: 'Apple TV', logo: null }],
        },
      }),
    )
    const wrapper = mount(WhereToWatch, { props: { contentId: 'c1' } })
    await flushPromises()

    expect(whereToWatch).toHaveBeenCalledWith('c1', expect.stringMatching(/^[A-Z]{2}$/))
    const crunchyroll = wrapper.get('[data-testid="watch-logo-link-Crunchyroll"]')
    expect(crunchyroll.attributes('href')).toBe('https://www.crunchyroll.com/series/x')
    expect(crunchyroll.attributes('title')).toBe('Crunchyroll')
    expect(crunchyroll.attributes('target')).toBe('_blank')
    expect(crunchyroll.get('img').attributes('src')).toBe('https://s4.anilist.co/cr.png')
    expect(wrapper.get('[data-testid="watch-logo-link-Netflix"]').attributes('title')).toBe(
      'Netflix (Japanese)',
    )
    // TMDB's Crunchyroll is the direct link already; Apple TV opens TMDB's list.
    expect(wrapper.find('[data-testid="watch-logo-provider-283"]').exists()).toBe(false)
    const apple = wrapper.get('[data-testid="watch-logo-provider-2"]')
    expect(apple.attributes('title')).toBe('Apple TV (buy or rent)')
    expect(apple.attributes('href')).toBe('https://www.themoviedb.org/tv/1/watch?locale=US')
    expect(wrapper.text()).toContain('JustWatch via TMDB')
  })

  it('renders nothing when there is nowhere to watch', async () => {
    whereToWatch.mockResolvedValue(
      reply({ region: 'US', streaming: [], providers: { link: null, stream: [], buy: [] } }),
    )
    const wrapper = mount(WhereToWatch, { props: { contentId: 'c1' } })
    await flushPromises()
    expect(wrapper.find('[data-testid="where-to-watch"]').exists()).toBe(false)
  })

  it('stays hidden when the lookup fails', async () => {
    whereToWatch.mockImplementation(async () => {
      throw new Error('offline')
    })
    const wrapper = mount(WhereToWatch, { props: { contentId: 'c2' } })
    await flushPromises()
    expect(wrapper.find('[data-testid="where-to-watch"]').exists()).toBe(false)
  })
})
