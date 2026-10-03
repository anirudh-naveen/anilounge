import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import WatchlistImport from '@/components/WatchlistImport.vue'

const api = vi.hoisted(() => ({
  start: vi.fn(),
  status: vi.fn(),
  tmdbToken: vi.fn(),
}))

vi.mock('@/services/api', () => ({ watchlistImportAPI: api }))

const doneJob = {
  source: 'anilist',
  state: 'done',
  phase: null,
  done: 0,
  total: 3,
  error: null,
  startedAt: '2026-10-01T00:00:00Z',
  finishedAt: '2026-10-01T00:00:05Z',
  result: {
    total: 3,
    matched: 2,
    added: 2,
    updated: 0,
    unchanged: 0,
    rated: 1,
    catalogAdded: 0,
    notFound: 1,
    notFoundTitles: ['Some OVA'],
  },
}

const mountImport = async (path = '/watchlist') => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/watchlist', component: { template: '<div />' } }],
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
    api.start.mockReset()
    api.status.mockReset().mockResolvedValue({ data: { data: null } })
    api.tmdbToken.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts an AniList import and shows the summary when the job finishes', async () => {
    const { wrapper } = await mountImport()
    await wrapper.find('#import-anilist-user').setValue('someone')
    api.start.mockResolvedValue({
      data: { data: { ...doneJob, state: 'running', phase: 'reading', result: null } },
    })
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(api.start).toHaveBeenCalledWith({
      source: 'anilist',
      username: 'someone',
      overwrite: false,
      addMissing: true,
    })
    expect(wrapper.text()).toContain('Reading your AniList list')

    api.status.mockResolvedValue({ data: { data: doneJob } })
    await vi.advanceTimersByTimeAsync(1500)
    await flushPromises()

    expect(wrapper.text()).toContain('Imported 2 of 3 entries from AniList')
    expect(wrapper.text()).toContain('1 not on AniLounge')
    expect(wrapper.emitted('imported')).toHaveLength(1)
  })

  it('shows the server message when an import cannot start', async () => {
    const { wrapper } = await mountImport()
    await wrapper.find('#import-anilist-user').setValue('ghost')
    api.start.mockRejectedValue({
      response: { data: { message: 'An import is already running. Wait for it to finish.' } },
    })
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('.import-error').text()).toContain('already running')
  })

  it('finishes a TMDB import when TMDB sends the user back approved', async () => {
    api.start.mockResolvedValue({
      data: { data: { ...doneJob, source: 'tmdb', state: 'running', result: null } },
    })
    const { router } = await mountImport('/watchlist?import=tmdb&request_token=abc123def456&approved=true')
    expect(api.start).toHaveBeenCalledWith({
      source: 'tmdb',
      requestToken: 'abc123def456',
      overwrite: false,
    })
    expect(router.currentRoute.value.query).toEqual({})
  })

  it('reports a denied TMDB approval without importing', async () => {
    const { wrapper } = await mountImport('/watchlist?import=tmdb&request_token=abc123def456&denied=true')
    expect(api.start).not.toHaveBeenCalled()
    expect(wrapper.find('.import-error').text()).toContain('not approved')
  })
})
