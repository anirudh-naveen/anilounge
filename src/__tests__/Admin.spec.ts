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
    await wrapper.findAll('.admin-tab')[1]!.trigger('click')
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
    await wrapper.findAll('.admin-tab')[1]!.trigger('click')
    await flushPromises()
    const text = wrapper.find('[data-testid="admin-users"]').text()
    expect(text).toContain('Make admin')
    expect(text).toContain('Remove admin')
    expect(text).toContain('Ban…')
  })
})
