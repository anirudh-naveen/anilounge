import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import Friends from '@/views/Friends.vue'

const list = vi.fn()
const refresh = vi.fn()

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }),
}))

vi.mock('@/services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/api')>()
  return {
    ...actual,
    friendsAPI: { ...actual.friendsAPI, list: (...args: unknown[]) => list(...args) },
  }
})

vi.mock('@/stores/messages', () => ({
  useMessagesStore: () => ({
    counts: { messages: 3, requests: 1 },
    refresh: (...args: unknown[]) => refresh(...args),
  }),
}))

vi.mock('@/stores/badges', () => ({
  useBadgesStore: () => ({
    load: () => Promise.resolve(),
    badgesFor: () => [],
    featuredFor: () => null,
    choiceFor: () => null,
  }),
}))

const MessagesPanelStub = { template: '<div data-testid="messages-panel" />' }

const mountAt = async (path: string) => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/friends', name: 'friends', component: Friends },
      { path: '/u/:username', name: 'publicProfile', component: { template: '<div />' } },
    ],
  })
  await router.push(path)
  await router.isReady()
  const wrapper = mount(Friends, {
    global: { plugins: [router], stubs: { MessagesPanel: MessagesPanelStub } },
  })
  await flushPromises()
  return { wrapper, router }
}

describe('Friends', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    list.mockResolvedValue({
      data: {
        data: {
          friends: [],
          incoming: [
            {
              user: { id: 'u3', username: 'shinji', profilePicture: null },
              message: '',
              at: '2026-10-05T09:00:00Z',
              expiresAt: '2026-10-12T09:00:00Z',
            },
          ],
          outgoing: [],
        },
      },
    })
  })

  it('opens on the Messages tab with unread and request counts', async () => {
    const { wrapper } = await mountAt('/friends')
    expect(wrapper.find('[data-testid="messages-panel"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="friends-list"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="tab-messages"]').text()).toContain('3')
    expect(wrapper.get('[data-testid="tab-friends"]').text()).toContain('1')
  })

  it('shows the friends list and search on the Friends tab', async () => {
    const { wrapper } = await mountAt('/friends?tab=friends')
    expect(wrapper.find('[data-testid="messages-panel"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="friends-list"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="friend-search"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="incoming-requests"]').text()).toContain('shinji')
  })

  it('switches to Messages when a chat is opened', async () => {
    const { wrapper, router } = await mountAt('/friends?tab=friends')
    await router.push({ name: 'friends', query: { user: 'u2' } })
    await flushPromises()
    expect(wrapper.find('[data-testid="messages-panel"]').exists()).toBe(true)
  })
})
