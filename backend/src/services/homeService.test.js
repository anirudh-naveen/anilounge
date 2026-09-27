import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { classifyUpdate, dayKey, mapActivityRow, sortUpdates } from './homeService.js'

const now = new Date('2026-09-27T12:00:00Z')
const daysFromNow = (days) => new Date(now.getTime() + days * 86400000).toISOString()

describe('classifyUpdate', () => {
  it('treats unaired titles as premieres, even without a date', () => {
    assert.deepEqual(classifyUpdate({ contentType: 'tv', malStatus: 'not_yet_aired' }, now), {
      kind: 'premiere',
      at: null,
    })
    const dated = classifyUpdate(
      { contentType: 'movie', malStatus: 'not_yet_aired', releaseDate: daysFromNow(30) },
      now,
    )
    assert.equal(dated.kind, 'premiere')
    assert.equal(dated.at, daysFromNow(30))
  })

  it('skips premieres more than a year out', () => {
    const update = classifyUpdate(
      { contentType: 'tv', malStatus: 'not_yet_aired', releaseDate: daysFromNow(400) },
      now,
    )
    assert.equal(update, null)
  })

  it('reports airing shows with a next episode in the window', () => {
    const update = classifyUpdate(
      { contentType: 'tv', malStatus: 'currently_airing', nextEpisodeAirDate: daysFromNow(2) },
      now,
    )
    assert.deepEqual(update, { kind: 'episode', at: daysFromNow(2) })
    const justAired = classifyUpdate(
      { contentType: 'tv', malStatus: 'currently_airing', nextEpisodeAirDate: daysFromNow(-1) },
      now,
    )
    assert.equal(justAired.kind, 'episode')
  })

  it('falls back to the weekly slot when the stored next episode is stale', () => {
    const update = classifyUpdate(
      {
        contentType: 'tv',
        malStatus: 'currently_airing',
        broadcastDay: 'friday',
        nextEpisodeAirDate: daysFromNow(-20),
      },
      now,
    )
    assert.deepEqual(update, { kind: 'episode', at: null })
    assert.equal(
      classifyUpdate(
        { contentType: 'tv', malStatus: 'currently_airing', nextEpisodeAirDate: daysFromNow(-20) },
        now,
      ),
      null,
    )
  })

  it('keeps just-released movies and drops finished, older titles', () => {
    assert.equal(
      classifyUpdate({ contentType: 'movie', releaseDate: daysFromNow(-5) }, now).kind,
      'premiere',
    )
    assert.equal(classifyUpdate({ contentType: 'movie', releaseDate: daysFromNow(-60) }, now), null)
    assert.equal(
      classifyUpdate(
        { contentType: 'tv', malStatus: 'finished_airing', releaseDate: '2020-01-01' },
        now,
      ),
      null,
    )
  })
})

describe('sortUpdates', () => {
  it('orders dated updates soonest first and undated ones last', () => {
    const sorted = sortUpdates([
      { id: 'tba', at: null },
      { id: 'later', at: daysFromNow(5) },
      { id: 'soon', at: daysFromNow(1) },
    ])
    assert.deepEqual(
      sorted.map((item) => item.id),
      ['soon', 'later', 'tba'],
    )
  })
})

describe('mapActivityRow', () => {
  const base = {
    user_id: 'u1',
    content_id: 'c1',
    username: 'ani',
    status: 'watching',
    current_episode: 3,
    name: 'Frieren',
    kind: 'series',
    episode_count: 28,
  }

  it('reports rows touched only at insert as adds', () => {
    const entry = mapActivityRow(
      { ...base, added_at: '2026-09-20T00:00:00Z', updated_at: '2026-09-20T00:00:01Z' },
      'u1',
    )
    assert.equal(entry.action, 'added')
    assert.equal(entry.user.isSelf, true)
    assert.equal(entry.content.contentType, 'tv')
    assert.equal(entry.content.episodeCount, 28)
  })

  it('reports later edits as updates with the rating', () => {
    const entry = mapActivityRow(
      {
        ...base,
        previous_episode: 1,
        added_at: '2026-09-01T00:00:00Z',
        updated_at: '2026-09-20T00:00:00Z',
        score: 9,
      },
      'someone-else',
    )
    assert.equal(entry.action, 'updated')
    assert.equal(entry.previousEpisode, 1)
    assert.equal(entry.currentEpisode, 3)
    assert.equal(entry.rating, 9)
    assert.equal(entry.user.isSelf, false)
    assert.equal(entry.at, '2026-09-20T00:00:00.000Z')
  })
})

describe('dayKey', () => {
  it('uses the UTC calendar day', () => {
    assert.equal(dayKey(new Date('2026-09-27T23:30:00-05:00')), '2026-09-28')
  })
})
