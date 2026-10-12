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
  naruto: {
    _id: 'naruto',
    title: 'Naruto',
    overview: 'A ninja story.',
    contentType: 'tv',
    genres: [],
    franchise: 'Naruto',
    franchiseId: 'naruto-franchise',
    seasons: [
      { _id: 'n-s1', title: 'Naruto Season 1', label: 'Season 1', seasonNumber: 1, partNumber: 1 },
      { _id: 'n-s2', title: 'Naruto Season 2', label: 'Season 2', seasonNumber: 2, partNumber: 1 },
    ],
  },
  'n-s1': {
    _id: 'n-s1',
    title: 'Naruto Season 1',
    overview: 'The academy years.',
    contentType: 'season',
    genres: [],
    series: { _id: 'naruto', title: 'Naruto' },
    seasonLabel: 'Season 1',
    franchise: 'Naruto',
    franchiseId: 'naruto-franchise',
  },
  'n-s2': {
    _id: 'n-s2',
    title: 'Naruto Season 2',
    overview: 'The chunin exams.',
    contentType: 'season',
    genres: [],
    series: { _id: 'naruto', title: 'Naruto' },
    seasonLabel: 'Season 2',
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
const narutoGuide = {
  episodes: [
    {
      ...episode(1, 'Enter Naruto'),
      cast: [{ name: 'Junko Takeuchi', character: 'Naruto Uzumaki', profilePath: '' }],
      staff: [{ _id: 'staff-dir', name: 'Hayato Date', role: 'Episode Director' }],
    },
    episode(2, 'Exams Begin'),
  ],
  seasons: [season(1, 'n-s1'), season(2, 'n-s2')],
  seriesId: 'naruto',
  currentSeason: null,
}

const characterList = [
  { _id: 'char-naruto', entityType: 'character', name: 'Naruto Uzumaki', appearances: [] },
  { _id: 'char-sasuke', entityType: 'character', name: 'Sasuke Uchiha', appearances: [] },
]

const getContentEpisodes = vi.fn((id: string) =>
  id.startsWith('n')
    ? Promise.resolve({ data: { data: narutoGuide } })
    : Promise.resolve({
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
    isInWatchlist: () => false,
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
    getContentCharacters: (id: string) => Promise.resolve(id.startsWith('n') ? characterList : []),
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
      stubs: {
        WatchlistPanel: true,
        StudioLinks: true,
        WhereToWatch: true,
        ForumHighlights: true,
        RouterLink: { template: '<a><slot /></a>' },
      },
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

  it("shows a season's own title in place when it has one, without reloading episodes", async () => {
    const { wrapper, router } = await mountPage('/tv-show/aot?from=/tv-shows')
    expect(wrapper.get('.show-title').text()).toBe('Attack on Titan')
    expect(wrapper.text()).toContain('Begin')

    await pill(wrapper, 'Season 3').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.params.id).toBe('aot')
    expect(router.currentRoute.value.query.season).toBe('3')
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

describe('TVShowDetails series', () => {
  const castIds = (wrapper: Awaited<ReturnType<typeof mountPage>>['wrapper']) =>
    (wrapper.findComponent({ name: 'EntityCastRow' }).props('items') as Array<{ _id: string }>).map(
      (item) => item._id,
    )

  it('opens on season 1 and swaps the page in place when another season card is picked', async () => {
    const { wrapper, router } = await mountPage('/tv-show/naruto')
    expect(wrapper.get('.show-title').text()).toBe('Naruto Season 1')
    expect(wrapper.text()).toContain('The academy years.')
    expect(wrapper.get('[data-testid="season-card-n-s1"]').classes()).toContain('active')
    expect(wrapper.get('[data-testid="franchise"]').text()).toContain('Naruto')

    await wrapper.get('[data-testid="season-card-n-s2"]').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.params.id).toBe('naruto')
    expect(router.currentRoute.value.query.season).toBe('2')
    expect(wrapper.get('.show-title').text()).toBe('Naruto Season 2')
    expect(wrapper.text()).toContain('The chunin exams.')
    expect(wrapper.text()).toContain('Exams Begin')
    expect(wrapper.find('[data-testid="series-seasons"]').exists()).toBe(true)
    expect(wrapper.find('button.season-pill').exists()).toBe(false)
  })

  it('lays the page out overview, seasons, episodes, characters, then the rest', async () => {
    const { wrapper } = await mountPage('/tv-show/naruto')
    const html = wrapper.html()
    const order = [
      'show-description',
      'series-seasons',
      'episode-row',
      'data-testid="entity-cast-row"',
      'where-to-watch-stub',
      'forum-highlights-stub',
    ].map((marker) => html.indexOf(marker))
    expect(order.every((index) => index >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(wrapper.text()).not.toContain('Related Content')
  })

  it('narrows characters to the open episode and lists its staff in the panel', async () => {
    const { wrapper } = await mountPage('/tv-show/naruto')
    expect(castIds(wrapper)).toEqual(['char-naruto', 'char-sasuke'])

    await wrapper.get('[data-testid="episode-1-1"]').trigger('click')

    expect(castIds(wrapper)).toEqual(['char-naruto'])
    expect(wrapper.get('[data-testid="episode-focus"]').text()).toContain('Enter Naruto')
    expect(wrapper.get('[data-testid="episode-staff"]').text()).toContain('Hayato Date')

    await wrapper.get('[data-testid="episode-focus"] button').trigger('click')
    expect(castIds(wrapper)).toEqual(['char-naruto', 'char-sasuke'])
    expect(wrapper.find('[data-testid="episode-focus"]').exists()).toBe(false)
  })
})
