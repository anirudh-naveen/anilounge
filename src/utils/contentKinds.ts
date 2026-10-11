/**
 * contentKinds.ts — what a catalog content type is (utils).
 *
 * `tv` is a whole series and `season` one season of it; both have episodes.
 */

/**
 * Whether a content type has episodes: a series or one of its seasons.
 * @param contentType - The title's `contentType`.
 */
export const isEpisodic = (contentType?: string | null) =>
  contentType === 'tv' || contentType === 'season'
