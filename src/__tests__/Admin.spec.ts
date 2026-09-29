import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }),
}))

const api = vi.hoisted(() => ({
  searchContent: vi.fn(),
  getContent: vi.fn(),
  updateContent: vi.fn(),
  listUsers: vi.fn(),
  setUserRole: vi.fn(),
  muteUser: vi.fn(),
  setBan: vi.fn(),
  staff: vi.fn(),
  listSyncChanges: vi.fn(),
  countSyncChanges: vi.fn(),
  resolveSyncChanges: vi.fn(),
}))

vi.mock('@/services/api', async (original) => ({
  ...((await original()) as object),
  adminAPI: {
    searchContent: api.searchContent,
    getContent: api.getContent,
    updateContent: api.updateContent,
    listUsers: api.listUsers,
    setUserRole: api.setUserRole,
    muteUser: api.muteUser,
    setBan: api.setBan,
    listSyncChanges: api.listSyncChanges,
    countSyncChanges: api.countSyncChanges,
    resolveSyncChanges: api.resolveSyncChanges,
  },
  staffAPI: { list: api.staff },
}))

import Admin from '@/views/Admin.vue'
import { useAuthStore } from '@/stores/auth'

const page = <T>(items: T[]) => ({ data: { data: { items, page: 1, pageSize: 25, total: items.length } } })

const show = {
  id: 'show-1',
  kind: 'series',
  fields: ['title'],
  values: { title: 'Frieren' },
  locked: [],
  links: [
    {
      key: 'characters',
      label: 'Characters',
      items: [{ id: 'char-1', kind: 'character', name: 'Fern', imagePath: null, note: 'Main' }],
    },
  ],
}
const fern = {
  id: 'char-1',
  kind: 'character',
  fields: ['name'],
  values: { name: 'Fern' },
  locked: [],
  links: [],
}

const user = (overrides = {}) => ({
  id: 'u2',
  username: 'viewer',
  email: 'viewer@example.com',
  profilePicture: null,
  role: 'user',
  isOwner: false,
  isAdmin: false,
  emailVerified: true,
  isDemo: false,
  mutedUntil: null,
  muteReason: null,
  bannedAt: null,
  banReason: null,
  ...overrides,
})

const mountAdmin = (role: 'admin' | 'creator') => {
  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.user = { id: 'me', username: 'me', email: 'me@example.com', isAdmin: true, role }
  const stub = { template: '<div />' }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: stub },
      { path: '/movie/:id', name: 'MovieDetails', component: stub },
      { path: '/tv-show/:id', name: 'TVShowDetails', component: stub },
      { path: '/character/:id', name: 'CharacterDetails', component: stub },
      { path: '/voice-actor/:id', name: 'VoiceActorDetails', component: stub },
      { path: '/studio/:id', name: 'StudioDetails', component: stub },
      { path: '/u/:username', name: 'publicProfile', component: stub },
    ],
  })
  return mount(Admin, { global: { plugins: [pinia, router] }, attachTo: document.body })
}

describe('Admin page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Element.prototype.scrollIntoView = vi.fn()
    api.staff.mockResolvedValue({ data: { data: [] } })
    api.countSyncChanges.mockResolvedValue({ data: { data: { count: 2 } } })
    api.resolveSyncChanges.mockResolvedValue({ data: { message: 'Done.', data: { done: 1 } } })
    api.listSyncChanges.mockResolvedValue(
      page([
        {
          id: 'n1',
          contentId: 'show-1',
          kind: 'series',
          name: 'Frieren',
          imagePath: null,
          field: 'overview',
          outcome: 'changed',
          oldValue: 'Old synopsis',
          newValue: 'New synopsis',
          expiresAt: new Date(Date.now() + 5 * 86400000).toISOString(),
        },
        {
          id: 'n2',
          contentId: 'show-1',
          kind: 'series',
          name: 'Frieren',
          imagePath: null,
          field: 'title',
          outcome: 'blocked',
          oldValue: 'Frieren',
          newValue: 'Sousou no Frieren',
          expiresAt: new Date(Date.now() + 5 * 86400000).toISOString(),
        },
      ]),
    )
    api.searchContent.mockResolvedValue(
      page([{ id: 'show-1', kind: 'series', title: 'Frieren', subtitle: null, imagePath: null, releaseDate: null, edited: false }]),
    )
    api.getContent.mockImplementation(async (id: string) => ({
      data: { data: id === 'show-1' ? show : fern },
    }))
    api.listUsers.mockResolvedValue(page([user(), user({ id: 'u3', username: 'mod', role: 'admin', isAdmin: true })]))
  })

  it('searches the selected kind', async () => {
    const wrapper = mountAdmin('admin')
    await flushPromises()
    expect(api.searchContent).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'movie' }))
    await wrapper.find('[data-testid="admin-kind-character"]').trigger('click')
    await flushPromises()
    expect(api.searchContent).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'character' }))
  })

  it('opens a row, follows a linked row, and goes back', async () => {
    const wrapper = mountAdmin('admin')
    await flushPromises()
    await wrapper.find('[data-testid="admin-pick"]').trigger('click')
    await flushPromises()
    const editor = () => wrapper.find('[data-testid="admin-content-editor"]')
    expect(editor().text()).toContain('Frieren')
    expect(editor().text()).toContain('Fern')

    await wrapper.find('[data-testid="admin-link"]').trigger('click')
    await flushPromises()
    expect(api.getContent).toHaveBeenLastCalledWith('char-1')
    expect(editor().text()).toContain('Back to Frieren')

    await wrapper.find('.admin-back').trigger('click')
    await flushPromises()
    expect(api.getContent).toHaveBeenLastCalledWith('show-1')
    expect(editor().text()).not.toContain('Back to')
  })

  it('lets admins mute regular users but not manage roles or ban', async () => {
    const wrapper = mountAdmin('admin')
    await flushPromises()
    await wrapper.findAll('.admin-tab')[2]!.trigger('click')
    await flushPromises()
    const text = wrapper.find('[data-testid="admin-users"]').text()
    expect(text).toContain('Mute…')
    expect(text).not.toContain('Make admin')
    expect(text).not.toContain('Ban…')
    // The admin row gets no mute button for a non-creator.
    expect(wrapper.findAll('.user-item')[1]!.text()).not.toContain('Mute…')
  })

  it('gives the creator role and ban controls', async () => {
    const wrapper = mountAdmin('creator')
    await flushPromises()
    await wrapper.findAll('.admin-tab')[2]!.trigger('click')
    await flushPromises()
    const text = wrapper.find('[data-testid="admin-users"]').text()
    expect(text).toContain('Make admin')
    expect(text).toContain('Remove admin')
    expect(text).toContain('Ban…')
  })

  it('shows sync changes and reverts or applies them', async () => {
    const wrapper = mountAdmin('admin')
    await flushPromises()
    expect(wrapper.find('.tab-count').text()).toBe('2')
    await wrapper.findAll('.admin-tab')[1]!.trigger('click')
    await flushPromises()
    const panel = wrapper.find('[data-testid="admin-sync-changes"]')
    expect(panel.text()).toContain('Old synopsis')
    expect(panel.text()).toContain('Blocked by lock')

    await wrapper.find('[data-testid="sync-revert"]').trigger('click')
    await flushPromises()
    expect(api.resolveSyncChanges).toHaveBeenCalledWith('revert', ['n1'])
    await wrapper.find('[data-testid="sync-apply"]').trigger('click')
    await flushPromises()
    expect(api.resolveSyncChanges).toHaveBeenCalledWith('apply', ['n2'])
  })
})
