/**
 * forum.ts — display helpers for forum posts and tags.
 */

import type { ToastInterface } from 'vue-toastification'
import type { PostTag, TagKind } from '@/types/forum'
import type { LanguageWarning } from '@/types/social'

export const TITLE_MAX = 150
export const BODY_MAX = 10000
export const COMMENT_MAX = 4000
export const TAGS_MAX = 5

export const KIND_LABELS: Record<TagKind, string> = {
  movie: 'Movie',
  series: 'Series',
  special: 'Special',
  franchise: 'Franchise',
  character: 'Character',
}

/** `S1E5` style episode label, or '' when the tag isn't an episode. */
export function episodeLabel(tag: Pick<PostTag, 'season' | 'episode'>) {
  if (tag.season === null || tag.episode === null) return ''
  return `S${tag.season}E${tag.episode}`
}

/** Chip text: `Frieren · S1E5` or `Frieren`. */
export function tagLabel(tag: Pick<PostTag, 'name' | 'season' | 'episode'>) {
  const episode = episodeLabel(tag)
  return episode ? `${tag.name} · ${episode}` : tag.name
}

/** Route to a tag's page; franchises (no page of their own) open the forum filtered by them. */
export function tagRoute(tag: Pick<PostTag, 'contentId' | 'kind'>) {
  switch (tag.kind) {
    case 'series':
      return { name: 'TVShowDetails', params: { id: tag.contentId } }
    case 'character':
      return { name: 'CharacterDetails', params: { id: tag.contentId } }
    case 'franchise':
      return { name: 'forum', query: { tag: tag.contentId } }
    default:
      return { name: 'MovieDetails', params: { id: tag.contentId } }
  }
}

/** Route to the forum filtered by a tag (and optionally one episode). */
export function forumTagRoute(tag: Pick<PostTag, 'contentId' | 'season' | 'episode'>) {
  const query: Record<string, string> = { tag: tag.contentId }
  if (tag.season !== null && tag.episode !== null) {
    query.season = String(tag.season)
    query.episode = String(tag.episode)
  }
  return { name: 'forum', query }
}

export const postRoute = (postId: string) => ({ name: 'forumPost', params: { id: postId } })

/** `8.5/10`. */
export function scoreLabel(score: number | null) {
  return score === null ? '' : `${Number.isInteger(score) ? score : score.toFixed(1)}/10`
}

/** Show the language warning a write returned, if any. */
export function showLanguageWarning(
  toast: ToastInterface,
  warning: LanguageWarning | null | undefined,
) {
  if (warning) toast.warning(warning.message, { timeout: 12000 })
}
