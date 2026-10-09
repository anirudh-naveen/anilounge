import { describe, expect, it } from 'vitest'
import { SLUG_MAX, detailPath, slugify } from '@/utils/slug'

// Same cases as backend/src/utils/slug.test.js: the two copies must agree.
describe('slugify', () => {
  it('makes lowercase ASCII words joined by dashes', () => {
    expect(slugify('Attack on Titan')).toBe('attack-on-titan')
    expect(slugify('Re:ZERO -Starting Life in Another World-')).toBe(
      're-zero-starting-life-in-another-world',
    )
    expect(slugify("JoJo's Bizarre Adventure")).toBe('jojos-bizarre-adventure')
    expect(slugify('Pokémon: The Movie 2000')).toBe('pokemon-the-movie-2000')
    expect(slugify('  Spy×Family  ')).toBe('spy-family')
  })

  it('gives an empty slug for names without Latin letters or digits', () => {
    expect(slugify('進撃の巨人')).toBe('')
    expect(slugify('')).toBe('')
    expect(slugify(null)).toBe('')
  })

  it('cuts long names on a word boundary', () => {
    const slug = slugify('word '.repeat(40))
    expect(slug.length).toBeLessThanOrEqual(SLUG_MAX)
    expect(slug).toMatch(/^(word-)*word$/)
  })

  it('builds detail paths', () => {
    expect(detailPath('/forum/post', 'p1', 'Best of 2026?')).toBe('/forum/post/p1/best-of-2026')
    expect(detailPath('/movie', 'm1', 'のんのんびより')).toBe('/movie/m1')
  })
})
