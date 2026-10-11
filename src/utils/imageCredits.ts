/**
 * imageCredits.ts — which images need a source credit (utils).
 *
 * TVmaze's character images are CC BY-SA: pages showing one credit TVmaze.
 */

/** Whether an image comes from TVmaze. */
export const isTvmazeImage = (path?: string | null) => /(^|\.)tvmaze\.com\//i.test(path || '')
