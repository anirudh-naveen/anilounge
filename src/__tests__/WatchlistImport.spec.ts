import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import WatchlistImport from '@/components/WatchlistImport.vue'

const api = vi.hoisted(() => ({
  start: vi.fn(),
  status: vi.fn(),
  tmdbToken: vi.fn(),
  conflicts: vi.fn(),
  resolveConflicts: vi.fn(),
}))

vi.mock('@/services/api', () => ({
  watchlistImportAPI: api,
  getPosterUrl: (path: string) => path || '/placeholder-poster.svg',
}))

const runningJob = {
  sources: ['anilist', 'mal'],
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

const doneJob = {
  ...runningJob,
  source: 'mal',
  state: 'done',
  phase: null,
  sourceResults: [
    { source: 'anilist', entries: 3, error: null },
    { source: 'mal', entries: 0, error: 'There\'s no MyAnimeList user named "ghost".' },
  ],
  finishedAt: '2026-10-01T00:00:05Z',
  result: {
    total: 3,
    matched: 2,
    added: 1,
    unchanged: 0,
    conflicts: 1,
    rated: 1,
    catalogAdded: 0,
    notFound: 1,
    notFoundTitles: ['Some OVA'],
  },
}

const mountImport = async (path = '/import') => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/import', component: { template: '<div />' } }],
  })
  await router.push(path)
  await router.isReady()
  const wrapper = mount(WatchlistImport, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

describe('WatchlistImport', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    sessionStorage.clear()
    for (const fn of Object.values(api)) fn.mockReset()
    api.status.mockResolvedValue({ data: { data: null } })
    api.conflicts.mockResolvedValue({ data: { data: [] } })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the username fields inline and only enables Import once one is filled', async () => {
    const { wrapper } = await mountImport()
    expect(wrapper.find('[data-testid="import-anilist-user"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="import-mal-user"]').exists()).toBe(true)
    expect(wrapper.get('.import-btn').attributes('disabled')).toBeDefined()

    await wrapper.get('[data-testid="import-mal-user"]').setValue('someone')
    expect(wrapper.get('.import-btn').attributes('disabled')).toBeUndefined()
  })

  it('imports every filled-in site in one go and reports each', async () => {
    const { wrapper } = await mountImport()
    await wrapper.get('[data-testid="import-anilist-user"]').setValue('someone')
    await wrapper.get('[data-testid="import-mal-user"]').setValue('ghost')
    api.start.mockResolvedValue({ data: { data: runningJob } })
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(api.start).toHaveBeenCalledWith({
      sources: [
        { source: 'anilist', username: 'someone' },
        { source: 'mal', username: 'ghost' },
      ],
      addMissing: true,
    })
    expect(wrapper.text()).toContain('Reading your AniList list (1 of 2)')

    api.status.mockResolvedValue({ data: { data: doneJob } })
    await vi.advanceTimersByTimeAsync(1500)
    await flushPromises()

    expect(wrapper.text()).toContain('1 added')
    expect(wrapper.text()).toContain('1 to review below')
    expect(wrapper.text()).toContain('MyAnimeList: There\'s no MyAnimeList user named "ghost".')
    expect(wrapper.emitted('imported')).toHaveLength(1)
    expect(api.conflicts).toHaveBeenCalledTimes(2)
  })

  it('opens TMDB approval in a new tab and imports once approved', async () => {
    const tab = { opener: {}, location: { href: '' }, close: vi.fn() }
    const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window)
    const { wrapper } = await mountImport()
    api.tmdbToken.mockResolvedValue({
      data: { data: { requestToken: 'abc123def456', authorizeUrl: 'https://tmdb.example/ok' } },
    })
    await wrapper.get('[data-testid="import-tmdb"]').trigger('click')
    await flushPromises()

    expect(open).toHaveBeenCalledWith('', '_blank')
    expect(tab.opener).toBeNull()
    expect(api.tmdbToken).toHaveBeenCalledWith(`${window.location.origin}/import?import=tmdb-tab`)
    expect(tab.location.href).toBe('https://tmdb.example/ok')
    expect(wrapper.text()).toContain('Waiting for you to approve')

    api.start.mockResolvedValue({ data: { data: runningJob } })
    await wrapper.get('[data-testid="import-tmdb-approved"]').trigger('click')
    await flushPromises()
    expect(api.start).toHaveBeenCalledWith({
      sources: [{ source: 'tmdb', requestToken: 'abc123def456' }],
      addMissing: true,
    })
    open.mockRestore()
  })

  it('imports in this tab when TMDB sends the user back approved', async () => {
    api.start.mockResolvedValue({ data: { data: runningJob } })
    const { router } = await mountImport(
      '/import?import=tmdb&request_token=abc123def456&approved=true',
    )
    expect(api.start).toHaveBeenCalledWith({
      sources: [{ source: 'tmdb', requestToken: 'abc123def456' }],
      addMissing: true,
    })
    expect(router.currentRoute.value.query).toEqual({})
  })

  it('reports a denied TMDB approval without importing', async () => {
    const { wrapper } = await mountImport(
      '/import?import=tmdb&request_token=abc123def456&denied=true',
    )
    expect(api.start).not.toHaveBeenCalled()
    expect(wrapper.find('.import-error').text()).toContain('not approved')
  })

  it('says so when the server forgets a running import instead of spinning forever', async () => {
    const { wrapper } = await mountImport()
    await wrapper.get('[data-testid="import-anilist-user"]').setValue('someone')
    api.start.mockResolvedValue({ data: { data: runningJob } })
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    api.status.mockResolvedValue({ data: { data: null } })
    await vi.advanceTimersByTimeAsync(1500)
    await flushPromises()
    expect(wrapper.find('.import-error').text()).toContain('interrupted')
  })
})
