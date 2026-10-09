/**
 * Readable URL segments ("attack-on-titan") for catalog and forum pages.
 *
 * Layer: utils (pure). Detail URLs are `/<kind>/<id>/<slug>`; the id finds the page, so
 * the slug is decoration and a stale or missing one still works. Keep in step with the
 * frontend copy in `src/utils/slug.ts` (the canonical link must match).
 */

import { canonicalCharacterName, displayPersonName } from './entities.js'

/** Longest slug, cut on a word boundary. */
export const SLUG_MAX = 80

/**
 * Lowercase ASCII words joined by dashes; accents dropped, anything else removed.
 * Names with no Latin letters or digits give an empty slug.
 * @param {unknown} value
 * @returns {string}
 */
export function slugify(value) {
  const slug = String(value || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (slug.length <= SLUG_MAX) return slug
  const cut = slug.slice(0, SLUG_MAX)
  const dash = cut.lastIndexOf('-')
  return (dash > SLUG_MAX / 2 ? cut.slice(0, dash) : cut).replace(/-+$/, '')
}

/** Route prefix per content kind (specials open on the movie page). */
export const DETAIL_PREFIX = {
  movie: '/movie',
  special: '/movie',
  series: '/tv-show',
  character: '/character',
  voice: '/voice-actor',
  studio: '/studio',
  franchise: '/franchise',
}

/**
 * Canonical in-site path of a catalog page or forum post.
 * @param {string} prefix - e.g. `/movie`, `/forum/post`.
 * @param {string} id
 * @param {unknown} name - Display name the slug is made from.
 * @returns {string}
 */
export function detailPath(prefix, id, name) {
  const slug = slugify(name)
  return `${prefix}/${id}${slug ? `/${slug}` : ''}`
}

/**
 * Name a catalog page shows (and its slug is made from): characters and voice actors
 * are stored "Last, First" and shown "First Last", as on the frontend.
 * @param {string} kind - Content kind.
 * @param {unknown} name - Stored name.
 * @returns {string}
 */
export function contentDisplayName(kind, name) {
  if (kind === 'character') return canonicalCharacterName(name) || String(name || '').trim()
  if (kind === 'voice') return displayPersonName(name)
  return String(name || '').trim()
}

/**
 * Canonical path of a catalog row.
 * @param {{ kind: string, id: string, name: unknown }} row
 * @returns {string}
 */
export function contentPagePath({ kind, id, name }) {
  return detailPath(DETAIL_PREFIX[kind], id, contentDisplayName(kind, name))
}
