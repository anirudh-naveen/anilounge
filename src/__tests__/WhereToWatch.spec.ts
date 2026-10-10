import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import WhereToWatch from '@/components/WhereToWatch.vue'

const whereToWatch = vi.fn()

vi.mock('@/services/api', () => ({
  contentAPI: { whereToWatch: (...args: unknown[]) => whereToWatch(...args) },
}))

const reply = (data: object) => ({ data: { data } })

describe('WhereToWatch', () => {
  beforeEach(() => {
    whereToWatch.mockReset()
  })

  it('lists streaming links and regional services with the JustWatch credit', async () => {
    whereToWatch.mockResolvedValue(
      reply({
        region: 'US',
        streaming: [
          { site: 'Crunchyroll', url: 'https://www.crunchyroll.com/series/x', language: null },
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
    const crunchyroll = wrapper.get('[data-testid="watch-link-Crunchyroll"]')
    expect(crunchyroll.attributes('href')).toBe('https://www.crunchyroll.com/series/x')
    expect(crunchyroll.attributes('data-open-with')).toBe('app')
    expect(wrapper.get('[data-testid="watch-link-Netflix"]').text()).toContain('Japanese')
    expect(wrapper.find('img[alt="Crunchyroll"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Buy or rent')
    expect(wrapper.text()).toContain('Apple TV')
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
