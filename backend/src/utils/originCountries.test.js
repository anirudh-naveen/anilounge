import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MAL_ORIGIN_COUNTRIES, extractOriginCountries } from './originCountries.js'

describe('extractOriginCountries', () => {
  it('reads TV origin_country codes', () => {
    assert.deepEqual(extractOriginCountries({ origin_country: ['jp', 'US'] }), ['JP', 'US'])
  })

  it('reads movie production_countries and de-dupes', () => {
    assert.deepEqual(
      extractOriginCountries({
        origin_country: ['JP'],
        production_countries: [{ iso_3166_1: 'jp' }, { iso_3166_1: 'KR' }],
      }),
      ['JP', 'KR'],
    )
  })

  it('returns an empty list when TMDB has no country fields', () => {
    assert.deepEqual(extractOriginCountries({}), [])
    assert.deepEqual(extractOriginCountries(null), [])
  })
})

describe('MAL_ORIGIN_COUNTRIES', () => {
  it('defaults MAL titles to Japan', () => {
    assert.deepEqual(MAL_ORIGIN_COUNTRIES, ['JP'])
  })
})
