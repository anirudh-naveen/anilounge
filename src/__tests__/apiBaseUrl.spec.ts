import { describe, expect, it } from 'vitest'
import { resolveApiBaseUrl } from '@/services/api'

describe('resolveApiBaseUrl', () => {
  it('uses the same-origin proxy in development', () => {
    expect(resolveApiBaseUrl('https://api.example.com', true)).toBe('/api')
  })

  it('ignores Railway addresses so the session cookie stays first-party', () => {
    expect(resolveApiBaseUrl('https://anilounge-production.up.railway.app/api', false)).toBe('/api')
    expect(resolveApiBaseUrl('https://find-animation-production.up.railway.app', false)).toBe('/api')
  })

  it('keeps another configured backend, adding /api when it is a bare origin', () => {
    expect(resolveApiBaseUrl('https://api.example.com/', false)).toBe('https://api.example.com/api')
    expect(resolveApiBaseUrl('https://api.example.com/api', false)).toBe('https://api.example.com/api')
    expect(resolveApiBaseUrl('', false)).toBe('/api')
  })
})
