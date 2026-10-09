/**
 * Which catalog pages search engines should index.
 *
 * Layer: utils. Almost no character, voice actor, or studio rows have a biography, so
 * thousands of their pages would be a name and little else, and a site full of thin
 * pages ranks worse as a whole. Those pages are left out of the sitemap
 * (services/sitemapService.js) and served with `noindex` (services/seoService.js);
 * people can still open them.
 *
 * Indexed: every title and franchise; characters with a biography or a main role;
 * voice actors with a biography or VOICE_MIN_CHARACTERS characters; studios with a
 * biography or STUDIO_MIN_WORKS titles.
 */

export const VOICE_MIN_CHARACTERS = 3
export const STUDIO_MIN_WORKS = 2

const HAS_ABOUT = "coalesce(btrim(c.about), '') <> ''"

/**
 * SQL boolean per content kind, for a `content c` row: whether its page is indexed.
 * @type {Record<string, string>}
 */
export const INDEXABLE_SQL = {
  movie: 'true',
  series: 'true',
  special: 'true',
  franchise: 'true',
  character: `(${HAS_ABOUT} OR EXISTS (
    SELECT 1 FROM appearances a WHERE a.character_id = c.id AND a.role = 'main'))`,
  voice: `(${HAS_ABOUT} OR (
    SELECT count(DISTINCT a.character_id) FROM voice_credits vc
    JOIN appearances a ON a.id = vc.appearance_id
    WHERE vc.voice_id = c.id) >= ${VOICE_MIN_CHARACTERS})`,
  studio: `(${HAS_ABOUT} OR (
    SELECT count(*) FROM studio_credits sc WHERE sc.studio_id = c.id) >= ${STUDIO_MIN_WORKS})`,
}

/**
 * SQL boolean for a mix of kinds (`c.kind` picks each row's rule).
 * @param {string[]} kinds
 * @returns {string}
 */
export function indexableSql(kinds) {
  const rules = kinds.map((kind) => {
    if (!INDEXABLE_SQL[kind]) throw new Error(`Unknown content kind: ${kind}`)
    return INDEXABLE_SQL[kind] === 'true'
      ? `c.kind = '${kind}'`
      : `(c.kind = '${kind}' AND ${INDEXABLE_SQL[kind]})`
  })
  return `(${rules.join(' OR ')})`
}
