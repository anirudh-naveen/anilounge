import { describe, expect, it } from 'vitest'
import {
  coverTag,
  episodeLabel,
  forumTagRoute,
  scoreLabel,
  tagLabel,
  tagRoute,
} from '@/utils/forum'

describe('forum utils', () => {
  it('labels episode tags', () => {
    expect(episodeLabel({ season: 1, episode: 5 })).toBe('S1E5')
    expect(episodeLabel({ season: null, episode: null })).toBe('')
    expect(tagLabel({ name: 'Frieren', season: 2, episode: 3 })).toBe('Frieren · S2E3')
    expect(tagLabel({ name: 'Frieren', season: null, episode: null })).toBe('Frieren')
  })

  it('routes tags to their pages, franchises to the forum', () => {
    expect(tagRoute({ contentId: 'a', kind: 'series' })).toEqual({
      name: 'TVShowDetails',
      params: { id: 'a' },
    })
    expect(tagRoute({ contentId: 'a', kind: 'special' }).name).toBe('MovieDetails')
    expect(tagRoute({ contentId: 'a', kind: 'character' }).name).toBe('CharacterDetails')
    expect(tagRoute({ contentId: 'a', kind: 'franchise' })).toEqual({
      name: 'forum',
      query: { tag: 'a' },
    })
  })

  it('filters the forum by a tag and its episode', () => {
    expect(forumTagRoute({ contentId: 'a', season: 1, episode: 5 })).toEqual({
      name: 'forum',
      query: { tag: 'a', season: '1', episode: '5' },
    })
    expect(forumTagRoute({ contentId: 'a', season: null, episode: null }).query).toEqual({
      tag: 'a',
    })
  })

  it('formats scores', () => {
    expect(scoreLabel(9)).toBe('9/10')
    expect(scoreLabel(8.5)).toBe('8.5/10')
    expect(scoreLabel(null)).toBe('')
  })
})

describe('coverTag', () => {
  const tag = (
    contentId: string,
    kind: 'franchise' | 'series' | 'character',
    imagePath: string | null,
    top = false,
  ) => ({
    contentId,
    kind,
    name: contentId,
    imagePath,
    season: null,
    episode: null,
    top,
  })

  it('prefers the top tag when it has a picture', () => {
    const tags = [tag('show', 'series', 'show.jpg'), tag('himmel', 'character', 'himmel.jpg', true)]
    expect(coverTag(tags)?.contentId).toBe('himmel')
  })

  it('falls back to the highest tag with a picture', () => {
    const tags = [
      tag('himmel', 'character', 'himmel.jpg'),
      tag('franchise', 'franchise', null, true),
      tag('show', 'series', 'show.jpg'),
    ]
    expect(coverTag(tags)?.contentId).toBe('show')
    expect(coverTag([tag('franchise', 'franchise', null)])).toBeNull()
  })

  it('never uses a franchise picture', () => {
    const tags = [
      tag('franchise', 'franchise', 'franchise.jpg', true),
      tag('himmel', 'character', 'himmel.jpg'),
    ]
    expect(coverTag(tags)?.contentId).toBe('himmel')
    expect(coverTag([tag('franchise', 'franchise', 'franchise.jpg')])).toBeNull()
  })
})
