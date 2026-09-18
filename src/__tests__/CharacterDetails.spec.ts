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
