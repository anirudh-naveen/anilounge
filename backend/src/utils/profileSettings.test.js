import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_PROFILE_SETTINGS,
  normalizePreferences,
  normalizeProfileSettings,
} from './profileSettings.js'

describe('normalizeProfileSettings', () => {
  it('returns the defaults for empty or invalid input', () => {
    assert.deepEqual(normalizeProfileSettings(null), { ...DEFAULT_PROFILE_SETTINGS })
    assert.deepEqual(normalizeProfileSettings('nope'), { ...DEFAULT_PROFILE_SETTINGS })
  })

  it('drops unknown values and completes the tab order', () => {
    const settings = normalizeProfileSettings({
      accent: 'neon',
      headline: `  ${'x'.repeat(200)}  `,
      tabOrder: ['stats', 'bogus', 'stats'],
      hiddenTabs: ['bogus'],
    })
    assert.equal(settings.accent, 'coral')
    assert.equal(settings.headline.length, 80)
    assert.deepEqual(settings.tabOrder, ['stats', 'favorites', 'watchlist'])
    assert.deepEqual(settings.hiddenTabs, [])
  })

  it('keeps one tab visible and moves the default tab off hidden tabs', () => {
    const settings = normalizeProfileSettings({
      hiddenTabs: ['favorites', 'watchlist', 'stats'],
      defaultTab: 'favorites',
    })
    assert.deepEqual(settings.hiddenTabs, ['favorites', 'watchlist'])
    assert.equal(settings.defaultTab, 'stats')
  })

  it('merges a partial update over the stored settings', () => {
    const stored = normalizeProfileSettings({ accent: 'teal', isPublic: false })
    const next = normalizeProfileSettings({ headline: 'Hi' }, stored)
    assert.equal(next.accent, 'teal')
    assert.equal(next.isPublic, false)
    assert.equal(next.headline, 'Hi')
  })
})

describe('normalizePreferences', () => {
  it('keeps trimmed unique strings only', () => {
    assert.deepEqual(
      normalizePreferences({ favoriteGenres: [' Action ', 'Action', 3, ''], favoriteStudios: 'x' }),
      { favoriteGenres: ['Action'], favoriteStudios: [] },
    )
  })
})
