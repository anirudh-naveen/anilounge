import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ImportConflicts from '@/components/ImportConflicts.vue'

const api = vi.hoisted(() => ({ conflicts: vi.fn(), resolveConflicts: vi.fn() }))

vi.mock('@/services/api', () => ({
  watchlistImportAPI: api,
  getPosterUrl: (path: string) => path || '/placeholder-movie.jpg',
}))

const option = (key: string, status: string, currentEpisode: number, score: number | null) => ({
  key,
  sources: key.split('+'),
  status,
  currentEpisode,
  score,
  startedOn: null,
  completedOn: null,
  rewatchCount: 0,
})

const conflicts = [
  {
    contentId: 'c1',
    title: 'Frieren',
    posterPath: '',
    contentType: 'tv',
    episodeCount: 28,
    current: null,
    options: [option('anilist', 'completed', 28, 9), option('mal', 'watching', 10, null)],
  },
  {
    contentId: 'c2',
    title: 'Dandadan',
    posterPath: '',
    contentType: 'tv',
    episodeCount: 12,
    current: { status: 'watching', currentEpisode: 4, score: null },
    options: [option('anilist+mal', 'completed', 12, 8)],
  },
]

describe('ImportConflicts', () => {
  beforeEach(() => {
    api.conflicts.mockReset().mockResolvedValue({ data: { data: structuredClone(conflicts) } })
    api.resolveConflicts.mockReset().mockResolvedValue({ data: { data: {} } })
  })

  it('lists each clash with every version plus keeping or skipping', async () => {
    const wrapper = mount(ImportConflicts)
    await flushPromises()

    expect(wrapper.text()).toContain('2 titles need you')
    const frieren = wrapper.findAll('.conflict')[0]!.text()
    expect(frieren).toContain('AniList')
    expect(frieren).toContain('Completed · 28/28 eps · 9/10')
    expect(frieren).toContain('Watching · 10/28 eps · unrated')
    expect(frieren).toContain("Don't add")
    const dandadan = wrapper.findAll('.conflict')[1]!.text()
    expect(dandadan).toContain('AniList + MyAnimeList')
    expect(dandadan).toContain('Keep mine')
  })

  it('saves a single pick and drops that title from the list', async () => {
    const wrapper = mount(ImportConflicts)
    await flushPromises()
    await wrapper.findAll('.conflict')[0]!.findAll('.option-card')[1]!.trigger('click')
    await flushPromises()

    expect(api.resolveConflicts).toHaveBeenCalledWith([{ contentId: 'c1', choice: 'mal' }])
    expect(wrapper.findAll('.conflict')).toHaveLength(1)
    expect(wrapper.emitted('resolved')).toHaveLength(1)
  })

  it('uses one site for every title that has a version from it', async () => {
    const wrapper = mount(ImportConflicts)
    await flushPromises()
    const useMal = wrapper.findAll('.bulk-btn').find((b) => b.text() === 'Use MyAnimeList for all')
    await useMal!.trigger('click')
    await flushPromises()

    expect(api.resolveConflicts).toHaveBeenCalledWith([
      { contentId: 'c1', choice: 'mal' },
      { contentId: 'c2', choice: 'anilist+mal' },
    ])
    expect(wrapper.find('[data-testid="import-conflicts"]').exists()).toBe(false)
  })
})
