import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import CharacterDetails from '@/views/CharacterDetails.vue'
import { getDetailsRouteName, isCatalogEntity } from '@/services/api'

const getEntityDetails = vi.fn()
const toggleFavorite = vi.fn()

vi.mock('@/stores/entities', () => ({
  useEntityStore: () => ({
    getEntityDetails,
    toggleFavorite,
  }),
}))

vi.mock('@/stores/favorites', () => ({
  useFavoritesStore: () => ({
    isFavorite: () => false,
    load: vi.fn().mockResolvedValue(undefined),
    toggle: vi.fn(),
  }),
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    isAuthenticated: true,
  }),
}))

const character = {
  _id: 'char-1',
  entityType: 'character' as const,
  name: 'Monkey D. Luffy',
  nativeName: 'モンキー・D・ルフィ',
  about: 'Captain of the Straw Hat Pirates.',
  imagePath: 'https://cdn.example/luffy.jpg',
  isFavorited: false,
  appearances: [
    {
      role: 'Main',
      content: {
        _id: 'show-1',
        title: 'One Piece',
        englishTitle: 'One Piece',
        contentType: 'tv' as const,
        posterPath: '/onepiece.jpg',
      },
      voiceActors: [
        {
          name: 'Tanaka, Mayumi',
          language: 'Japanese',
          imagePath: 'https://cdn.example/mayumi.jpg',
          entity: 'va-1',
        },
      ],
    },
  ],
}

const mountPage = async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/character/:id', name: 'CharacterDetails', component: CharacterDetails },
      { path: '/voice-actor/:id', name: 'VoiceActorDetails', component: { template: '<div />' } },
      { path: '/tv-show/:id', name: 'TVShowDetails', component: { template: '<div />' } },
      { path: '/login', name: 'login', component: { template: '<div />' } },
    ],
  })
  await router.push('/character/char-1')
  await router.isReady()
  const wrapper = mount(CharacterDetails, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

describe('getDetailsRouteName for characters', () => {
  it('routes characters to their own screen', () => {
    expect(getDetailsRouteName({ contentType: 'character' })).toBe('CharacterDetails')
    expect(getDetailsRouteName({ entityType: 'character', contentType: 'movie' })).toBe(
      'CharacterDetails',
    )
    expect(getDetailsRouteName({ contentType: 'voice_actor' })).toBe('VoiceActorDetails')
    expect(isCatalogEntity({ contentType: 'character' })).toBe(true)
    expect(isCatalogEntity({ contentType: 'voice_actor' })).toBe(true)
    expect(isCatalogEntity({ contentType: 'tv' })).toBe(false)
  })
})

describe('CharacterDetails', () => {
  beforeEach(() => {
    getEntityDetails.mockReset()
    toggleFavorite.mockReset()
    getEntityDetails.mockResolvedValue(character)
    toggleFavorite.mockResolvedValue({ ...character, isFavorited: true })
  })

  it('renders biography, appearances, and a favorite action', async () => {
    const { wrapper } = await mountPage()
    expect(wrapper.text()).toContain('Monkey D. Luffy')
    expect(wrapper.text()).toContain('Captain of the Straw Hat Pirates.')
    expect(wrapper.text()).toContain('One Piece')
    expect(wrapper.text()).toContain('Main')
    expect(wrapper.get('[data-testid="favorite-action"]').text()).toContain('Add to Favorites')
    expect(wrapper.get('[data-testid="voice-actor-row"]').text()).toContain('Mayumi Tanaka')
    expect(wrapper.get('[data-testid="voice-actor-row"]').text()).toContain('Japanese')
  })

  it('lists each franchise the character appears in once', async () => {
    getEntityDetails.mockResolvedValue({
      ...character,
      appearances: [
        { role: 'Main', content: { _id: 'show-1', title: 'One Piece', franchise: 'One Piece' } },
        { role: 'Main', content: { _id: 'movie-1', title: 'One Piece Film: Red', franchise: 'One Piece' } },
        { role: 'Cameo', content: { _id: 'special-1', title: 'Crossover', franchise: 'Jump Heroes' } },
        { role: 'Cameo', content: { _id: 'special-2', title: 'Standalone', franchise: null } },
      ],
    })
    const { wrapper } = await mountPage()
    const chips = wrapper.findAll('[data-testid="character-franchises"] .franchise-chip')
    expect(chips.map((chip) => chip.text())).toEqual(['One Piece', 'Jump Heroes'])
    expect(wrapper.get('[data-testid="character-franchises"]').text()).toContain('Franchises')
  })

  it('groups titles under their franchise, franchises first', async () => {
    getEntityDetails.mockResolvedValue({
      ...character,
      appearances: [
        { role: 'Cameo', content: { _id: 'solo', title: 'Standalone', franchise: null } },
        { role: 'Main', content: { _id: 'show-1', title: 'One Piece', franchise: 'One Piece' } },
        { role: 'Main', content: { _id: 'movie-1', title: 'Film Red', franchise: 'One Piece' } },
      ],
    })
    const { wrapper } = await mountPage()
    const groups = wrapper.findAll('[data-testid="appearance-group"]')
    expect(groups).toHaveLength(2)
    expect(groups[0].get('.group-title').text()).toBe('One Piece')
    expect(groups[0].findAll('h5').map((h) => h.text())).toEqual(['One Piece', 'Film Red'])
    expect(groups[1].get('.group-title').text()).toBe('Other titles')
    expect(groups[1].findAll('h5').map((h) => h.text())).toEqual(['Standalone'])
  })

  it('shows titles without a group heading when none has a franchise', async () => {
    const { wrapper } = await mountPage()
    expect(wrapper.findAll('[data-testid="appearance-group"]')).toHaveLength(1)
    expect(wrapper.find('.group-title').exists()).toBe(false)
  })

  it('hides the franchise row when no title has a franchise', async () => {
    const { wrapper } = await mountPage()
    expect(wrapper.find('[data-testid="character-franchises"]').exists()).toBe(false)
  })

  it('opens a voice actor from the character screen', async () => {
    const { wrapper, router } = await mountPage()
    const push = vi.spyOn(router, 'push')
    await wrapper.get('[data-testid="voice-actor-card"]').trigger('click')
    expect(push).toHaveBeenCalledWith({
      name: 'VoiceActorDetails',
      params: { id: 'va-1' },
      query: { from: '/character/char-1' },
    })
  })

  it('opens an appearance title from the character screen', async () => {
    const { wrapper, router } = await mountPage()
    const push = vi.spyOn(router, 'push')
    await wrapper.get('[data-testid="appearance-show-1"]').trigger('click')
    expect(push).toHaveBeenCalledWith({
      name: 'TVShowDetails',
      params: { id: 'show-1' },
      query: { from: '/character/char-1' },
    })
  })
})
