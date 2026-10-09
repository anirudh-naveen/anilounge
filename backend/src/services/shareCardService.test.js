import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CARD_HEIGHT, CARD_WIDTH, clip, renderCard, titleSize } from './shareCardService.js'

describe('clip', () => {
  it('keeps short text and cuts long text on a word boundary', () => {
    assert.equal(clip('  a\n b ', 10), 'a b')
    const cut = clip('word '.repeat(40), 30)
    assert.ok(cut.length <= 30)
    assert.ok(cut.endsWith('word…'))
  })
})

describe('titleSize', () => {
  it('steps down for longer titles and is larger without a poster', () => {
    assert.ok(titleSize('Frieren', false) > titleSize('x'.repeat(50), false))
    assert.ok(titleSize('Frieren', true) > titleSize('Frieren', false))
  })
})

describe('renderCard', () => {
  it('draws a 1200×630 PNG without a poster', async () => {
    const png = await renderCard({
      eyebrow: 'Review · someone',
      title: 'A post title',
      text: 'Body text.',
      meta: '1 likes · 0 comments',
      tags: ['Frieren'],
      rating: { value: 8.5, count: 3 },
      poster: null,
    })
    assert.equal(png.subarray(1, 4).toString(), 'PNG')
    assert.equal(png.readUInt32BE(16), CARD_WIDTH)
    assert.equal(png.readUInt32BE(20), CARD_HEIGHT)
  })
})
