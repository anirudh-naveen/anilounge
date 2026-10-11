import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { applyTvmazeImages } from './tvmaze.js'

const cast = [
  {
    person: { name: 'Dan Castellaneta', image: { medium: 'dan.jpg' } },
    character: { name: 'Homer Simpson', image: { medium: 'homer-m.jpg', original: 'homer.jpg' } },
    voice: true,
  },
  {
    person: { name: 'Zach Tyler Eisen', image: null },
    character: { name: 'Aang', image: { medium: 'aang.jpg' } },
    voice: true,
  },
]

describe('applyTvmazeImages', () => {
  it('fills images by character name, else through the voice actor', () => {
    const payloads = [
      { name: 'Aang', imagePath: '', appearance: { voiceActors: [] } },
      {
        name: 'Homer',
        imagePath: '',
        appearance: { voiceActors: [{ name: 'Dan Castellaneta', imagePath: '' }] },
      },
      { name: 'Bart Simpson', imagePath: '', appearance: { voiceActors: [] } },
    ]
    assert.equal(applyTvmazeImages(payloads, cast), 2)
    assert.equal(payloads[0].imagePath, 'aang.jpg')
    assert.equal(payloads[1].imagePath, 'homer.jpg')
    assert.equal(payloads[1].appearance.voiceActors[0].imagePath, 'dan.jpg')
    assert.equal(payloads[2].imagePath, '')
  })

  it('keeps images and photos the character already has', () => {
    const payloads = [
      {
        name: 'Aang',
        imagePath: 'mine.jpg',
        appearance: { voiceActors: [{ name: 'Dan Castellaneta', imagePath: 'tmdb.jpg' }] },
      },
    ]
    assert.equal(applyTvmazeImages(payloads, cast), 0)
    assert.equal(payloads[0].imagePath, 'mine.jpg')
    assert.equal(payloads[0].appearance.voiceActors[0].imagePath, 'tmdb.jpg')
  })
})
