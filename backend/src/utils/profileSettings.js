/**
 * Profile customization and preference normalization.
 *
 * Layer: utils. Coerces client-supplied profile settings and genre/studio
 * preferences into the stored shape, dropping unknown keys and bad values.
 */

export const PROFILE_TABS = ['favorites', 'watchlist', 'stats']
export const PROFILE_ACCENTS = ['coral', 'teal', 'violet', 'gold', 'rose', 'sky']
export const PROFILE_HEADLINE_MAX = 80
export const PROFILE_BIO_MAX = 300
const PREFERENCE_LIST_MAX = 30

export const DEFAULT_PROFILE_SETTINGS = Object.freeze({
  isPublic: true,
  accent: 'coral',
  headline: '',
  defaultTab: 'favorites',
  tabOrder: [...PROFILE_TABS],
  hiddenTabs: [],
})

/**
 * Merge stored or submitted settings over the defaults.
 * Unknown tabs are dropped, missing tabs are appended to `tabOrder`, and at
 * least one tab always stays visible. `defaultTab` falls back to the first visible tab.
 *
 * @param {unknown} input - Raw settings object (DB JSON or request body).
 * @param {object} [base=DEFAULT_PROFILE_SETTINGS] - Values kept when `input` omits a key.
 * @returns {{ isPublic: boolean, accent: string, headline: string, defaultTab: string, tabOrder: string[], hiddenTabs: string[] }}
 */
export function normalizeProfileSettings(input, base = DEFAULT_PROFILE_SETTINGS) {
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const pick = (key) => (raw[key] !== undefined ? raw[key] : base[key])

  const isPublic = typeof pick('isPublic') === 'boolean' ? pick('isPublic') : true
  const accent = PROFILE_ACCENTS.includes(pick('accent')) ? pick('accent') : 'coral'
  const headline =
    typeof pick('headline') === 'string'
      ? pick('headline').trim().slice(0, PROFILE_HEADLINE_MAX)
      : ''

  const orderInput = Array.isArray(pick('tabOrder')) ? pick('tabOrder') : []
  const tabOrder = [...new Set(orderInput.filter((tab) => PROFILE_TABS.includes(tab)))]
  for (const tab of PROFILE_TABS) if (!tabOrder.includes(tab)) tabOrder.push(tab)

  const hiddenInput = Array.isArray(pick('hiddenTabs')) ? pick('hiddenTabs') : []
  let hiddenTabs = [...new Set(hiddenInput.filter((tab) => PROFILE_TABS.includes(tab)))]
  if (hiddenTabs.length >= PROFILE_TABS.length) hiddenTabs = hiddenTabs.slice(0, -1)

  const visible = tabOrder.filter((tab) => !hiddenTabs.includes(tab))
  const defaultTab = visible.includes(pick('defaultTab')) ? pick('defaultTab') : visible[0]

  return { isPublic, accent, headline, defaultTab, tabOrder, hiddenTabs }
}

/**
 * Coerce favorite genre/studio lists to trimmed, de-duplicated strings.
 *
 * @param {unknown} input - Raw preferences object.
 * @returns {{ favoriteGenres: string[], favoriteStudios: string[] }}
 */
export function normalizePreferences(input) {
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const clean = (list) =>
    [
      ...new Set(
        (Array.isArray(list) ? list : [])
          .filter((value) => typeof value === 'string')
          .map((value) => value.trim().slice(0, 60))
          .filter(Boolean),
      ),
    ].slice(0, PREFERENCE_LIST_MAX)
  return {
    favoriteGenres: clean(raw.favoriteGenres),
    favoriteStudios: clean(raw.favoriteStudios),
  }
}
