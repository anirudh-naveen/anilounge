import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import Connections from '@/views/Connections.vue'

const api = vi.hoisted(() => ({
  connections: {
    list: vi.fn(),
    start: vi.fn(),
    finish: vi.fn(),
    sync: vi.fn(),
    disconnect: vi.fn(),
  },
  imports: {
    start: vi.fn(),
    status: vi.fn(),
    conflicts: vi.fn(),
    resolveConflicts: vi.fn(),
  },
}))

vi.mock('@/services/api', () => ({
  connectionsAPI: api.connections,
  watchlistImportAPI: api.imports,
  getPosterUrl: (path: string) => path || '/placeholder-poster.svg',
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ isDemoUser: false, user: { id: 'u1' } }),
}))

vi.mock('@/stores/content', () => ({
  useContentStore: () => ({ loadWatchlist: vi.fn() }),
}))

const base = { externalId: null, connectedAt: null, lastSyncedAt: null, lastError: null, expiresAt: null }
const anilist = {
  ...base,
  provider: 'anilist',
  label: 'AniList',
  sync: 'two-way',
  available: true,
  connected: false,
  username: null,
}
const mal = { ...anilist, provider: 'mal', label: 'MyAnimeList' }
const tmdb = { ...anilist, provider: 'tmdb', label: 'TMDB', sync: 'push', available: false }
const runningJob = {
  sources: ['anilist'],
  source: 'anilist',
  state: 'running',
  phase: 'reading',
  done: 0,
  total: 0,
  sourceResults: [],
  result: null,
  error: null,
  startedAt: '2026-10-01T00:00:00Z',
  finishedAt: null,
}

const mountPage = async (path = '/connections') => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/connections', component: { template: '<div />' } }],
  })
  await router.push(path)
  await router.isReady()
  const wrapper = mount(Connections, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

describe('Connections', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    sessionStorage.clear()
    for (const group of Object.values(api)) for (const fn of Object.values(group)) fn.mockReset()
    api.connections.list.mockResolvedValue({ data: { data: [anilist, mal, tmdb] } })
    api.imports.status.mockResolvedValue({ data: { data: null } })
    api.imports.conflicts.mockResolvedValue({ data: { data: [] } })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('lists each site with its logo and says unconfigured sites are unavailable', async () => {
    const { wrapper } = await mountPage()
    expect(wrapper.findAll('.connection-row')).toHaveLength(3)
    expect(wrapper.find('[aria-label="AniList logo"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="connect-anilist"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="connection-tmdb"]').text()).toContain('Not available yet')
    expect(wrapper.text()).toContain('Updates sync automatically')
  })

  it('opens the approval page in a new tab and waits there', async () => {
    const tab = { opener: {}, location: { href: '' }, close: vi.fn() }
    const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window)
    api.connections.start.mockResolvedValue({
      data: { data: { authorizeUrl: 'https://anilist.co/api/v2/oauth/authorize?x=1' } },
    })
    const { wrapper } = await mountPage()
    await wrapper.get('[data-testid="connect-anilist"]').trigger('click')
    await flushPromises()

    expect(open).toHaveBeenCalledWith('', '_blank')
    expect(tab.opener).toBeNull()
    expect(api.connections.start).toHaveBeenCalledWith('anilist', undefined)
    expect(tab.location.href).toBe('https://anilist.co/api/v2/oauth/authorize?x=1')
    expect(wrapper.text()).toContain('Waiting for you to approve AniLounge on AniList')
  })

  it('finishes the connection itself when the site returns to a tab nobody is waiting on', async () => {
    sessionStorage.setItem('anilounge:connection-same-tab', '1')
    api.connections.finish.mockResolvedValue({
      data: { data: { ...anilist, connected: true, username: 'spike' } },
    })
    const { wrapper, router } = await mountPage('/connections?code=abc&state=anilist.xyz')

    expect(api.connections.finish).toHaveBeenCalledWith('anilist', {
      code: 'abc',
      state: 'anilist.xyz',
      requestToken: undefined,
    })
    expect(router.currentRoute.value.query).toEqual({})
    expect(wrapper.text()).toContain('AniList connected as spike')
    expect(wrapper.get('[data-testid="connection-anilist"]').text()).toContain('Connected as spike')
  })

  it('reports a denied approval without connecting', async () => {
    sessionStorage.setItem('anilounge:connection-same-tab', '1')
    const { wrapper } = await mountPage('/connections?error=access_denied&state=mal.xyz')
    expect(api.connections.finish).not.toHaveBeenCalled()
    expect(wrapper.find('.message.error').text()).toContain('MyAnimeList access was not approved')
  })

  it('imports from a connected account and syncs two-way sites on demand', async () => {
    api.connections.list.mockResolvedValue({
      data: { data: [{ ...anilist, connected: true, username: 'spike' }, mal, tmdb] },
    })
    api.imports.start.mockResolvedValue({ data: { data: runningJob } })
    api.connections.sync.mockResolvedValue({ data: { data: { applied: 2, checked: 3 } } })
    const { wrapper } = await mountPage()

    await wrapper.get('[data-testid="import-anilist"]').trigger('click')
    await flushPromises()
    expect(api.imports.start).toHaveBeenCalledWith({
      sources: [{ source: 'anilist', connected: true }],
      addMissing: true,
    })

    await wrapper.get('[data-testid="sync-anilist"]').trigger('click')
    await flushPromises()
    expect(api.connections.sync).toHaveBeenCalledWith('anilist')
    expect(wrapper.text()).toContain('Pulled 2 changes from AniList')
  })

  it('asks before disconnecting', async () => {
    api.connections.list.mockResolvedValue({
      data: { data: [{ ...anilist, connected: true }, mal, tmdb] },
    })
    api.connections.disconnect.mockResolvedValue({ data: { data: { removed: true } } })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    const { wrapper } = await mountPage()

    await wrapper.get('[data-testid="disconnect-anilist"]').trigger('click')
    expect(api.connections.disconnect).not.toHaveBeenCalled()
    await wrapper.get('[data-testid="disconnect-anilist"]').trigger('click')
    await flushPromises()
    expect(confirm).toHaveBeenCalledTimes(2)
    expect(api.connections.disconnect).toHaveBeenCalledWith('anilist')
  })
})
