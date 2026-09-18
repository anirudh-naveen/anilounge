import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import VoiceActorDetails from '@/views/VoiceActorDetails.vue'

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

const voiceActor = {
  _id: 'va-1',
  entityType: 'voice_actor' as const,
  name: 'Mayumi Tanaka',
  nativeName: '田中 真弓',
  about: 'Japanese voice actress.',
  imagePath: 'https://cdn.example/mayumi.jpg',
  isFavorited: false,
  appearances: [
    {
      role: 'Main',
      characterName: 'Monkey D. Luffy',
      language: 'Japanese',
      character: {
        _id: 'char-1',
        name: 'Monkey D. Luffy',
        imagePath: 'https://cdn.example/luffy.jpg',
        entityType: 'character' as const,
      },
      content: {
        _id: 'show-1',
        title: 'One Piece',
        englishTitle: 'One Piece',
        contentType: 'tv' as const,
        posterPath: '/onepiece.jpg',
      },
    },
    {
      role: 'Supporting',
      characterName: 'Nami',
      language: 'Japanese',
      character: {
        _id: 'char-2',
        name: 'Nami',
        imagePath: 'https://cdn.example/nami.jpg',
        entityType: 'character' as const,
      },
    },
  ],
}

const mountPage = async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/voice-actor/:id', name: 'VoiceActorDetails', component: VoiceActorDetails },
      { path: '/character/:id', name: 'CharacterDetails', component: { template: '<div />' } },
      { path: '/tv-show/:id', name: 'TVShowDetails', component: { template: '<div />' } },
      { path: '/login', name: 'login', component: { template: '<div />' } },
    ],
  })
  await router.push('/voice-actor/va-1')
  await router.isReady()
  const wrapper = mount(VoiceActorDetails, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

describe('VoiceActorDetails', () => {
  beforeEach(() => {
    getEntityDetails.mockReset()
    toggleFavorite.mockReset()
    getEntityDetails.mockResolvedValue(voiceActor)
    toggleFavorite.mockResolvedValue({ ...voiceActor, isFavorited: true })
  })

  it('renders biography, every voiced character, and a favorite action', async () => {
    const { wrapper } = await mountPage()
    expect(wrapper.text()).toContain('Mayumi Tanaka')
    expect(wrapper.text()).toContain('Japanese voice actress.')
    expect(wrapper.text()).toContain('Characters')
    expect(wrapper.text()).toContain('Monkey D. Luffy')
    expect(wrapper.text()).toContain('Nami')
    expect(wrapper.text()).toContain('One Piece')
    expect(wrapper.get('[data-testid="favorite-action"]').text()).toContain('Add to Favorites')
  })

  it('opens a voiced character from the voice-actor screen', async () => {
    const { wrapper, router } = await mountPage()
    const push = vi.spyOn(router, 'push')
    await wrapper.get('[data-testid="voiced-character-char-1"]').trigger('click')
    expect(push).toHaveBeenCalledWith({
      name: 'CharacterDetails',
      params: { id: 'char-1' },
      query: { from: '/voice-actor/va-1' },
    })
  })
})
