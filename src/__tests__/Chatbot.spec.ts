import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import Chatbot from '@/components/Chatbot.vue'
import { aiAPI } from '@/services/api'

vi.mock('@/services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/api')>()
  return {
    ...actual,
    aiAPI: {
      ...actual.aiAPI,
      chat: vi.fn(),
    },
  }
})

const catalogHit = {
  _id: 'ghibli-1',
  title: 'Spirited Away',
  englishTitle: 'Spirited Away',
  nativeTitle: '千と千尋の神隠し',
  overview: 'A girl enters the spirit world.',
  contentType: 'movie' as const,
  posterPath: '/spirited.jpg',
  genres: [{ name: 'Fantasy' }],
  why: 'from Studio Ghibli, strongly rated (8.6)',
}

const mountChat = async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/search', name: 'search', component: { template: '<div />' } },
      {
        path: '/movie/:id',
        name: 'MovieDetails',
        component: { template: '<div />' },
      },
    {
      path: '/tv/:id',
      name: 'TVShowDetails',
      component: { template: '<div />' },
    },
    {
      path: '/character/:id',
      name: 'CharacterDetails',
      component: { template: '<div />' },
    },
    ],
  })
  await router.push('/search')
  await router.isReady()

  const wrapper = mount(Chatbot, {
    props: { showChatbot: true },
    global: { plugins: [router] },
  })
  await flushPromises()
  return { wrapper, router }
}

describe('Chatbot', () => {
  beforeEach(() => {
    vi.mocked(aiAPI.chat).mockReset()
  })

  it('renders catalog cards from /ai/chat and emits them for Search', async () => {
    vi.mocked(aiAPI.chat).mockResolvedValue({
      data: {
        success: true,
        data: {
          response: 'Here are Studio Ghibli films from the catalog.',
          results: [catalogHit],
        },
      },
    } as never)

    const { wrapper } = await mountChat()
    await wrapper.get('[data-testid="chat-input"]').setValue('Studio Ghibli movies')
    await wrapper.get('[data-testid="chat-send"]').trigger('click')
    await flushPromises()

    expect(aiAPI.chat).toHaveBeenCalledWith('Studio Ghibli movies', [])
    expect(wrapper.get('[data-testid="chat-results"]').text()).toContain('Spirited Away')
    expect(wrapper.get('[data-testid="chat-results"]').text()).toContain('from Studio Ghibli')
    expect(wrapper.emitted('search-results')?.[0]?.[0]).toEqual([catalogHit])
  })

  it('opens a catalog detail route from a result card', async () => {
    vi.mocked(aiAPI.chat).mockResolvedValue({
      data: {
        success: true,
        data: { response: 'Found it.', results: [catalogHit] },
      },
    } as never)

    const { wrapper, router } = await mountChat()
    const push = vi.spyOn(router, 'push')
    await wrapper.get('[data-testid="chat-input"]').setValue('Spirited Away')
    await wrapper.get('[data-testid="chat-send"]').trigger('click')
    await flushPromises()

    await wrapper.get('.chat-result-card').trigger('click')
    expect(push).toHaveBeenCalledWith({
      name: 'MovieDetails',
      params: { id: 'ghibli-1' },
      query: { from: '/search' },
    })
  })
})
