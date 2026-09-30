import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { normalizeFieldValue, planSyncChanges } from './syncReview.js'

const current = {
  title: 'Frieren',
  nativeTitle: '葬送のフリーレン',
  overview: 'An elf mage.',
  tagline: null,
  posterPath: '/a.jpg',
  backdropPath: null,
  releaseDate: '2023-09-29',
  airingStatus: 'airing',
  episodeCount: 12,
  seasonCount: 1,
}

describe('planSyncChanges', () => {
  it('applies changes with a notice, fills blanks quietly, and denies blanking', () => {
    const plan = planSyncChanges({
      kind: 'series',
      current,
      incoming: {
        ...current,
        title: 'Frieren: Beyond Journey’s End',
        overview: '   ',
        tagline: 'The journey after the journey.',
      },
    })
    assert.deepEqual(plan.keep, { overview: 'An elf mage.' })
    assert.deepEqual(plan.notices, [
      {
        field: 'title',
        outcome: 'changed',
        oldValue: 'Frieren',
        newValue: 'Frieren: Beyond Journey’s End',
      },
    ])
  })

  it('notes, but does not apply, changes to locked fields', () => {
    const plan = planSyncChanges({
      kind: 'series',
      current,
      incoming: { ...current, posterPath: '/b.jpg', overview: '' },
      locked: ['posterPath', 'overview'],
    })
    // Locks are applied by the caller, so nothing needs putting back here.
    assert.deepEqual(plan.keep, {})
    assert.deepEqual(plan.notices, [
      { field: 'posterPath', outcome: 'blocked', oldValue: '/a.jpg', newValue: '/b.jpg' },
    ])
  })

  it('lets airing progress through quietly but notes going backwards', () => {
    const forward = planSyncChanges({
      kind: 'series',
      current,
      incoming: { ...current, airingStatus: 'finished', episodeCount: 28, seasonCount: 2 },
    })
    assert.deepEqual(forward, { keep: {}, notices: [] })

    const backward = planSyncChanges({
      kind: 'series',
      current,
      incoming: { ...current, airingStatus: 'upcoming', episodeCount: 10 },
    })
    assert.deepEqual(
      backward.notices.map((notice) => notice.field),
      ['airingStatus', 'episodeCount'],
    )
  })

  it('treats 0 counts as unknown and skips accepted fields', () => {
    const plan = planSyncChanges({
      kind: 'series',
      current,
      incoming: { ...current, episodeCount: 0, posterPath: '/c.jpg' },
      accepted: ['posterPath'],
    })
    assert.deepEqual(plan, { keep: { episodeCount: 12 }, notices: [] })
  })

  it('works for people and studios', () => {
    const plan = planSyncChanges({
      kind: 'character',
      current: { name: 'Fern', englishName: null, nativeName: 'フェルン', about: 'Mage.', imagePath: '/f.jpg' },
      incoming: { name: 'Fern', englishName: 'Fern', nativeName: null, about: 'A mage.', imagePath: '/f.jpg' },
    })
    assert.deepEqual(plan.keep, { nativeName: 'フェルン' })
    assert.deepEqual(plan.notices, [
      { field: 'about', outcome: 'changed', oldValue: 'Mage.', newValue: 'A mage.' },
    ])
  })
})

describe('normalizeFieldValue', () => {
  it('trims text and nulls empties', () => {
    assert.equal(normalizeFieldValue('overview', '  hi '), 'hi')
    assert.equal(normalizeFieldValue('overview', ''), null)
    assert.equal(normalizeFieldValue('runtime', '0'), null)
    assert.equal(normalizeFieldValue('runtime', '24'), 24)
  })
})
