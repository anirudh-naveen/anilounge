import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import Forum from '@/views/Forum.vue'
import { buildPost, forumRoutes } from './forumFixtures'

const list = vi.fn()
const create = vi.fn()
const auth = { isAuthenticated: true }
const toast = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
}))

vi.mock('vue-toastification', () => ({ useToast: () => toast }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }))
vi.mock('@/services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/api')>()
  return {
    ...actual,
    forumAPI: {
      ...actual.forumAPI,
      list: (...args: unknown[]) => list(...args),
      create: (...args: unknown[]) => create(...args),
      searchTags: vi.fn().mockResolvedValue({ data: { data: [] } }),
    },
  }
})

const pagePayload = (overrides = {}) => ({
  data: {
    data: {
      items: [buildPost()],
      page: 1,
      pageSize: 20,
      total: 1,
      tag: null,
      sort: 'hot',
      ...overrides,
    },
  },
})

const mountAt = async (path: string) => {
  const router = createRouter({ history: createMemoryHistory(), routes: forumRoutes(Forum) })
  await router.push(path)
  await router.isReady()
  const wrapper = mount(Forum, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

describe('Forum', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    auth.isAuthenticated = true
    list.mockResolvedValue(pagePayload())
  })

  it('lists posts with hot sort by default', async () => {
    const { wrapper } = await mountAt('/forum')
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ sort: 'hot', page: 1 }))
    const card = wrapper.get('[data-testid="post-card-p1"]')
    expect(card.text()).toContain('Episode 5 thoughts')
    expect(card.text()).toContain('Frieren · S1E5')
  })

  it('passes tag, episode, kind, and sort from the query', async () => {
    list.mockResolvedValue(
      pagePayload({
        tag: { contentId: 's1', kind: 'series', name: 'Frieren', imagePath: null },
      }),
    )
    const { wrapper } = await mountAt('/forum?tag=s1&season=1&episode=5&kind=review&sort=new')
    expect(list).toHaveBeenCalledWith({
      tag: 's1',
      season: 1,
      episode: 5,
      kind: 'review',
      sort: 'new',
      page: 1,
    })
    expect(wrapper.get('[data-testid="tag-banner"]').text()).toContain('Frieren · S1E5')
    expect(wrapper.get('h1').text()).toBe('Reviews')
  })

  it('reloads when the filter changes', async () => {
    const { router } = await mountAt('/forum')
    await router.push('/forum?kind=discussion')
    await flushPromises()
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'discussion' }))
  })

  it('shows an empty state', async () => {
    list.mockResolvedValue(pagePayload({ items: [], total: 0 }))
    const { wrapper } = await mountAt('/forum')
    expect(wrapper.get('[data-testid="forum-empty"]').text()).toContain('Be the first')
  })

  it('opens the composer with the filtered tag when asked', async () => {
    list.mockResolvedValue(
      pagePayload({
        tag: { contentId: 's1', kind: 'series', name: 'Frieren', imagePath: null },
      }),
    )
    const { wrapper } = await mountAt('/forum?tag=s1&compose=review')
    expect(wrapper.find('[data-testid="forum-composer"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="selected-tags"]').text()).toContain('Frieren')
    expect(wrapper.find('[data-testid="composer-score"]').exists()).toBe(true)
  })

  it('sends guests to sign in instead of composing', async () => {
    auth.isAuthenticated = false
    const { wrapper, router } = await mountAt('/forum')
    await wrapper.get('[data-testid="new-post"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/login')
    expect(toast.info).toHaveBeenCalled()
  })
})
