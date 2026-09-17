import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  extractMatchesTopic,
  isAllowedWikipediaUrl,
  isKnownGenre,
  normalizePublicInfoKind,
  parseWikipediaSummary,
  wikipediaPageMatchesCatalog,
  wikipediaSummaryUrl,
  wikiLookupCandidates,
  wikiTitleCandidates,
} from './publicInfoLookup.js'
import { fetchWikipediaSummary } from '../services/publicInfoLookupService.js'

describe('isAllowedWikipediaUrl', () => {
  it('allows only https English Wikipedia', () => {
    assert.equal(
      isAllowedWikipediaUrl('https://en.wikipedia.org/api/rest_v1/page/summary/Totoro'),
      true,
    )
    assert.equal(isAllowedWikipediaUrl('https://en.wikipedia.org/wiki/Spirited_Away'), true)
    assert.equal(isAllowedWikipediaUrl('http://en.wikipedia.org/wiki/Spirited_Away'), false)
    assert.equal(isAllowedWikipediaUrl('https://evil.example/wiki/Spirited_Away'), false)
    assert.equal(isAllowedWikipediaUrl('https://en.wikipedia.org.evil.com/wiki/x'), false)
  })
})

describe('wikipediaSummaryUrl', () => {
  it('encodes page titles onto the REST summary path', () => {
    assert.equal(
      wikipediaSummaryUrl('Spirited Away'),
      'https://en.wikipedia.org/api/rest_v1/page/summary/Spirited_Away',
    )
    assert.equal(wikipediaSummaryUrl('  '), null)
  })
})

describe('wikiTitleCandidates', () => {
  it('prefers English then other catalog titles', () => {
    assert.deepEqual(
      wikiTitleCandidates({
        englishTitle: 'Spirited Away',
        title: 'Sen to Chihiro no Kamikakushi',
        nativeTitle: '千と千尋の神隠し',
      }),
      ['Spirited Away', 'Sen to Chihiro no Kamikakushi', '千と千尋の神隠し'],
    )
  })
})

describe('wikipediaPageMatchesCatalog', () => {
  const totoro = { englishTitle: 'My Neighbor Totoro', title: 'Tonari no Totoro' }

  it('matches film suffix pages and catalog titles', () => {
    assert.equal(wikipediaPageMatchesCatalog('My Neighbor Totoro', totoro), true)
    assert.equal(wikipediaPageMatchesCatalog('My Neighbor Totoro (film)', totoro), true)
    assert.equal(wikipediaPageMatchesCatalog('Unrelated Novel', totoro), false)
  })
})

describe('parseWikipediaSummary', () => {
  it('keeps a short extract and Wikipedia desktop URL', () => {
    const parsed = parseWikipediaSummary({
      type: 'standard',
      title: 'Spirited Away',
      extract: 'A girl enters the spirit world.',
      content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Spirited_Away' } },
    })
    assert.deepEqual(parsed, {
      title: 'Spirited Away',
      extract: 'A girl enters the spirit world.',
      sourceUrl: 'https://en.wikipedia.org/wiki/Spirited_Away',
      description: '',
    })
  })

  it('rejects disambiguation, empty extracts, and off-wiki links', () => {
    assert.equal(parseWikipediaSummary({ type: 'disambiguation', extract: 'Many pages' }), null)
    assert.equal(parseWikipediaSummary({ type: 'standard', extract: '  ' }), null)
    assert.equal(
      parseWikipediaSummary({
        type: 'standard',
        extract: 'Plot.',
        content_urls: { desktop: { page: 'https://example.com/wiki/x' } },
      }),
      null,
    )
  })
})

describe('fetchWikipediaSummary', () => {
  it('accepts allowlisted JSON and rejects a redirect off Wikipedia', async () => {
    const ok = await fetchWikipediaSummary('Spirited Away', {
      fetchImpl: async (url) => ({
        ok: true,
        url,
        json: async () => ({
          type: 'standard',
          title: 'Spirited Away',
          extract: 'A girl enters the spirit world.',
          content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Spirited_Away' } },
        }),
      }),
    })
    assert.equal(ok.extract, 'A girl enters the spirit world.')

    const hijack = await fetchWikipediaSummary('Spirited Away', {
      fetchImpl: async () => ({
        ok: true,
        url: 'https://evil.example/summary',
        json: async () => ({ type: 'standard', extract: 'nope' }),
      }),
    })
    assert.equal(hijack, null)
  })
})

describe('topic gates', () => {
  it('normalizes kinds and known genres', () => {
    assert.equal(normalizePublicInfoKind('seiyuu'), 'voice_actor')
    assert.equal(normalizePublicInfoKind('movie'), 'title')
    assert.equal(isKnownGenre('Isekai'), true)
    assert.equal(isKnownGenre('finance'), false)
  })

  it('builds Wikipedia candidates and checks extracts for studios, VAs, and genres', () => {
    assert.deepEqual(wikiLookupCandidates('Ghibli', 'studio').slice(0, 2), [
      'Ghibli',
      'Ghibli (studio)',
    ])
    assert.equal(
      extractMatchesTopic('Studio Ghibli is a Japanese animation studio.', '', 'studio'),
      true,
    )
    assert.equal(extractMatchesTopic('Apple Inc. is a technology company.', '', 'studio'), false)
    assert.equal(
      extractMatchesTopic('', 'Japanese voice actress', 'voice_actor'),
      true,
    )
    assert.equal(extractMatchesTopic('An American football player.', '', 'voice_actor'), false)
    assert.equal(extractMatchesTopic('Isekai is an anime genre.', '', 'genre'), true)
  })
})
