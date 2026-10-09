import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  SITEMAP_CHUNK,
  SITEMAP_SECTIONS,
  parseSitemapFile,
  sitemapFiles,
  sitemapIndexXml,
  urlsetXml,
} from './sitemapService.js'

describe('sitemapFiles', () => {
  it('lists pages, then one file per chunk of each non-empty section', () => {
    assert.deepEqual(sitemapFiles({ titles: SITEMAP_CHUNK + 1, characters: 3, studios: 0 }), [
      'pages.xml',
      'titles-1.xml',
      'titles-2.xml',
      'characters-1.xml',
    ])
  })
})

describe('parseSitemapFile', () => {
  it('accepts known sections and rejects anything else', () => {
    assert.deepEqual(parseSitemapFile('pages.xml'), { section: 'pages' })
    assert.deepEqual(parseSitemapFile('voice-actors-3.xml'), { section: 'voice-actors', chunk: 3 })
    assert.equal(parseSitemapFile('titles-0.xml'), null)
    assert.equal(parseSitemapFile('users-1.xml'), null)
    assert.equal(parseSitemapFile('../titles-1.xml'), null)
  })
})

describe('section paths', () => {
  it('opens series on the TV page and movies/specials on the movie page', () => {
    const { path } = SITEMAP_SECTIONS.titles
    assert.equal(path({ kind: 'series', id: 'a' }), '/tv-show/a')
    assert.equal(path({ kind: 'special', id: 'b' }), '/movie/b')
    assert.equal(SITEMAP_SECTIONS['voice-actors'].path({ id: 'c' }), '/voice-actor/c')
  })
})

describe('xml', () => {
  it('escapes locations and adds lastmod when known', () => {
    const xml = urlsetXml('https://x.test', [
      { path: '/forum?tag=a&b', lastModified: '2026-01-02T00:00:00Z' },
      { path: '/' },
    ])
    assert.match(
      xml,
      /<loc>https:\/\/x\.test\/forum\?tag=a&amp;b<\/loc><lastmod>2026-01-02T00:00:00\.000Z<\/lastmod>/,
    )
    assert.match(xml, /<url><loc>https:\/\/x\.test\/<\/loc><\/url>/)
    assert.match(
      sitemapIndexXml('https://x.test', ['pages.xml']),
      /<sitemap><loc>https:\/\/x\.test\/sitemaps\/pages\.xml<\/loc><\/sitemap>/,
    )
  })
})
