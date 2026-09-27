import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import EpisodeRow from '@/components/EpisodeRow.vue'
import type { CatalogEntity, Episode, SeasonSummary, UnifiedContent } from '@/types/content'
import {
  episodeKey,
  episodesForSeason,
  findRouteSeason,
  formatEpisodeIndex,
  formatSeasonLabel,
  getSeasonNumbers,
  seasonContent,
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

const mountRow = async (props: {
  episodes: Episode[]
  characters?: CatalogEntity[]
  selectedSeason?: number | null
}) => {
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

describe('season helpers', () => {
  const season = (overrides: Partial<SeasonSummary> = {}): SeasonSummary => ({
    seasonNumber: 1,
    name: 'Season 1',
    overview: '',
    posterPath: '',
    airDate: '2013-04-07',
    episodeCount: 25,
    voteAverage: null,
    contentId: null,
    ...overrides,
  })
  const seasons = [
    season({ contentId: 'aot' }),
    season({ seasonNumber: 2, name: 'Season 2' }),
    season({ seasonNumber: 3, name: 'Season 3', contentId: 'aot-s3' }),
  ]
  const series = {
    _id: 'aot',
    title: 'Attack on Titan',
    overview: 'Humanity fights titans.',
    contentType: 'tv',
    genres: [],
    posterPath: '/show.jpg',
    malScore: 8.5,
    malScoredBy: 1000,
    malStatus: 'currently_airing',
  } as UnifiedContent

  it('labels seasons with their own name when TMDB gives one', () => {
    expect(formatSeasonLabel({ seasonNumber: 2, name: 'Season 2' })).toBe('Season 2')
    expect(formatSeasonLabel({ seasonNumber: 4, name: 'The Final Season' })).toBe(
      'Season 4 · The Final Season',
    )
  })

  it('resolves the season a route shows', () => {
    expect(findRouteSeason(seasons, 'aot')?.seasonNumber).toBe(1)
    expect(findRouteSeason(seasons, 'aot', '2')?.seasonNumber).toBe(2)
    expect(findRouteSeason(seasons, 'aot-s3')?.seasonNumber).toBe(3)
    expect(findRouteSeason(seasons, 'aot', '3')?.seasonNumber).toBe(1)
    expect(findRouteSeason(seasons, 'other')).toBeNull()
  })

  it("builds a season's details from TMDB season fields", () => {
    const view = seasonContent(
      series,
      season({
        seasonNumber: 2,
        overview: 'Season two plot.',
        posterPath: '/s2.jpg',
        airDate: '2017-04-01',
        episodeCount: 12,
        voteAverage: 8.2,
      }),
      false,
    )
    expect(view._id).toBe('aot')
    expect(view.overview).toBe('Season two plot.')
    expect(view.posterPath).toBe('/s2.jpg')
    expect(view.releaseDate).toBe('2017-04-01')
    expect(view.episodeCount).toBe(12)
    expect(view.malScore).toBeUndefined()
    expect(view.unifiedScore).toBe(8.2)
    expect(view.malStatus).toBe('finished_airing')
  })

  it("keeps the show's score and schedule when the season has none and is the latest", () => {
    const view = seasonContent(series, season({ seasonNumber: 2 }), true)
    expect(view.malScore).toBe(8.5)
    expect(view.malStatus).toBe('currently_airing')
    expect(view.overview).toBe('Humanity fights titans.')
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
    expect(wrapper.emitted('select-season')).toEqual([[2]])
  })

  it('follows the season chosen by the parent', async () => {
    const { wrapper } = await mountRow({ episodes, selectedSeason: 2 })
    expect(wrapper.text()).toContain('Later')
    expect(wrapper.text()).not.toContain('Begin')

    await wrapper.get('button.season-pill:nth-child(1)').trigger('click')
    expect(wrapper.emitted('select-season')).toEqual([[1]])
    expect(wrapper.text()).toContain('Later')

    await wrapper.setProps({ selectedSeason: 1 })
    expect(wrapper.text()).toContain('Begin')
    expect(wrapper.get('button.season-pill.active').text()).toBe('Season 1')
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
