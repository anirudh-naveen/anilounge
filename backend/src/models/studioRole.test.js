import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { studioRole } from './Content.js'

describe('studioRole', () => {
  it("reads AniList's animation and main flags", () => {
    assert.deepEqual(studioRole({ animation: true, isMain: true }), {
      role: 'animation',
      isMain: true,
    })
    assert.deepEqual(studioRole({ role: 'production', isMain: true }), {
      role: 'production',
      isMain: false,
    })
  })

  it('treats MAL studios as animation studios and TMDB companies as unknown', () => {
    assert.deepEqual(studioRole({ malId: 569 }), { role: 'animation', isMain: false })
    assert.deepEqual(studioRole({ tmdbId: 3 }), { role: null, isMain: false })
    assert.deepEqual(studioRole(undefined), { role: null, isMain: false })
  })
})
