/**
 * originCountries.js — ISO origin-country codes from TMDB and MAL payloads.
 *
 * Utils layer: collect `origin_country` / `production_countries` from TMDB,
 * and default MAL-only titles to Japan.
 */

/**
 * Collect unique ISO 3166-1 alpha-2 origin codes from a TMDB movie/TV payload.
 * @param {object} [tmdbData]
 * @returns {string[]}
 */
export function extractOriginCountries(tmdbData) {
  const codes = new Set()
  if (!tmdbData || typeof tmdbData !== 'object') return []

  const push = (value) => {
    if (typeof value === 'string' && value.trim()) {
      codes.add(value.trim().toUpperCase())
    }
  }

  for (const code of tmdbData.origin_country || []) {
    push(code)
  }
  for (const country of tmdbData.production_countries || []) {
    push(country?.iso_3166_1 || country)
  }

  return [...codes]
}

/** MAL is a Japanese anime catalog; MAL-only rows default to Japan. */
export const MAL_ORIGIN_COUNTRIES = ['JP']
