import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { recommendationWhy, withRecommendationWhy } from './recommendationWhy.js'

const totoro = {
  title: 'My Neighbor Totoro',
  englishTitle: 'My Neighbor Totoro',
  genres: [{ name: 'Fantasy' }, { name: 'Family' }],
  studios: ['Studio Ghibli'],
  unifiedScore: 8.2,
  malStatus: 'finished_airing',
  overview: 'Two sisters meet forest spirits.',
}

describe('recommendationWhy', () => {
  it('cites the asked genre, studio, and a strong rating', () => {
    const why = recommendationWhy(totoro, { genre: 'Fantasy', studio: 'Ghibli' })
    assert.match(why, /Fantasy genre you asked for/)
    assert.match(why, /Studio Ghibli/)
    assert.match(why, /8\.2/)
  })

  it('mentions similarity and airing when those filters are set', () => {
    const why = recommendationWhy(
      {
        ...totoro,
        malStatus: 'currently_airing',
        unifiedScore: 6,
      },
      { similarTo: 'Spirited Away' },
    )
    assert.match(why, /shares genres with Spirited Away/)
    assert.match(why, /currently airing/)
  })

  it('falls back to a generic catalog clause', () => {
    assert.equal(recommendationWhy({ title: 'Unknown' }), 'A catalog match for your request')
  })

  it('cites favorite genres before ratings', () => {
    const why = recommendationWhy(totoro, { favoriteGenres: ['Fantasy'] })
    assert.match(why, /your Fantasy taste/)
    assert.match(why, /8\.2/)
    assert.equal(why.indexOf('Fantasy') < why.indexOf('8.2'), true)
  })
})

describe('withRecommendationWhy', () => {
  it('adds why onto each row', () => {
    const [row] = withRecommendationWhy([totoro], { studio: 'Ghibli' })
    assert.match(row.why, /Studio Ghibli/)
  })
})
