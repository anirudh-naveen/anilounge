import { describe, expect, it } from 'vitest'
import { isAppRoute } from '../../middleware'

const UUID = 'bd843459-9082-495b-815e-2cd4c73346e6'

describe('isAppRoute', () => {
  it('knows the app’s pages', () => {
    for (const path of [
      '/',
      '/forum',
      '/privacy',
      '/login',
      '/u/someone',
      `/movie/${UUID}`,
      `/movie/forgotten-island/${UUID}`,
      `/forum/post/a-title/${UUID}`,
      `/tv-show/${UUID}/old-slug`,
      '/character/some-name/0123456789abcdef01234567',
    ]) {
      expect(isAppRoute(path)).toBe(true)
    }
  })

  it('rejects URLs with no page, so they get a 404', () => {
    for (const path of [
      '/nope',
      '/movie',
      '/movie/not-an-id',
      `/movie/a/b/${UUID}`,
      `/film/${UUID}`,
      '/u/someone/extra',
    ]) {
      expect(isAppRoute(path)).toBe(false)
    }
  })
})
