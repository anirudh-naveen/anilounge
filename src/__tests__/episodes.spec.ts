import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import EpisodeRow from '@/components/EpisodeRow.vue'
import type { CatalogEntity, Episode } from '@/types/content'
import {
  episodeKey,
  episodesForSeason,
  formatEpisodeIndex,
  getSeasonNumbers,
} from '@/utils/episodes'

const episode = (overrides: Partial<Episode> = {}): Episode => ({
  seasonNumber: 1,
  episodeNumber: 1,
  title: 'Begin',
  overview: 'The start of the story.',
  stillPath: '',
  airDate: '2024-01-08',
  runtime: 24,
  cast: [{ name: 'Aoi Yuki', character: 'Hero', profilePath: '' }],
  ...overrides,
})

const mountRow = async (props: { episodes: Episode[]; characters?: CatalogEntity[] }) => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/character/:id', name: 'CharacterDetails', component: { template: '<div />' } },
    ],
  })
  await router.push('/')
  await router.isReady()
  return {
    wrapper: mount(EpisodeRow, {
      props,
      global: { plugins: [router] },
    }),
    router,
  }
}

describe('episode helpers', () => {
  it('groups seasons and sorts episode numbers', () => {
    const episodes = [
      episode({ seasonNumber: 2, episodeNumber: 1, title: 'Later' }),
      episode({ episodeNumber: 2, title: 'Next', cast: [] }),
      episode(),
    ]

    expect(getSeasonNumbers(episodes)).toEqual([1, 2])
    expect(episodesForSeason(episodes, 1).map((item) => item.title)).toEqual(['Begin', 'Next'])
    expect(episodeKey(episodes[0]!)).toBe('2-1')
  })

  it('uses SxEx labels only when there is more than one season', () => {
    const first = episode()
    expect(formatEpisodeIndex(first, false)).toBe('Episode 1')
    expect(formatEpisodeIndex(first, true)).toBe('S1E1')
  })
})

describe('EpisodeRow', () => {
  const episodes = [
    episode(),
    episode({
      episodeNumber: 2,
      title: 'Next',
      overview: 'Continues.',
      cast: [],
    }),
    episode({
      seasonNumber: 2,
      episodeNumber: 1,
      title: 'Later',
      overview: 'Season two.',
      cast: [],
    }),
  ]

  it('expands title, description, and cast on the same page', async () => {
    const { wrapper } = await mountRow({ episodes })

    expect(wrapper.find('a').exists()).toBe(false)
    expect(wrapper.text()).toContain('Begin')
    expect(wrapper.text()).not.toContain('The start of the story.')

    await wrapper.get('[data-testid="episode-1-1"]').trigger('click')

    expect(wrapper.text()).toContain('The start of the story.')
    expect(wrapper.text()).toContain('Aoi Yuki')
    expect(wrapper.text()).toContain('Hero')
    expect(wrapper.find('a').exists()).toBe(false)
  })

  it('collapses when the same episode is clicked again', async () => {
    const { wrapper } = await mountRow({ episodes })
    const card = wrapper.get('[data-testid="episode-1-1"]')

    await card.trigger('click')
    expect(wrapper.text()).toContain('The start of the story.')

    await card.trigger('click')
    expect(wrapper.text()).not.toContain('The start of the story.')
  })

  it('filters the strip to the selected season', async () => {
    const { wrapper } = await mountRow({ episodes })

    expect(wrapper.text()).toContain('Begin')
    expect(wrapper.text()).not.toContain('Later')

    await wrapper.get('button.season-pill:nth-child(2)').trigger('click')
    expect(wrapper.text()).toContain('Later')
    expect(wrapper.text()).not.toContain('Begin')
  })

  it('shows series characters on every expanded episode and opens their screen', async () => {
    const characters: CatalogEntity[] = [
      {
        _id: 'char-hero',
        entityType: 'character',
        name: 'Hero (voice)',
        appearances: [{ content: 'show-1', role: 'Main' }],
      },
      ...Array.from({ length: 11 }, (_, index) => ({
        _id: `char-${index}`,
        entityType: 'character' as const,
        name: `Extra ${index}`,
        appearances: [{ content: 'show-1', role: 'Supporting' }],
      })),
    ]
    const { wrapper, router } = await mountRow({ episodes, characters })
    await wrapper.get('[data-testid="episode-1-1"]').trigger('click')
    expect(wrapper.get('[data-testid="character-card-char-hero"]').text()).toContain('Hero')
    expect(wrapper.get('[data-testid="character-card-char-hero"]').text()).not.toContain('Main')
    expect(wrapper.get('[data-testid="character-card-char-hero"]').text()).not.toContain('voice')
    expect(wrapper.findAll('[data-testid^="character-card-"]')).toHaveLength(10)
    expect(wrapper.text()).toContain('+2 more')
    const push = vi.spyOn(router, 'push')
    await wrapper.get('[data-testid="character-card-char-hero"]').trigger('click')
    expect(push).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'CharacterDetails',
        params: { id: 'char-hero' },
      }),
    )
  })
})
