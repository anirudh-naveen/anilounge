/**
 * slug.ts — readable URL segments ("attack-on-titan") for catalog and forum pages.
 *
 * Detail URLs are `/<kind>/<id>/<slug>`; the id finds the page, so a stale or missing
 * slug still works, and each page swaps in its own (useCanonicalSlug). Keep in step
 * with backend/src/utils/slug.js: the server writes the same canonical links.
 */

/** Longest slug, cut on a word boundary. */
export const SLUG_MAX = 80

/**
 * Lowercase ASCII words joined by dashes; accents dropped, anything else removed.
 * Names with no Latin letters or digits give an empty slug.
 */
export function slugify(value?: string | null) {
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

/**
 * Canonical in-site path: `/movie/<id>/<slug>`, or without the slug when the name has none.
 * @param prefix - e.g. `/movie`, `/forum/post`.
 */
export function detailPath(prefix: string, id: string, name?: string | null) {
  const slug = slugify(name)
  return `${prefix}/${id}${slug ? `/${slug}` : ''}`
}
