import { describe, expect, it } from 'vitest'
import {
  getAlternativeTitles,
  getDisplayTitle,
  getNativeTitle,
  getSearchableTitles,
} from '@/utils/titles'

const titled = {
  title: 'The Fragrant Flower Blooms With Dignity',
  englishTitle: 'The Fragrant Flower Blooms With Dignity',
  nativeTitle: '薫る花は凛と咲く',
  originalTitle: '薫る花は凛と咲く',
  alternativeTitles: [
    'The Fragrant Flower Blooms With Dignity',
    '薫る花は凛と咲く',
    'Kaoru Hana wa Rin to Saku',
    'Kaoruhana',
    '香る花は凛と咲く',
  ],
}

describe('title display', () => {
  it('shows English as the primary title and native only when it differs', () => {
    expect(getDisplayTitle(titled)).toBe('The Fragrant Flower Blooms With Dignity')
    expect(getNativeTitle(titled)).toBe('薫る花は凛と咲く')
  })

  it('does not treat the English or native names as extra alternative titles', () => {
    expect(getAlternativeTitles(titled)).toEqual([
      'Kaoru Hana wa Rin to Saku',
      'Kaoruhana',
      '香る花は凛と咲く',
    ])
  })

  it('keeps alternative titles searchable even when they are not displayed', () => {
    expect(getSearchableTitles(titled)).toEqual([
      'The Fragrant Flower Blooms With Dignity',
      '薫る花は凛と咲く',
      'Kaoru Hana wa Rin to Saku',
      'Kaoruhana',
      '香る花は凛と咲く',
    ])
  })
})
