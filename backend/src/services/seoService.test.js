import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { imageUrl, metaDescription, parsePagePath } from './seoService.js'

const ID = '8fb6b935-deab-4221-9a52-2e8e151b5906'

describe('parsePagePath', () => {
  it('recognizes static pages, detail pages with or without a slug, and posts', () => {
    assert.deepEqual(parsePagePath('/'), { type: 'static', key: '/' })
    assert.deepEqual(parsePagePath('/movies/'), { type: 'static', key: '/movies' })
    assert.deepEqual(parsePagePath(`/tv-show/${ID}`), {
      type: 'content',
      prefix: '/tv-show',
      id: ID,
    })
    assert.deepEqual(parsePagePath(`/character/${ID.toUpperCase()}/levi?x=1`), {
      type: 'content',
      prefix: '/character',
      id: ID,
    })
    assert.deepEqual(parsePagePath(`/forum/post/${ID}/a-title`), { type: 'post', id: ID })
  })

  it('ignores everything else', () => {
    assert.equal(parsePagePath('/settings'), null)
    assert.equal(parsePagePath('/movie/not-an-id'), null)
    assert.equal(parsePagePath(`/movie/${ID}/slug/extra`), null)
    assert.equal(parsePagePath(undefined), null)
  })
})

describe('imageUrl', () => {
  it('resolves stored paths like the frontend', () => {
    assert.equal(imageUrl('/abc.jpg'), 'https://image.tmdb.org/t/p/w500/abc.jpg')
    assert.equal(imageUrl('//cdn.test/a.png'), 'https://cdn.test/a.png')
    assert.equal(imageUrl('http://cdn.myanimelist.net/a.jpg'), 'https://cdn.myanimelist.net/a.jpg')
    assert.equal(imageUrl('https://img.test/a.jpg'), 'https://img.test/a.jpg')
    assert.equal(imageUrl(''), null)
  })
})

describe('metaDescription', () => {
  it('flattens and shortens on a word boundary', () => {
    assert.equal(metaDescription('a\n\nb'), 'a b')
    const long = metaDescription('word '.repeat(60))
    assert.ok(long.length <= 161)
    assert.ok(long.endsWith('…'))
  })
})
