import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  describeActivity,
  widgetActivity,
  widgetRelease,
  widgetTokenFrom,
} from './widgetService.js'

const entry = (overrides = {}) => ({
  id: 'u1:c1',
  user: { _id: 'u1', username: 'mika', isSelf: false },
  action: 'updated',
  status: 'watching',
  currentEpisode: 5,
  previousEpisode: 4,
  at: '2026-10-10T12:00:00.000Z',
  content: { _id: 'c1', title: 'Frieren', contentType: 'tv' },
  ...overrides,
})

describe('describeActivity', () => {
  it('words progress like the home page', () => {
    assert.equal(describeActivity(entry()), 'watched episode 5 of')
    assert.equal(describeActivity(entry({ previousEpisode: 2 })), 'watched episodes 3–5 of')
    assert.equal(
      describeActivity(entry({ currentEpisode: 0, action: 'added' })),
      'started watching',
    )
    assert.equal(
      describeActivity(entry({ currentEpisode: 0, user: { isSelf: true } })),
      'are watching',
    )
    assert.equal(describeActivity(entry({ status: 'plan_to_watch' })), 'planned to watch')
  })
})

describe('widgetActivity', () => {
  it('names the viewer "You" and links to the title page', () => {
    const self = widgetActivity(entry({ user: { _id: 'u1', username: 'mika', isSelf: true } }))
    assert.equal(self.who, 'You')
    assert.equal(self.path, '/tv-show/frieren/c1')
    assert.equal(widgetActivity(entry()).who, 'mika')
  })
})

describe('widgetRelease', () => {
  it('keeps the episode number for episodes only', () => {
    const content = { _id: 'c2', title: 'Look Back', contentType: 'movie', nextEpisodeNumber: 3 }
    assert.deepEqual(widgetRelease({ kind: 'premiere', at: null, content }), {
      id: 'c2',
      title: 'Look Back',
      kind: 'premiere',
      episode: null,
      at: null,
      path: '/movie/look-back/c2',
    })
    const show = { ...content, contentType: 'tv', title: 'Frieren' }
    assert.equal(widgetRelease({ kind: 'episode', at: null, content: show }).episode, 3)
  })
})

describe('widgetTokenFrom', () => {
  it('reads only the Widget authorization scheme', () => {
    const req = (value) => ({ get: () => value })
    assert.equal(widgetTokenFrom(req('Widget abc123')), 'abc123')
    assert.equal(widgetTokenFrom(req('Bearer abc123')), null)
    assert.equal(widgetTokenFrom(req(undefined)), null)
  })
})
