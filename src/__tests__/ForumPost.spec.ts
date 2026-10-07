import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import ForumPost from '@/views/ForumPost.vue'
import { buildComment, buildPost, forumRoutes } from './forumFixtures'

const get = vi.fn()
const comment = vi.fn()
const removeComment = vi.fn()
const like = vi.fn()
const auth = { isAuthenticated: true }
const toast = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
}))

vi.mock('vue-toastification', () => ({ useToast: () => toast }))

const watchlist = vi.hoisted(() => ({
  items: new Map<string, { rating?: number }>(),
  add: vi.fn(),
  update: vi.fn(),
}))
vi.mock('@/stores/content', () => ({
  useContentStore: () => ({
    loadWatchlist: vi.fn(),
    getWatchlistItem: (id: string) => watchlist.items.get(id),
    addToWatchlist: (...args: unknown[]) => watchlist.add(...args),
    updateWatchlistItem: (...args: unknown[]) => watchlist.update(...args),
  }),
}))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }))
vi.mock('@/stores/badges', () => ({
  useBadgesStore: () => ({
    load: () => Promise.resolve(),
    badgesFor: () => [],
    featuredFor: () => null,
    choiceFor: () => null,
  }),
}))
vi.mock('@/services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/api')>()
  return {
    ...actual,
    forumAPI: {
      ...actual.forumAPI,
      get: (...args: unknown[]) => get(...args),
      comment: (...args: unknown[]) => comment(...args),
      removeComment: (...args: unknown[]) => removeComment(...args),
      like: (...args: unknown[]) => like(...args),
    },
  }
})

const mountPost = async () => {
  const router = createRouter({ history: createMemoryHistory(), routes: forumRoutes(ForumPost) })
  await router.push('/forum/post/p1')
  await router.isReady()
  const wrapper = mount(ForumPost, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

describe('ForumPost', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    auth.isAuthenticated = true
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    get.mockResolvedValue({
      data: {
        data: {
          post: buildPost({ commentCount: 2 }),
          comments: [
            buildComment(),
            buildComment({ id: 'c2', parentId: 'c1', body: 'Agreed!', author: null }),
          ],
        },
      },
    })
  })

  it('shows the post and threads replies under their comment', async () => {
    const wrapper = await mountPost()
    expect(get).toHaveBeenCalledWith('p1')
    expect(wrapper.get('[data-testid="post-body"]').text()).toContain('What did everyone think?')
    const thread = wrapper.get('.comment-thread')
    expect(thread.text()).toContain('Beautiful episode.')
    expect(thread.get('.reply-list').text()).toContain('Agreed!')
  })

  it('covers spoiler posts until opened', async () => {
    get.mockResolvedValue({
      data: { data: { post: buildPost({ spoiler: true }), comments: [] } },
    })
    const wrapper = await mountPost()
    expect(wrapper.find('[data-testid="post-body"]').exists()).toBe(false)
    await wrapper.get('[data-testid="post-spoiler-cover"]').trigger('click')
    expect(wrapper.find('[data-testid="post-body"]').exists()).toBe(true)
  })

  it('adds a comment and shows a language warning', async () => {
    comment.mockResolvedValue({
      data: {
        data: buildComment({ id: 'c3', body: 'What a s*** ending', canEdit: true }),
        warning: {
          count: 1,
          limit: 3,
          alerted: false,
          category: 'curse',
          message: 'Warning 1 of 3.',
        },
      },
    })
    const wrapper = await mountPost()
    await wrapper.get('[data-testid="comment-form"] textarea').setValue('What a shit ending')
    await wrapper.get('[data-testid="comment-form"]').trigger('submit')
    await flushPromises()
    expect(comment).toHaveBeenCalledWith('p1', 'What a shit ending', null)
    expect(wrapper.get('[data-testid="comments"]').text()).toContain('What a s*** ending')
    expect(toast.warning).toHaveBeenCalledWith('Warning 1 of 3.', expect.anything())
  })

  it('replies under the top-level comment', async () => {
    comment.mockResolvedValue({
      data: { data: buildComment({ id: 'c4', parentId: 'c1', body: 'Same here' }) },
    })
    const wrapper = await mountPost()
    await wrapper.get('[data-testid="comment-c1"] [data-testid="comment-reply"]').trigger('click')
    await wrapper.get('[data-testid="reply-form"] textarea').setValue('@mika Same here')
    await wrapper.get('[data-testid="reply-form"]').trigger('submit')
    await flushPromises()
    expect(comment).toHaveBeenCalledWith('p1', '@mika Same here', 'c1')
    expect(wrapper.get('.reply-list').text()).toContain('Same here')
  })

  it('blanks a deleted comment that has replies', async () => {
    get.mockResolvedValue({
      data: {
        data: {
          post: buildPost(),
          comments: [
            buildComment({ canDelete: true, canEdit: true }),
            buildComment({ id: 'c2', parentId: 'c1', body: 'Agreed!' }),
          ],
        },
      },
    })
    removeComment.mockResolvedValue({ data: { data: { removed: false } } })
    const wrapper = await mountPost()
    await wrapper.get('[data-testid="comment-c1"] [data-testid="comment-delete"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="comment-c1"]').text()).toBe('[deleted]')
    expect(wrapper.text()).toContain('Agreed!')
  })

  it('lets the author edit and delete, and not like their own post', async () => {
    get.mockResolvedValue({
      data: { data: { post: buildPost({ canEdit: true, canDelete: true }), comments: [] } },
    })
    const wrapper = await mountPost()
    expect(wrapper.find('[data-testid="post-edit"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="post-delete"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="post-like"]').attributes('disabled')).toBeDefined()
    await wrapper.get('[data-testid="post-edit"]').trigger('click')
    expect(wrapper.find('[data-testid="forum-composer"]').exists()).toBe(true)
  })

  it('likes a post', async () => {
    like.mockResolvedValue({ data: { data: { liked: true, likeCount: 3 } } })
    const wrapper = await mountPost()
    await wrapper.get('[data-testid="post-like"]').trigger('click')
    await flushPromises()
    expect(like).toHaveBeenCalledWith('p1', true)
    expect(wrapper.get('[data-testid="post-like"]').text()).toContain('3')
  })
})
