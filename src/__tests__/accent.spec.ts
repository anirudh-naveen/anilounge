import { describe, expect, it } from 'vitest'
import { accentColor, isCustomAccent, readableOn } from '@/utils/accent'

describe('accent colors', () => {
  it('resolves presets and custom colors', () => {
    expect(accentColor('teal')).toBe('#2bbbad')
    expect(accentColor('#3a7bff')).toBe('#3a7bff')
    expect(accentColor(undefined)).toBe('#e07a5f')
    expect(isCustomAccent('#abcdef')).toBe(true)
    expect(isCustomAccent('coral')).toBe(false)
  })

  it('picks readable text for light and dark accents', () => {
    expect(readableOn('#1a237e')).toBe('#ffffff')
    expect(readableOn('#fff59d')).toBe('#152238')
    expect(readableOn('#3a7bff')).toBe('#ffffff')
    // Presets keep their designed white text.
    expect(readableOn('teal')).toBe('#ffffff')
    expect(readableOn('gold')).toBe('#ffffff')
  })
})
