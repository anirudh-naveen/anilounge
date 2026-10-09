import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  aggregateRating,
  breadcrumbList,
  imageUrl,
  metaDescription,
  parsePagePath,
  shareCardUrl,
} from './seoService.js'

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
    assert.deepEqual(parsePagePath(`/character/levi/${ID.toUpperCase()}?x=1`), {
      type: 'content',
      prefix: '/character',
      id: ID,
    })
    assert.deepEqual(parsePagePath(`/forum/post/a-title/${ID}`), { type: 'post', id: ID })
    // The older id-first form still resolves (the middleware redirects it).
    assert.deepEqual(parsePagePath(`/tv-show/${ID}/the-simpsons`), {
      type: 'content',
      prefix: '/tv-show',
      id: ID,
    })
  })

  it('ignores everything else', () => {
    assert.equal(parsePagePath('/settings'), null)
    assert.equal(parsePagePath('/movie/not-an-id'), null)
    assert.equal(parsePagePath(`/movie/a/${ID}/extra`), null)
    assert.equal(parsePagePath(`/movie/${ID}/${ID}`), null)
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

describe('aggregateRating', () => {
  it('needs enough site ratings and rounds to one decimal', () => {
    assert.equal(aggregateRating(2, 17), null)
    assert.deepEqual(aggregateRating(3, 25), {
      '@type': 'AggregateRating',
      ratingValue: 8.3,
      bestRating: 10,
      worstRating: 1,
      ratingCount: 3,
    })
  })
})

describe('breadcrumbList', () => {
  it('numbers the trail from Home', () => {
    const list = breadcrumbList([
      { name: 'AniLounge', path: '/' },
      { name: 'Forum', path: '/forum' },
    ])
    assert.equal(list['@type'], 'BreadcrumbList')
    assert.deepEqual(list.itemListElement[1], {
      '@type': 'ListItem',
      position: 2,
      name: 'Forum',
      item: '/forum',
    })
  })
})

describe('shareCardUrl', () => {
  it('points at the card route with the path encoded', () => {
    assert.equal(
      shareCardUrl('https://anilounge.net', '/movie/a-b/1'),
      'https://anilounge.net/api/seo/card.png?path=%2Fmovie%2Fa-b%2F1',
    )
  })
})
