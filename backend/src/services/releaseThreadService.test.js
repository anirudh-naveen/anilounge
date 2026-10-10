import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { airedEpisode } from '../models/Content.js'
import { validatePostInput } from './forumService.js'
import { megathreadTags, megathreadText } from './releaseThreadService.js'

const NOW = Date.parse('2026-10-09T12:00:00Z')

describe('airedEpisode', () => {
  const before = {
    next_episode_at: new Date('2026-10-08T00:00:00Z'),
    next_episode_number: 5,
    next_episode_season: 2,
  }

  it('reports the stored episode once the schedule moves past it', () => {
    const after = { nextEpisodeAirDate: '2026-10-15', nextEpisodeNumber: 6, nextEpisodeSeason: 2 }
    assert.deepEqual(airedEpisode(before, after, NOW), {
      season: 2,
      episode: 5,
      airedAt: before.next_episode_at,
    })
  })

  it('ignores saves that keep the same next episode', () => {
    const after = {
      nextEpisodeAirDate: '2026-10-08T00:00:00Z',
      nextEpisodeNumber: 5,
      nextEpisodeSeason: 2,
    }
    assert.equal(airedEpisode(before, after, NOW), null)
  })

  it('ignores episodes that have not aired, or no stored episode', () => {
    const future = { ...before, next_episode_at: new Date('2026-10-10T00:00:00Z') }
    assert.equal(airedEpisode(future, { nextEpisodeNumber: null }, NOW), null)
    assert.equal(airedEpisode(undefined, null, NOW), null)
    assert.equal(airedEpisode({ ...before, next_episode_number: null }, null, NOW), null)
  })
})

describe('megathreadText', () => {
  it('names the episode, with the season only when the show has several', () => {
    const one = megathreadText({
      name: 'Frieren',
      kind: 'series',
      season_number: 1,
      episode_number: 3,
      season_count: 1,
    })
    assert.equal(one.title, 'Frieren - Episode 3 Discussion')
    const two = megathreadText({
      name: 'Frieren',
      kind: 'series',
      season_number: 2,
      episode_number: 3,
      season_count: 2,
    })
    assert.equal(two.title, 'Frieren - Season 2 Episode 3 Discussion')
  })

  it('names movies and specials', () => {
    const movie = megathreadText({
      name: 'Your Name',
      kind: 'movie',
      season_number: null,
      episode_number: null,
    })
    assert.equal(movie.title, 'Your Name - Movie Discussion')
    assert.ok(movie.body.includes('Your Name'))
  })
})

describe('megathreadTags', () => {
  it('tags the episode when its season is known, else the title', () => {
    const id = '00000000-0000-0000-0000-000000000001'
    assert.deepEqual(
      megathreadTags({ content_id: id, kind: 'series', season_number: 1, episode_number: 4 }),
      [{ contentId: id, season: 1, episode: 4, top: true }],
    )
    assert.deepEqual(
      megathreadTags({ content_id: id, kind: 'series', season_number: null, episode_number: 4 }),
      [{ contentId: id, season: null, episode: null, top: true }],
    )
  })
})

describe('megathread posts', () => {
  it('cannot be created by people', async () => {
    await assert.rejects(validatePostInput({ kind: 'megathread', title: 'Hi', body: 'There' }), {
      status: 400,
    })
  })
})
