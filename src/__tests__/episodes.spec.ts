import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import EpisodeRow from '@/components/EpisodeRow.vue'
import type { Episode } from '@/types/content'
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
    const wrapper = mount(EpisodeRow, { props: { episodes } })

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
    const wrapper = mount(EpisodeRow, { props: { episodes } })
    const card = wrapper.get('[data-testid="episode-1-1"]')

    await card.trigger('click')
    expect(wrapper.text()).toContain('The start of the story.')

    await card.trigger('click')
    expect(wrapper.text()).not.toContain('The start of the story.')
  })

  it('filters the strip to the selected season', async () => {
    const wrapper = mount(EpisodeRow, { props: { episodes } })

    expect(wrapper.text()).toContain('Begin')
    expect(wrapper.text()).not.toContain('Later')

    await wrapper.get('button.season-pill:nth-child(2)').trigger('click')
    expect(wrapper.text()).toContain('Later')
    expect(wrapper.text()).not.toContain('Begin')
  })
})
