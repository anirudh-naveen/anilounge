import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import Inbox from '@/views/Inbox.vue'
import type { InboxItem } from '@/types/inbox'

const list = vi.fn()
const markRead = vi.fn()
const accept = vi.fn()
const inboxSet = vi.fn()
const inboxRefresh = vi.fn()

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() }),
}))
vi.mock('@/stores/inbox', () => ({
  useInboxStore: () => ({ set: inboxSet, refresh: inboxRefresh }),
}))
vi.mock('@/stores/messages', () => ({ useMessagesStore: () => ({ refresh: vi.fn() }) }))
vi.mock('@/components/ImportConflicts.vue', () => ({
  default: { template: '<div data-testid="clash-picker" />', emits: ['resolved', 'loaded'] },
}))
vi.mock('@/services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/api')>()
  return {
    ...actual,
    inboxAPI: {
      list: (...args: unknown[]) => list(...args),
      markRead: (...args: unknown[]) => markRead(...args),
      unread: vi.fn(),
    },
    friendsAPI: { ...actual.friendsAPI, accept: (...args: unknown[]) => accept(...args) },
  }
})

const user = (id: string, username: string) => ({ id, username, profilePicture: null })

const items = (): InboxItem[] => [
  {
    id: 'n1',
    kind: 'friend_request',
    createdAt: '2026-10-06T11:00:00Z',
    read: false,
    actor: user('u2', 'kai'),
    post: null,
    comment: null,
    detail: null,
    requestStatus: 'pending',
  },
  {
    id: 'n2',
    kind: 'post_comment',
    createdAt: '2026-10-06T10:00:00Z',
    read: false,
    actor: user('u3', 'rei'),
    post: { id: 'p1', title: 'Episode 5 thoughts' },
    comment: { id: 'c1', excerpt: 'Beautiful episode.' },
    detail: null,
  },
  {
    id: 'n3',
    kind: 'language_warning',
    createdAt: '2026-10-06T09:00:00Z',
    read: true,
    actor: null,
    post: null,
    comment: null,
    detail: {
      excerpt: 'what the f***',
      term: 'f***',
      count: 2,
      limit: 3,
      category: 'curse',
      message: 'Warning 2 of 3.',
    },
  },
  {
    id: 'a1',
    kind: 'announcement',
    createdAt: '2026-10-05T09:00:00Z',
    read: false,
    news: { title: 'Forums are live', body: 'Come say hi.' },
  },
]

const mountInbox = async () => {
  const stub = { template: '<div />' }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/inbox', name: 'inbox', component: Inbox },
      { path: '/forum/post/:id', name: 'forumPost', component: stub },
      { path: '/friends', name: 'friends', component: stub },
      { path: '/u/:username', name: 'publicProfile', component: stub },
    ],
  })
  await router.push('/inbox')
  await router.isReady()
  const wrapper = mount(Inbox, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

describe('Inbox', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    list.mockResolvedValue({ data: { data: { items: items(), hasMore: false, importClashes: 0 } } })
    markRead.mockResolvedValue({
      data: { data: { notifications: 0, news: 0, importClashes: 0, total: 0 } },
    })
  })

  it('shows every kind of item and marks them read', async () => {
    const wrapper = await mountInbox()
    expect(wrapper.get('[data-testid="inbox-item-friend_request"]').text()).toContain(
      'kai sent you a friend request',
    )
    const comment = wrapper.get('[data-testid="inbox-item-post_comment"]')
    expect(comment.text()).toContain('rei commented on your post Episode 5 thoughts')
    expect(comment.get('[data-testid="inbox-comment"]').attributes('href')).toBe(
      '/forum/post/p1#comment-c1',
    )
    const warning = wrapper.get('[data-testid="inbox-item-language_warning"]')
    expect(warning.text()).toContain('Language warning 2 of 3')
    expect(warning.text()).toContain('You sent: what the f***')
    expect(wrapper.get('[data-testid="inbox-item-announcement"]').text()).toContain(
      'Forums are live',
    )
    // New items stay highlighted for this visit.
    expect(wrapper.findAll('.inbox-row.unread')).toHaveLength(3)
    expect(markRead).toHaveBeenCalledWith()
    expect(inboxSet).toHaveBeenCalledWith(expect.objectContaining({ total: 0 }))
  })

  it('filters by type', async () => {
    const wrapper = await mountInbox()
    await wrapper.get('[data-testid="inbox-filter-news"]').trigger('click')
    expect(wrapper.findAll('.inbox-row')).toHaveLength(1)
    await wrapper.get('[data-testid="inbox-filter-account"]').trigger('click')
    expect(wrapper.get('.inbox-row').text()).toContain('Language warning')
    await wrapper.get('[data-testid="inbox-filter-forum"]').trigger('click')
    expect(wrapper.get('.inbox-row').text()).toContain('commented on your post')
  })

  it('answers friend requests in place', async () => {
    accept.mockResolvedValue({ data: { message: "You're now friends." } })
    const wrapper = await mountInbox()
    await wrapper.get('[data-testid="friend-accept"]').trigger('click')
    await flushPromises()
    expect(accept).toHaveBeenCalledWith('u2')
    const row = wrapper.get('[data-testid="inbox-item-friend_request"]')
    expect(row.text()).toContain("You're now friends.")
    expect(row.find('[data-testid="friend-accept"]').exists()).toBe(false)
  })

  it('shows the import clash picker when clashes are waiting', async () => {
    list.mockResolvedValue({ data: { data: { items: [], hasMore: false, importClashes: 2 } } })
    const wrapper = await mountInbox()
    const panel = wrapper.get('[data-testid="inbox-import-clashes"]')
    expect(panel.text()).toContain('Finish your import')
    expect(panel.find('[data-testid="clash-picker"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="inbox-empty"]').text()).toContain('all caught up')
    expect(markRead).not.toHaveBeenCalled()
  })

  it('loads older items', async () => {
    list
      .mockResolvedValueOnce({
        data: { data: { items: items().slice(0, 2), hasMore: true, importClashes: 0 } },
      })
      .mockResolvedValueOnce({
        data: { data: { items: items().slice(2), hasMore: false, importClashes: 0 } },
      })
    const wrapper = await mountInbox()
    await wrapper.get('[data-testid="inbox-more"]').trigger('click')
    await flushPromises()
    expect(list).toHaveBeenLastCalledWith('2026-10-06T10:00:00Z')
    expect(wrapper.findAll('.inbox-row')).toHaveLength(4)
    expect(wrapper.find('[data-testid="inbox-more"]').exists()).toBe(false)
  })
})
