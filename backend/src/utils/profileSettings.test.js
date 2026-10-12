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
    assert.deepEqual(settings.tabOrder, ['stats', 'favorites', 'watchlist', 'forum', 'friends'])
    assert.deepEqual(settings.hiddenTabs, [])
  })

  it('keeps one tab visible and moves the default tab off hidden tabs', () => {
    const settings = normalizeProfileSettings({
      hiddenTabs: ['favorites', 'watchlist', 'stats', 'forum', 'friends'],
      defaultTab: 'favorites',
    })
    assert.deepEqual(settings.hiddenTabs, ['favorites', 'watchlist', 'stats', 'forum'])
    assert.equal(settings.defaultTab, 'friends')
  })

  it('shows connected accounts unless turned off', () => {
    assert.equal(normalizeProfileSettings({}).showConnections, true)
    assert.equal(normalizeProfileSettings({ showConnections: 'no' }).showConnections, true)
    assert.equal(normalizeProfileSettings({ showConnections: false }).showConnections, false)
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
  it('keeps trimmed unique genre strings only', () => {
    assert.deepEqual(normalizePreferences({ favoriteGenres: [' Action ', 'Action', 3, ''] }), {
      favoriteGenres: ['Action'],
    })
  })

  it('drops typed-in favorite studios (studios are favorited as content)', () => {
    assert.deepEqual(
      normalizePreferences({ favoriteGenres: [], favoriteStudios: ['Studio Trigger'] }),
      { favoriteGenres: [] },
    )
  })
})

describe('custom accent colors', () => {
  it('keeps presets and #rrggbb colors, and falls back to coral otherwise', () => {
    assert.equal(normalizeProfileSettings({ accent: 'sky' }).accent, 'sky')
    assert.equal(normalizeProfileSettings({ accent: ' #3A7BFF ' }).accent, '#3a7bff')
    assert.equal(normalizeProfileSettings({ accent: '#fff' }).accent, 'coral')
    assert.equal(normalizeProfileSettings({ accent: 'url(evil)' }).accent, 'coral')
  })

  it('shows the Friends tab on profiles saved before it existed', () => {
    const settings = normalizeProfileSettings({
      tabOrder: ['favorites', 'watchlist', 'stats', 'forum'],
      hiddenTabs: ['stats'],
    })
    assert.equal(settings.tabOrder.at(-1), 'friends')
    assert.ok(!settings.hiddenTabs.includes('friends'))
  })
})
