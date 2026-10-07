import { describe, expect, it } from 'vitest'
import { POSTER_PLACEHOLDER, showPosterPlaceholder } from '@/utils/posters'
import { getPosterUrl } from '@/services/api'

describe('poster placeholder', () => {
  it('is used for titles without a poster', () => {
    expect(getPosterUrl('')).toBe(POSTER_PLACEHOLDER)
  })

  it('swaps in once and never loops', () => {
    const img = document.createElement('img')
    img.src = 'https://image.tmdb.org/t/p/w500/missing.jpg'
    const error = () => showPosterPlaceholder({ target: img } as unknown as Event)
    error()
    expect(img.getAttribute('src')).toBe(POSTER_PLACEHOLDER)
    img.src = 'https://example.test/other.jpg'
    error()
    expect(img.getAttribute('src')).toBe('https://example.test/other.jpg')
  })
})
