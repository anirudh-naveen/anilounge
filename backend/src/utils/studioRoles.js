/**
 * Telling a title's animation studios apart from its production companies.
 *
 * Utils layer: pure. `studio_credits` holds both kinds without a role, so the
 * animation studios come from the source snapshots in `content_source_data`.
 */

/**
 * A title's animation studios, main first: AniList's (its snapshot keeps animation
 * studios only), else MAL's ("studios", with producers kept apart). Empty when
 * neither source has the title, so its credits can't be told apart.
 * @param {Array<{ source: string, studios: unknown }>} rows - Snapshot studios by source
 * @returns {string[]}
 */
export function animationStudioNames(rows) {
  for (const source of ['anilist', 'mal']) {
    const list = rows.find((row) => row.source === source)?.studios
    const names = (Array.isArray(list) ? list : [])
      .map((studio) => (typeof studio === 'string' ? studio : studio?.name))
      .filter((name) => typeof name === 'string' && name.trim())
      .map((name) => name.trim())
    if (names.length) return [...new Set(names)]
  }
  return []
}
