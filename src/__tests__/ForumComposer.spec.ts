import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ForumComposer from '@/components/ForumComposer.vue'
import type { PostTag } from '@/types/forum'
import { buildPost } from './forumFixtures'

const create = vi.fn()
const update = vi.fn()
const searchTags = vi.fn()
const getContentEpisodes = vi.fn()
const toast = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
}))

vi.mock('vue-toastification', () => ({ useToast: () => toast }))
vi.mock('@/services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/api')>()
  return {
    ...actual,
    forumAPI: {
      ...actual.forumAPI,
      create: (...args: unknown[]) => create(...args),
      update: (...args: unknown[]) => update(...args),
      searchTags: (...args: unknown[]) => searchTags(...args),
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
      tags: [{ contentId: 's1', season: 1, episode: 5 }],
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
