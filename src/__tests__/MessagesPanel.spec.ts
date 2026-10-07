import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import MessagesPanel from '@/components/MessagesPanel.vue'
import type { ConversationsPayload, MessageThread } from '@/types/social'

const list = vi.fn()
const thread = vi.fn()
const send = vi.fn()
const refresh = vi.fn()

const toast = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
}))

vi.mock('vue-toastification', () => ({
  useToast: () => toast,
}))

vi.mock('@/services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/api')>()
  return {
    ...actual,
    messagesAPI: {
      list: (...args: unknown[]) => list(...args),
      thread: (...args: unknown[]) => thread(...args),
      send: (...args: unknown[]) => send(...args),
      unread: vi.fn(),
    },
  }
})

vi.mock('@/stores/messages', () => ({
  useMessagesStore: () => ({ refresh: (...args: unknown[]) => refresh(...args) }),
}))

vi.mock('@/stores/badges', () => ({
  useBadgesStore: () => ({
    load: () => Promise.resolve(),
    badgesFor: () => [],
    featuredFor: () => null,
    choiceFor: () => null,
  }),
}))

const user = (id: string, username: string) => ({ id, username, profilePicture: null })

const conversations = (): ConversationsPayload => ({
  conversations: [
    {
      user: user('u2', 'rei'),
      lastMessage: { body: 'See you at the screening', at: '2026-10-05T10:00:00Z', fromMe: false },
      unread: 2,
      canMessage: true,
    },
  ],
  requests: [
    {
      user: user('u3', 'shinji'),
      message: 'Loved your Eva review',
      at: '2026-10-05T09:00:00Z',
      expiresAt: '2026-10-12T09:00:00Z',
    },
  ],
})

const buildThread = (overrides: Partial<MessageThread> = {}): MessageThread => ({
  user: user('u2', 'rei'),
  relationship: 'friends',
  canMessage: true,
  request: null,
  messages: [
    { id: 'm1', body: 'Hey!', at: '2026-10-05T09:58:00Z', fromMe: true, readAt: null },
    {
      id: 'm2',
      body: 'See you at the screening',
      at: '2026-10-05T10:00:00Z',
      fromMe: false,
      readAt: null,
    },
  ],
  hasMore: false,
  ...overrides,
})

const mountAt = async (path: string) => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/friends', name: 'friends', component: MessagesPanel },
      { path: '/u/:username', name: 'publicProfile', component: { template: '<div />' } },
    ],
  })
  await router.push(path)
  await router.isReady()
  const wrapper = mount(MessagesPanel, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

describe('MessagesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    list.mockResolvedValue({ data: { data: conversations() } })
    thread.mockResolvedValue({ data: { data: buildThread() } })
  })

  it('lists friend requests and conversations', async () => {
    const { wrapper } = await mountAt('/friends')
    const requests = wrapper.get('[data-testid="message-requests"]')
    expect(requests.text()).toContain('shinji')
    expect(requests.text()).toContain('Loved your Eva review')
    const convo = wrapper.get('[data-testid="conversation-rei"]')
    expect(convo.text()).toContain('See you at the screening')
    expect(convo.text()).toContain('2')
    expect(thread).not.toHaveBeenCalled()
  })

  it('opens the thread from the query and refreshes the badge', async () => {
    const { wrapper } = await mountAt('/friends?user=u2')
    expect(thread).toHaveBeenCalledWith('u2')
    const messages = wrapper.get('[data-testid="thread-messages"]')
    expect(messages.text()).toContain('Hey!')
    expect(messages.text()).toContain('Sent')
    expect(refresh).toHaveBeenCalled()
  })

  it('sends a message and appends it', async () => {
    send.mockResolvedValue({
      data: {
        data: {
          id: 'm3',
          body: 'On my way',
          at: '2026-10-05T10:01:00Z',
          fromMe: true,
          readAt: null,
        },
      },
    })
    const { wrapper } = await mountAt('/friends?user=u2')
    await wrapper.get('[data-testid="message-composer"] textarea').setValue('  On my way  ')
    await wrapper.get('[data-testid="message-composer"]').trigger('submit')
    await flushPromises()
    expect(send).toHaveBeenCalledWith('u2', 'On my way')
    expect(wrapper.get('[data-testid="thread-messages"]').text()).toContain('On my way')
  })

  it('warns the sender when blocked language was masked', async () => {
    send.mockResolvedValue({
      data: {
        data: {
          id: 'm3',
          body: 'what the f***',
          at: '2026-10-05T10:01:00Z',
          fromMe: true,
          readAt: null,
        },
        warning: { count: 1, limit: 3, alerted: false, message: 'Warning 1 of 3.' },
      },
    })
    const { wrapper } = await mountAt('/friends?user=u2')
    await wrapper.get('[data-testid="message-composer"] textarea').setValue('what the fuck')
    await wrapper.get('[data-testid="message-composer"]').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[data-testid="thread-messages"]').text()).toContain('what the f***')
    expect(toast.warning).toHaveBeenCalledWith('Warning 1 of 3.', expect.anything())
  })

  it('shows the request note and locks the composer until accepted', async () => {
    thread.mockResolvedValue({
      data: {
        data: buildThread({
          user: user('u3', 'shinji'),
          relationship: 'incoming',
          canMessage: false,
          messages: [],
          request: {
            message: 'Loved your Eva review',
            at: '2026-10-05T09:00:00Z',
            expiresAt: '2026-10-12T09:00:00Z',
            fromMe: false,
          },
        }),
      },
    })
    const { wrapper } = await mountAt('/friends?user=u3')
    expect(wrapper.get('[data-testid="thread-request"]').text()).toContain('Loved your Eva review')
    expect(wrapper.find('[data-testid="friend-accept"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="message-composer"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="composer-locked"]').text()).toContain('Accept the request')
  })

  it('keeps history readable but blocks sending after an unfriend', async () => {
    thread.mockResolvedValue({
      data: { data: buildThread({ relationship: 'none', canMessage: false }) },
    })
    const { wrapper } = await mountAt('/friends?user=u2')
    expect(wrapper.get('[data-testid="thread-messages"]').text()).toContain('Hey!')
    expect(wrapper.find('[data-testid="message-composer"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="composer-locked"]').text()).toContain("aren't friends")
  })
})
