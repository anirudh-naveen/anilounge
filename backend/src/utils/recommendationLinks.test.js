import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  anilistRecommendationLinks,
  rankSimilarTitles,
  tmdbRecommendationLinks,
} from './recommendationLinks.js'

describe('anilistRecommendationLinks', () => {
  it('weights links by votes and drops unvoted, duplicate, and self links', () => {
    const links = anilistRecommendationLinks({
      id: 1,
      recommendations: {
        nodes: [
          { rating: 100, mediaRecommendation: { id: 2 } },
          { rating: 10, mediaRecommendation: { id: 3 } },
          { rating: 5, mediaRecommendation: { id: 2 } },
          { rating: 0, mediaRecommendation: { id: 4 } },
          { rating: -3, mediaRecommendation: { id: 5 } },
          { rating: 50, mediaRecommendation: { id: 1 } },
          { rating: 8, mediaRecommendation: null },
        ],
      },
    })
    assert.deepEqual(
      links.map((link) => link.targetId),
      [2, 3],
    )
    assert.equal(links[0].weight, 1)
    assert.ok(links[1].weight > 0.05 && links[1].weight < links[0].weight)
    assert.ok(links.every((link) => link.targetType === 'anime'))
  })

  it('is undefined when recommendations were not fetched', () => {
    assert.equal(anilistRecommendationLinks({ id: 1 }), undefined)
    assert.deepEqual(anilistRecommendationLinks({ id: 1, recommendations: { nodes: [] } }), [])
  })
})

describe('tmdbRecommendationLinks', () => {
  it('weights links by list order and keeps their media type', () => {
    const links = tmdbRecommendationLinks(
      {
        id: 10,
        recommendations: {
          results: [
            { id: 11, media_type: 'movie' },
            { id: 12, media_type: 'tv' },
            { id: 11, media_type: 'movie' },
            { id: 10, media_type: 'movie' },
            { id: 13 },
          ],
        },
      },
      'movie',
    )
    assert.deepEqual(
      links.map((link) => [link.targetType, link.targetId]),
      [
        ['movie', 11],
        ['tv', 12],
        ['movie', 13],
      ],
    )
    assert.ok(links[0].weight > links[1].weight && links[1].weight > links[2].weight)
  })

  it('is undefined when recommendations were not fetched', () => {
    assert.equal(tmdbRecommendationLinks({ id: 1 }, 'tv'), undefined)
  })
})

describe('rankSimilarTitles', () => {
  it('counts each source once and adds the sources up', () => {
    const ranked = rankSimilarTitles([
      { targetId: 'both', source: 'anilist', weight: 0.4 },
      { targetId: 'both', source: 'tmdb', weight: 0.4 },
      { targetId: 'anilist-only', source: 'anilist', weight: 0.7 },
      { targetId: 'anilist-only', source: 'anilist', weight: 0.6 },
      { targetId: 'anilist-only', source: 'anilist', weight: 0.5 },
    ])
    assert.deepEqual(
      ranked.map((pick) => [pick.id, pick.score, pick.sources]),
      [
        ['both', 0.8, ['anilist', 'tmdb']],
        ['anilist-only', 0.7, ['anilist']],
      ],
    )
  })

  it('breaks ties on catalog score and keeps the limit', () => {
    const ranked = rankSimilarTitles(
      [
        { targetId: 'low', source: 'tmdb', weight: 0.5, targetScore: 6 },
        { targetId: 'high', source: 'tmdb', weight: 0.5, targetScore: 9 },
        { targetId: 'weak', source: 'tmdb', weight: 0.1 },
      ],
      { limit: 2 },
    )
    assert.deepEqual(
      ranked.map((pick) => pick.id),
      ['high', 'low'],
    )
  })
})
