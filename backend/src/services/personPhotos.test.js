import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { commonsFileUrl, wikidataImageName } from './personPhotos.js'

describe('Wikidata photos', () => {
  it('reads the image file from a P18 claim, skipping deprecated ones', () => {
    const claim = (value, rank = 'normal') => ({ rank, mainsnak: { datavalue: { value } } })
    assert.equal(
      wikidataImageName({
        claims: { P18: [claim('Old.jpg', 'deprecated'), claim('Ben Foster.jpg')] },
      }),
      'Ben Foster.jpg',
    )
    assert.equal(wikidataImageName({ claims: {} }), '')
  })

  it('links the Commons file at profile size', () => {
    assert.equal(
      commonsFileUrl('Ben Foster 07.jpg'),
      'https://commons.wikimedia.org/wiki/Special:FilePath/Ben_Foster_07.jpg?width=400',
    )
    assert.equal(commonsFileUrl(''), '')
  })
})
