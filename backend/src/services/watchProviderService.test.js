import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { normalizeRegion, regionProviders, streamingLinks } from './watchProviderService.js'

describe('normalizeRegion', () => {
  it('accepts two-letter codes and defaults to US', () => {
    assert.equal(normalizeRegion('gb'), 'GB')
    assert.equal(normalizeRegion('United Kingdom'), 'US')
    assert.equal(normalizeRegion(undefined), 'US')
  })
})

describe('streamingLinks', () => {
  it('keeps one working streaming link per site, English first', () => {
    const links = streamingLinks([
      {
        site: 'Crunchyroll',
        url: 'https://www.crunchyroll.com/fr/series/x',
        type: 'STREAMING',
        language: 'French',
      },
      {
        site: 'Crunchyroll',
        url: 'https://www.crunchyroll.com/series/x',
        type: 'STREAMING',
        language: 'English',
      },
      {
        site: 'Netflix',
        url: 'https://www.netflix.com/title/1',
        type: 'STREAMING',
        language: null,
        icon: 'https://s4.anilist.co/file/anilistcdn/link/icon/10-rVGPom8RCiwH.png',
        color: '#F00000',
      },
      { site: 'Twitter', url: 'https://twitter.com/x', type: 'SOCIAL' },
      { site: 'Old', url: 'https://old.example/x', type: 'STREAMING', isDisabled: true },
      { site: 'Plain', url: 'http://insecure.example/x', type: 'STREAMING' },
    ])
    assert.deepEqual(links, [
      {
        site: 'Crunchyroll',
        url: 'https://www.crunchyroll.com/series/x',
        language: 'English',
        icon: null,
        color: null,
      },
      {
        site: 'Netflix',
        url: 'https://www.netflix.com/title/1',
        language: null,
        icon: 'https://s4.anilist.co/file/anilistcdn/link/icon/10-rVGPom8RCiwH.png',
        color: '#F00000',
      },
    ])
    assert.deepEqual(streamingLinks(null), [])
  })
})

describe('regionProviders', () => {
  it('merges streaming kinds and buy/rent, without duplicates', () => {
    const result = regionProviders({
      link: 'https://www.themoviedb.org/tv/1/watch?locale=US',
      flatrate: [{ provider_id: 283, provider_name: 'Crunchyroll', logo_path: '/cr.jpg' }],
      ads: [{ provider_id: 283, provider_name: 'Crunchyroll', logo_path: '/cr.jpg' }],
      free: [{ provider_id: 7, provider_name: 'Tubi', logo_path: null }],
      rent: [{ provider_id: 2, provider_name: 'Apple TV', logo_path: '/a.jpg' }],
      buy: [{ provider_id: 2, provider_name: 'Apple TV', logo_path: '/a.jpg' }],
    })
    assert.equal(result.link, 'https://www.themoviedb.org/tv/1/watch?locale=US')
    assert.deepEqual(
      result.stream.map((provider) => provider.name),
      ['Crunchyroll', 'Tubi'],
    )
    assert.equal(result.stream[0].logo, 'https://image.tmdb.org/t/p/w92/cr.jpg')
    assert.deepEqual(
      result.buy.map((provider) => provider.name),
      ['Apple TV'],
    )
    assert.deepEqual(regionProviders(undefined), { link: null, stream: [], buy: [] })
  })
})
