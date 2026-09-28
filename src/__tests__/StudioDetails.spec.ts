import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import StudioDetails from '@/views/StudioDetails.vue'
import StudioLinks from '@/components/StudioLinks.vue'
import { getDetailsRouteName, isCatalogEntity } from '@/services/api'
import { collectStudioWorks, studioLinksForContent } from '@/utils/entities'

const getEntityDetails = vi.fn()
const toggleFavorite = vi.fn()

vi.mock('@/stores/entities', () => ({
  useEntityStore: () => ({
    getEntityDetails,
    toggleFavorite,
  }),
}))

vi.mock('@/stores/favorites', () => ({
  useFavoritesStore: () => ({ isFavorite: () => false, load: vi.fn().mockResolvedValue(undefined), toggle: vi.fn() }),
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    isAuthenticated: true,
  }),
}))

const studio = {
  _id: 'studio-1',
  entityType: 'studio' as const,
  name: 'Kyoto Animation',
  nativeName: '京都アニメーション',
  about: 'Animation studio in Uji.',
  imagePath: 'https://cdn.example/kyoani.png',
  isFavorited: false,
  appearances: [
    {
      content: {
        _id: 'movie-1',
        title: 'Koe no Katachi',
        englishTitle: 'A Silent Voice',
        contentType: 'movie' as const,
        releaseDate: '2016-09-17',
        posterPath: '/silent-voice.jpg',
      },
    },
    {
      content: {
        _id: 'show-1',
        title: 'Hyouka',
        contentType: 'tv' as const,
        releaseDate: '2012-04-23',
      },
    },
    {
      content: {
        _id: 'show-2',
        title: 'Violet Evergarden',
        contentType: 'tv' as const,
        releaseDate: '2018-01-11',
      },
    },
    {
      content: {
        _id: 'special-1',
        title: 'Violet Evergarden: Recollections',
        contentType: 'special' as const,
        startSeasonYear: 2021,
      },
    },
  ],
}

const routes = [
  { path: '/studio/:id', name: 'StudioDetails', component: StudioDetails },
  { path: '/movie/:id', name: 'MovieDetails', component: { template: '<div />' } },
  { path: '/tv-show/:id', name: 'TVShowDetails', component: { template: '<div />' } },
  { path: '/login', name: 'login', component: { template: '<div />' } },
]

const mountPage = async () => {
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push('/studio/studio-1')
  await router.isReady()
  const wrapper = mount(StudioDetails, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

describe('StudioDetails', () => {
  beforeEach(() => {
    getEntityDetails.mockReset()
    toggleFavorite.mockReset()
    getEntityDetails.mockResolvedValue(studio)
    toggleFavorite.mockResolvedValue({ ...studio, isFavorited: true })
  })

  it('renders the studio, its series and movies, and a favorite action', async () => {
    const { wrapper } = await mountPage()
    expect(wrapper.text()).toContain('Kyoto Animation')
    expect(wrapper.text()).toContain('Animation studio in Uji.')
    expect(wrapper.get('[data-testid="studio-counts"]').text()).toBe('2 series · 2 movies')
    const series = wrapper.get('[data-testid="studio-series"]').text()
    expect(series.indexOf('Violet Evergarden')).toBeLessThan(series.indexOf('Hyouka'))
    const movies = wrapper.get('[data-testid="studio-movies"]').text()
    expect(movies).toContain('A Silent Voice')
    expect(movies).toContain('Special')
    expect(wrapper.get('[data-testid="favorite-action"]').text()).toContain('Add to Favorites')
  })

  it('opens a title from the studio screen', async () => {
    const { wrapper, router } = await mountPage()
    const push = vi.spyOn(router, 'push')
    await wrapper.get('[data-testid="studio-work-show-1"]').trigger('click')
    expect(push).toHaveBeenCalledWith({
      name: 'TVShowDetails',
      params: { id: 'show-1' },
      query: { from: '/studio/studio-1' },
    })
  })

  it('favorites the studio', async () => {
    const { wrapper } = await mountPage()
    await wrapper.get('[data-testid="favorite-action"]').trigger('click')
    await flushPromises()
    expect(toggleFavorite).toHaveBeenCalled()
    expect(wrapper.get('[data-testid="favorite-action"]').text()).toContain('Favorited')
  })
})

describe('StudioLinks', () => {
  it('links persisted studios and leaves bare names as plain tags', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes })
    await router.push('/movie/movie-1')
    await router.isReady()
    const push = vi.spyOn(router, 'push')
    const wrapper = mount(StudioLinks, {
      props: {
        content: {
          studios: ['Kyoto Animation', 'Pony Canyon'],
          studioEntities: [{ _id: 'studio-1', name: 'Kyoto Animation' }],
        },
      },
      global: { plugins: [router] },
    })
    expect(wrapper.get('[data-testid="studio-link-Pony Canyon"]').attributes()).toHaveProperty(
      'disabled',
    )
    await wrapper.get('[data-testid="studio-link-studio-1"]').trigger('click')
    expect(push).toHaveBeenCalledWith({
      name: 'StudioDetails',
      params: { id: 'studio-1' },
      query: { from: '/movie/movie-1' },
    })
  })
})

describe('studio helpers', () => {
  it('routes studios to their own screen', () => {
    expect(getDetailsRouteName({ contentType: 'studio' })).toBe('StudioDetails')
    expect(getDetailsRouteName({ entityType: 'studio', contentType: 'movie' })).toBe(
      'StudioDetails',
    )
    expect(isCatalogEntity({ contentType: 'studio' })).toBe(true)
  })

  it('falls back to production companies and dedupes studio names', () => {
    expect(
      studioLinksForContent({ studios: [], productionCompanies: ['Pixar', 'pixar'] }),
    ).toEqual([{ name: 'Pixar', id: '' }])
  })

  it('dedupes studio works and never includes unpopulated rows', () => {
    const works = collectStudioWorks({
      ...studio,
      appearances: [...studio.appearances, ...studio.appearances.slice(0, 1), { content: 'raw-id' }],
    })
    expect(works.series.map((work) => work._id)).toEqual(['show-2', 'show-1'])
    expect(works.movies.map((work) => work._id)).toEqual(['special-1', 'movie-1'])
  })
})
