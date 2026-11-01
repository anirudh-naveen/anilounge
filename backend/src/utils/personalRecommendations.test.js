import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  becauseText,
  rankRecommendations,
  seedThreshold,
  seedWeight,
} from './personalRecommendations.js'

describe('seedThreshold', () => {
  it('needs five ratings', () => {
    assert.equal(seedThreshold([9, 9, 8, 8]), null)
    assert.equal(seedThreshold([]), null)
  })

  it('uses 7.5 when five ratings reach it', () => {
    assert.equal(seedThreshold([10, 9, 8, 8, 7.5, 3]), 7.5)
  })

  it("falls back to a harsh rater's top ten", () => {
    const scores = [8, 7, 7, 6, 6, 6, 5, 5, 5, 4, 4, 3]
    assert.equal(seedThreshold(scores), 4)
    assert.equal(seedThreshold([8, 7, 6, 5, 4]), 4)
  })
})

describe('seedWeight', () => {
  it('grows with the rating and never drops below 0.5', () => {
    assert.equal(seedWeight(7.5), 1)
    assert.equal(seedWeight(10), 3.5)
    assert.equal(seedWeight(5), 0.5)
  })
})

describe('rankRecommendations', () => {
  it('ranks titles more seeds point to, from higher ratings, first', () => {
    const ranked = rankRecommendations([
      { seedId: 'a', seedRating: 8, targetId: 'one', weight: 0.6 },
      { seedId: 'b', seedRating: 8, targetId: 'two', weight: 0.6 },
      { seedId: 'c', seedRating: 10, targetId: 'two', weight: 0.2 },
      { seedId: 'c', seedRating: 10, targetId: 'three', weight: 0.5 },
    ])
    assert.deepEqual(
      ranked.map((pick) => pick.id),
      ['three', 'two', 'one'],
    )
    assert.deepEqual(
      ranked[1].because.map((seed) => seed.seedId),
      ['b', 'c'],
    )
  })

  it('breaks ties on catalog score', () => {
    const ranked = rankRecommendations([
      { seedId: 'a', seedRating: 9, targetId: 'low', weight: 0.5, targetScore: 6 },
      { seedId: 'a', seedRating: 9, targetId: 'high', weight: 0.5, targetScore: 9 },
    ])
    assert.deepEqual(
      ranked.map((pick) => pick.id),
      ['high', 'low'],
    )
  })

  it('keeps one seed to a third of the list while others have picks', () => {
    const links = [
      ...['p1', 'p2', 'p3', 'p4', 'p5'].map((targetId) => ({
        seedId: 'big',
        seedRating: 10,
        targetId,
        weight: 1,
      })),
      { seedId: 'small', seedRating: 7.5, targetId: 'q1', weight: 0.2 },
    ]
    const ranked = rankRecommendations(links, { limit: 4 })
    assert.deepEqual(
      ranked.map((pick) => pick.id),
      ['p1', 'p2', 'q1', 'p3'],
    )
  })

  it('skips links without a target or weight', () => {
    assert.deepEqual(
      rankRecommendations([
        { seedId: 'a', seedRating: 9, targetId: '', weight: 1 },
        { seedId: 'a', seedRating: 9, targetId: 'x', weight: 0 },
      ]),
      [],
    )
  })
})

describe('becauseText', () => {
  it('names the strongest seed and counts the rest', () => {
    assert.equal(becauseText([{ title: 'Frieren', rating: 9 }]), 'Because you rated Frieren 9/10')
    assert.equal(
      becauseText([
        { title: 'Frieren', rating: 8.5 },
        { title: 'Mushishi', rating: 8 },
        { title: 'Monster', rating: 9 },
      ]),
      'Because you rated Frieren 8.5/10 and 2 more',
    )
    assert.equal(becauseText([]), '')
  })
})
