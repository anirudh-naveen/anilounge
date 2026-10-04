import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import TVShowDetails from '@/views/TVShowDetails.vue'

const titles: Record<string, object> = {
  aot: {
    _id: 'aot',
    title: 'Attack on Titan',
    overview: 'Humanity fights titans.',
    contentType: 'tv',
    genres: [],
  },
  'aot-s3': {
    _id: 'aot-s3',
    title: 'Attack on Titan Season 3',
    overview: 'The walls hide a secret.',
    contentType: 'tv',
    genres: [],
  },
}

const episode = (seasonNumber: number, title: string) => ({
  seasonNumber,
  episodeNumber: 1,
  title,
  overview: '',
  stillPath: '',
  cast: [],
})

const season = (seasonNumber: number, contentId: string | null, overview = '') => ({
  seasonNumber,
  name: `Season ${seasonNumber}`,
  overview,
  posterPath: '',
  airDate: null,
  episodeCount: 1,
  voteAverage: null,
  contentId,
})

const getContentById = vi.fn((id: string) => Promise.resolve({ data: { data: titles[id] } }))
const getContentEpisodes = vi.fn((id: string) =>
  Promise.resolve({
    data: {
      data: {
        episodes: [episode(1, 'Begin'), episode(2, 'Middle'), episode(3, 'Later')],
        seasons: [season(1, 'aot'), season(2, null, 'Season two plot.'), season(3, 'aot-s3')],
        seriesId: 'aot',
        currentSeason: id === 'aot-s3' ? 3 : 1,
      },
    },
  }),
)

vi.mock('@/stores/content', () => ({
  useContentStore: () => ({
    loadWatchlist: vi.fn(),
    getWatchlistItem: () => undefined,
    findContentById: () => undefined,
    cacheContent: vi.fn(),
    scrollToTop: vi.fn(),
    restoreScrollPosition: vi.fn(),
  }),
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ isAuthenticated: false }),
}))

vi.mock('@/services/api', () => ({
  contentAPI: {
    getContentById: (id: string) => getContentById(id),
    getContentEpisodes: (id: string) => getContentEpisodes(id),
    getRelatedContent: vi.fn().mockResolvedValue({
      data: { data: { sequels: [], prequels: [], related: [] } },
    }),
  },
  getPosterUrl: () => '',
  getStillUrl: () => '',
  getProfileUrl: () => '',
  getCardContentTypeDisplay: () => 'TV',
  getDetailsRouteName: () => 'TVShowDetails',
}))

vi.mock('@/stores/entities', () => ({
  useEntityStore: () => ({
    getContentCharacters: vi.fn().mockResolvedValue([]),
  }),
}))

const mountPage = async (path: string) => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/tv-show/:id', name: 'TVShowDetails', component: TVShowDetails }],
  })
  await router.push(path)
  await router.isReady()
  const wrapper = mount(TVShowDetails, {
    global: {
      plugins: [router],
      stubs: { WatchlistPanel: true, EntityCastRow: true, StudioLinks: true },
    },
  })
  await flushPromises()
  return { wrapper, router }
}

const pill = (wrapper: Awaited<ReturnType<typeof mountPage>>['wrapper'], label: string) =>
  wrapper.findAll('button.season-pill').find((button) => button.text() === label)!

describe('TVShowDetails seasons', () => {
  beforeEach(() => {
    getContentById.mockClear()
    getContentEpisodes.mockClear()
  })

  it("opens a season's own title when it has one, without reloading episodes", async () => {
    const { wrapper, router } = await mountPage('/tv-show/aot?from=/tv-shows')
    expect(wrapper.get('.show-title').text()).toBe('Attack on Titan')
    expect(wrapper.text()).toContain('Begin')

    await pill(wrapper, 'Season 3').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.params.id).toBe('aot-s3')
    expect(router.currentRoute.value.query.from).toBe('/tv-shows')
    expect(wrapper.get('.show-title').text()).toBe('Attack on Titan Season 3')
    expect(wrapper.get('[data-testid="season-label"]').text()).toBe('Season 3')
    expect(wrapper.text()).toContain('The walls hide a secret.')
    expect(wrapper.text()).toContain('Later')
    expect(wrapper.text()).not.toContain('Begin')
    expect(getContentEpisodes).toHaveBeenCalledTimes(1)
  })

  it("shows TMDB's season details when the season has no title of its own", async () => {
    const { wrapper, router } = await mountPage('/tv-show/aot')

    await pill(wrapper, 'Season 2').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.params.id).toBe('aot')
    expect(router.currentRoute.value.query.season).toBe('2')
    expect(wrapper.get('.show-title').text()).toBe('Attack on Titan')
    expect(wrapper.get('[data-testid="season-label"]').text()).toBe('Season 2')
    expect(wrapper.text()).toContain('Season two plot.')
    expect(wrapper.text()).toContain('Middle')

    await pill(wrapper, 'Season 1').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.season).toBeUndefined()
    expect(wrapper.text()).toContain('Humanity fights titans.')
    expect(wrapper.text()).toContain('Begin')
  })

  it("selects a season title's own season when opened directly", async () => {
    const { wrapper } = await mountPage('/tv-show/aot-s3')
    expect(wrapper.get('.show-title').text()).toBe('Attack on Titan Season 3')
    expect(wrapper.get('button.season-pill.active').text()).toBe('Season 3')
    expect(wrapper.text()).toContain('Later')
  })
})
