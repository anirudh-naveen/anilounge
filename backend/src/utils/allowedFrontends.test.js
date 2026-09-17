import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isAllowedCorsOrigin, isAllowedReferer } from './allowedFrontends.js'

describe('isAllowedCorsOrigin', () => {
  it('allows the public AniLounge hosts', () => {
    assert.equal(isAllowedCorsOrigin('https://www.anilounge.net', []), true)
    assert.equal(isAllowedCorsOrigin('https://anilounge.net', []), true)
  })

  it('allows Vercel previews and env extras', () => {
    assert.equal(isAllowedCorsOrigin('https://find-animation-git-foo.vercel.app', []), true)
    assert.equal(isAllowedCorsOrigin('https://preview.example.com', ['https://preview.example.com']), true)
  })

  it('rejects unknown origins', () => {
    assert.equal(isAllowedCorsOrigin('https://evil.example', []), false)
  })
})

describe('isAllowedReferer', () => {
  it('allows anilounge.net and missing referer', () => {
    assert.equal(isAllowedReferer('https://www.anilounge.net/movies'), true)
    assert.equal(isAllowedReferer(undefined), true)
  })

  it('rejects unknown referers', () => {
    assert.equal(isAllowedReferer('https://evil.example/steal'), false)
  })
})
