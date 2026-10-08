import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ForumComposer from '@/components/ForumComposer.vue'
import type { PostTag } from '@/types/forum'
import { buildPost } from './forumFixtures'

const create = vi.fn()
const update = vi.fn()
const searchTags = vi.fn()
const getContentEpisodes = vi.fn()
const contentCharacters = vi.fn()
const toast = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
}))

vi.mock('vue-toastification', () => ({ useToast: () => toast }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ isAuthenticated: true }) }))

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
vi.mock('@/services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/api')>()
  return {
    ...actual,
    forumAPI: {
      ...actual.forumAPI,
      create: (...args: unknown[]) => create(...args),
      update: (...args: unknown[]) => update(...args),
      searchTags: (...args: unknown[]) => searchTags(...args),
      contentCharacters: (...args: unknown[]) => contentCharacters(...args),
    },
    contentAPI: {
      ...actual.contentAPI,
      getContentEpisodes: (...args: unknown[]) => getContentEpisodes(...args),
    },
  }
})

const series: PostTag = {
  contentId: 's1',
  kind: 'series',
  name: 'Frieren',
  imagePath: null,
  season: null,
  episode: null,
}
const character: PostTag = { ...series, contentId: 'c1', kind: 'character', name: 'Himmel' }

describe('ForumComposer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    watchlist.items.clear()
    getContentEpisodes.mockResolvedValue({
      data: {
        data: {
          episodes: [
            { seasonNumber: 0, episodeNumber: 1, title: 'Recap' },
            ...[1, 2, 3, 4, 5].map((n) => ({
              seasonNumber: 1,
              episodeNumber: n,
              title: `Ep ${n}`,
            })),
            { seasonNumber: 2, episodeNumber: 1, title: 'Journey' },
          ],
        },
      },
    })
  })

  it('says when a series has no episode list', async () => {
    getContentEpisodes.mockResolvedValue({ data: { data: { episodes: [] } } })
    const wrapper = mount(ForumComposer, { props: { presetTags: [series] } })
    await wrapper.get('[data-testid="episode-add-0"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="episode-season-0"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="episode-none-0"]').text()).toContain('No episode list')
  })

  it('loads the episode list when editing a post with an episode tag', async () => {
    mount(ForumComposer, { props: { post: buildPost({ canEdit: true }) } })
    await flushPromises()
    expect(getContentEpisodes).toHaveBeenCalledWith('s1')
  })

  it('posts a discussion with an episode tag', async () => {
    create.mockResolvedValue({ data: { data: buildPost(), warning: null } })
    const wrapper = mount(ForumComposer, { props: { presetTags: [series] } })
    await wrapper.get('[data-testid="composer-title"]').setValue('  Episode 5  ')
    await wrapper.get('[data-testid="composer-body"]').setValue('That ending!')
    await wrapper.get('[data-testid="episode-add-0"]').trigger('click')
    await flushPromises()
    expect(getContentEpisodes).toHaveBeenCalledWith('s1')
    // Starts on the first regular season's first episode; specials come first in the list.
    expect(
      (wrapper.get('[data-testid="episode-season-0"]').element as HTMLSelectElement).value,
    ).toBe('1')
    await wrapper.get('[data-testid="episode-season-0"]').setValue('2')
    expect(wrapper.get('[data-testid="episode-number-0"]').text()).toContain('E1 · Journey')
    await wrapper.get('[data-testid="episode-season-0"]').setValue('1')
    await wrapper.get('[data-testid="episode-number-0"]').setValue('5')
    expect(wrapper.get('[data-testid="selected-tags"]').text()).toContain('Frieren · S1E5')
    await wrapper.get('[data-testid="composer-spoiler"]').setValue(true)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(create).toHaveBeenCalledWith({
      kind: 'discussion',
      title: 'Episode 5',
      body: 'That ending!',
      spoiler: true,
      tags: [{ contentId: 's1', season: 1, episode: 5, top: false }],
    })
    expect(wrapper.emitted('saved')).toHaveLength(1)
  })

  it('needs a title it can score before posting a review', async () => {
    const wrapper = mount(ForumComposer, {
      props: { presetTags: [character], presetKind: 'review' },
    })
    await wrapper.get('[data-testid="composer-title"]').setValue('Great')
    await wrapper.get('[data-testid="composer-body"]').setValue('Loved it')
    expect(wrapper.get('[data-testid="composer-submit"]').attributes('disabled')).toBeDefined()

    const withSeries = mount(ForumComposer, {
      props: { presetTags: [series], presetKind: 'review' },
    })
    await withSeries.get('[data-testid="composer-title"]').setValue('Great')
    await withSeries.get('[data-testid="composer-body"]').setValue('Loved it')
    await withSeries.get('[data-testid="composer-score"]').setValue('8.5')
    expect(withSeries.get('[data-testid="composer-submit"]').attributes('disabled')).toBeUndefined()
    create.mockResolvedValue({ data: { data: buildPost({ kind: 'review', score: 8.5 }) } })
    await withSeries.get('form').trigger('submit')
    await flushPromises()
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ kind: 'review', score: 8.5 }))
    expect(watchlist.add).toHaveBeenCalledWith('s1', 'completed', 8.5)
  })

  it('starts from the watchlist rating and writes changes back', async () => {
    watchlist.items.set('s1', { rating: 6 })
    const wrapper = mount(ForumComposer, {
      props: { presetTags: [character, series], presetKind: 'review' },
    })
    expect((wrapper.get('[data-testid="composer-score"]').element as HTMLInputElement).value).toBe(
      '6',
    )
    expect(wrapper.get('[data-testid="composer-score-note"]').text()).toContain(
      'your watchlist rating for Frieren',
    )
    // Same rating colors as the rest of the site (6/10 is yellow-green).
    expect(wrapper.get('[data-testid="composer-score-value"]').attributes('style')).toContain(
      'rgb(',
    )
    await wrapper.get('[data-testid="composer-title"]').setValue('Good')
    await wrapper.get('[data-testid="composer-body"]').setValue('Solid')
    await wrapper.get('[data-testid="composer-score"]').setValue('7.5')
    create.mockResolvedValue({ data: { data: buildPost({ kind: 'review', score: 6 }) } })
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(watchlist.update).toHaveBeenCalledWith('s1', { rating: 7.5 })
    expect(watchlist.add).not.toHaveBeenCalled()
    expect(wrapper.emitted('saved')?.[0]?.[0]).toMatchObject({ score: 7.5 })
  })

  it('marks one top tag', async () => {
    create.mockResolvedValue({ data: { data: buildPost(), warning: null } })
    const wrapper = mount(ForumComposer, { props: { presetTags: [series, character] } })
    await wrapper.get('[data-testid="tag-top-1"]').trigger('click')
    await wrapper.get('[data-testid="tag-top-0"]').trigger('click')
    expect(wrapper.get('[data-testid="tag-top-0"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('[data-testid="tag-top-1"]').attributes('aria-pressed')).toBe('false')
    await wrapper.get('[data-testid="composer-title"]').setValue('Thread')
    await wrapper.get('[data-testid="composer-body"]').setValue('Body')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        tags: [
          { contentId: 's1', season: null, episode: null, top: true },
          { contentId: 'c1', season: null, episode: null, top: false },
        ],
      }),
    )
  })

  it('keeps tags in hierarchy order', async () => {
    const franchise: PostTag = {
      ...series,
      contentId: 'f1',
      kind: 'franchise',
      name: 'Zz Franchise',
    }
    const wrapper = mount(ForumComposer, { props: { presetTags: [character, series] } })
    searchTags.mockResolvedValue({
      data: {
        data: [
          {
            contentId: 'f1',
            kind: 'franchise',
            name: franchise.name,
            imagePath: null,
            seasonCount: null,
            episodeCount: null,
            year: null,
          },
        ],
      },
    })
    vi.useFakeTimers()
    await wrapper.get('[data-testid="tag-search"]').setValue('zz')
    await vi.advanceTimersByTimeAsync(300)
    await flushPromises()
    await wrapper.get('[data-testid="tag-results"] button').trigger('click')
    vi.useRealTimers()
    const chips = wrapper.findAll('[data-testid="selected-tags"] .tag-chip-main')
    expect(chips.map((chip) => chip.text())).toEqual([
      expect.stringContaining('Zz Franchise'),
      expect.stringContaining('Frieren'),
      expect.stringContaining('Himmel'),
    ])
  })

  it('lists a title’s characters under its search result', async () => {
    vi.useFakeTimers()
    searchTags.mockResolvedValue({
      data: {
        data: [
          {
            contentId: 's1',
            kind: 'series',
            name: 'Frieren',
            imagePath: null,
            seasonCount: 2,
            episodeCount: 28,
            year: 2023,
          },
        ],
      },
    })
    contentCharacters.mockResolvedValue({
      data: {
        data: [
          { contentId: 'c1', kind: 'character', name: 'Himmel', imagePath: null, role: 'main' },
          {
            contentId: 'c2',
            kind: 'character',
            name: 'Stark',
            imagePath: null,
            role: 'supporting',
          },
        ],
      },
    })
    const wrapper = mount(ForumComposer)
    await wrapper.get('[data-testid="tag-search"]').setValue('frieren')
    await vi.advanceTimersByTimeAsync(300)
    await flushPromises()
    await wrapper.get('[data-testid="characters-toggle-s1"]').trigger('click')
    await flushPromises()
    expect(contentCharacters).toHaveBeenCalledWith('s1')
    const list = wrapper.get('[data-testid="characters-s1"]')
    expect(list.text()).toContain('Himmel')
    expect(list.text()).toContain('Character · main')
    await list.findAll('button')[1]!.trigger('click')
    await list.findAll('button')[0]!.trigger('click')
    // Both added; the list stays open to pick more.
    const selected = wrapper.get('[data-testid="selected-tags"]').text()
    expect(selected).toContain('Stark')
    expect(selected).toContain('Himmel')
    expect(wrapper.find('[data-testid="characters-s1"]').exists()).toBe(true)
    vi.useRealTimers()
  })

  it('edits an existing post and shows a language warning', async () => {
    update.mockResolvedValue({
      data: {
        data: buildPost({ title: 'Edited' }),
        warning: {
          count: 2,
          limit: 3,
          alerted: false,
          category: 'curse',
          message: 'Warning 2 of 3.',
        },
      },
    })
    const wrapper = mount(ForumComposer, { props: { post: buildPost({ canEdit: true }) } })
    expect(wrapper.find('[data-testid="kind-review"]').exists()).toBe(false)
    await wrapper.get('[data-testid="composer-title"]').setValue('Edited')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(update).toHaveBeenCalledWith('p1', expect.objectContaining({ title: 'Edited' }))
    expect(toast.warning).toHaveBeenCalledWith('Warning 2 of 3.', expect.anything())
  })

  it('adds tags from search', async () => {
    vi.useFakeTimers()
    searchTags.mockResolvedValue({
      data: {
        data: [
          {
            contentId: 'm1',
            kind: 'movie',
            name: 'Your Name',
            imagePath: null,
            seasonCount: null,
            episodeCount: null,
            year: 2016,
          },
        ],
      },
    })
    const wrapper = mount(ForumComposer)
    await wrapper.get('[data-testid="tag-search"]').setValue('your')
    await vi.advanceTimersByTimeAsync(300)
    await flushPromises()
    expect(searchTags).toHaveBeenCalledWith('your')
    await wrapper.get('[data-testid="tag-results"] button').trigger('click')
    expect(wrapper.get('[data-testid="selected-tags"]').text()).toContain('Your Name')
    vi.useRealTimers()
  })
})
