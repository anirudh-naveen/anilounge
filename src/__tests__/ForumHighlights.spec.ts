import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import ForumHighlights from '@/components/ForumHighlights.vue'
import { buildComment, buildPost, forumRoutes } from './forumFixtures'

const highlights = vi.fn()

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() }),
}))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ isAuthenticated: false }) }))
vi.mock('@/services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/api')>()
  return {
    ...actual,
    forumAPI: { ...actual.forumAPI, highlights: (...args: unknown[]) => highlights(...args) },
  }
})

const mountHighlights = async (props: {
  contentId: string
  name: string
  reviewable?: boolean
}) => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: forumRoutes({ template: '<div />' }),
  })
  await router.push('/forum')
  await router.isReady()
  const wrapper = mount(ForumHighlights, { props, global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

describe('ForumHighlights', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows leading posts, highlighted comments, and links', async () => {
    highlights.mockResolvedValue({
      data: {
        data: {
          posts: [buildPost()],
          comments: [buildComment({ postTitle: 'Episode 5 thoughts' })],
          total: 7,
          franchise: { contentId: 'f1', name: 'Frieren' },
        },
      },
    })
    const wrapper = await mountHighlights({ contentId: 's1', name: 'Frieren', reviewable: true })
    expect(highlights).toHaveBeenCalledWith('s1')
    const panel = wrapper.get('[data-testid="forum-highlights"]')
    expect(panel.text()).toContain('Hot in the Forum')
    expect(panel.text()).toContain('7 posts about Frieren or the Frieren franchise')
    expect(panel.text()).toContain('Episode 5 thoughts')
    expect(panel.text()).toContain('Beautiful episode.')
    expect(wrapper.get('[data-testid="highlights-more"]').attributes('href')).toBe('/forum?tag=s1')
    expect(wrapper.get('[data-testid="highlights-review"]').attributes('href')).toBe(
      '/forum?tag=s1&compose=review',
    )
  })

  it('invites the first post and hides the review link for characters', async () => {
    highlights.mockResolvedValue({
      data: { data: { posts: [], comments: [], total: 0, franchise: null } },
    })
    const wrapper = await mountHighlights({ contentId: 'c1', name: 'Himmel' })
    expect(wrapper.text()).toContain('No forum posts about Himmel yet.')
    expect(wrapper.get('[data-testid="forum-highlights"]').classes()).toContain('empty')
    expect(wrapper.find('[data-testid="highlights-review"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="highlights-discuss"]').exists()).toBe(true)
  })

  it('stays hidden when highlights fail to load', async () => {
    highlights.mockRejectedValue(new Error('offline'))
    const wrapper = await mountHighlights({ contentId: 's1', name: 'Frieren' })
    expect(wrapper.find('[data-testid="forum-highlights"]').exists()).toBe(false)
  })
})
