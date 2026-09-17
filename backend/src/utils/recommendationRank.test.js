import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  catalogGenreNames,
  compareRecommendationRank,
  sortByRecommendationRank,
} from './recommendationRank.js'

const actionLow = {
  title: 'Action Low',
  genres: [{ name: 'Action' }, { name: 'Animation' }],
  studios: ['Bones'],
  unifiedScore: 5.1,
  popularity: 10,
}

const actionHigh = {
  title: 'Action High',
  genres: [{ name: 'Action' }],
  studios: ['Madhouse'],
  unifiedScore: 9.4,
  popularity: 99,
}

const romanceHigh = {
  title: 'Romance High',
  genres: [{ name: 'Romance' }],
  studios: ['Kyoto Animation'],
  unifiedScore: 9.8,
  popularity: 80,
}

const actionBones = {
  title: 'Action Bones',
  genres: [{ name: 'Action' }, { name: 'Drama' }],
  studios: ['Bones'],
  unifiedScore: 7.0,
  popularity: 20,
}

describe('catalogGenreNames', () => {
  it('drops the generic Animation tag', () => {
    assert.deepEqual(catalogGenreNames(actionLow), ['Action'])
  })
})

describe('sortByRecommendationRank', () => {
  it('ranks genre matches ahead of higher-rated titles in other genres', () => {
    const ranked = sortByRecommendationRank([romanceHigh, actionLow], { genre: 'Action' })
    assert.equal(ranked[0].title, 'Action Low')
    assert.equal(compareRecommendationRank(actionLow, romanceHigh, { genre: 'Action' }) < 0, true)
  })

  it('ranks studio matches ahead of higher ratings when genres are equal', () => {
    const ranked = sortByRecommendationRank([actionHigh, actionBones], {
      genre: 'Action',
      studio: 'Bones',
    })
    assert.equal(ranked[0].title, 'Action Bones')
  })

  it('uses high ratings only after genre and studio', () => {
    const ranked = sortByRecommendationRank([actionLow, actionHigh], { genre: 'Action' })
    assert.equal(ranked[0].title, 'Action High')
  })

  it('prefers more shared genres, then shared studios, for similar-to picks', () => {
    const ranked = sortByRecommendationRank(
      [
        { title: 'One genre hit', genres: [{ name: 'Action' }], studios: ['MAPPA'], unifiedScore: 9.2 },
        {
          title: 'Two genre studio hit',
          genres: [{ name: 'Action' }, { name: 'Drama' }],
          studios: ['Wit Studio'],
          unifiedScore: 6.8,
        },
      ],
      { seedGenres: ['Action', 'Drama'], seedStudios: ['Wit Studio'] },
    )
    assert.equal(ranked[0].title, 'Two genre studio hit')
  })
})
