import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { animationStudioNames } from './studioRoles.js'

describe('animation studio names', () => {
  it("prefers AniList's animation studios, in order", () => {
    const rows = [
      { source: 'mal', studios: [{ name: 'Other' }] },
      { source: 'anilist', studios: [{ name: 'MAPPA', anilistId: 569 }, { name: 'MAPPA' }] },
    ]
    assert.deepEqual(animationStudioNames(rows), ['MAPPA'])
  })

  it("falls back to MAL's studios", () => {
    const rows = [
      { source: 'anilist', studios: [] },
      { source: 'mal', studios: [{ name: 'Bones', malId: 4 }] },
    ]
    assert.deepEqual(animationStudioNames(rows), ['Bones'])
  })

  it('is empty when no source tells them apart', () => {
    assert.deepEqual(animationStudioNames([]), [])
    assert.deepEqual(animationStudioNames([{ source: 'anilist', studios: null }]), [])
  })
})
