/**
 * forum.ts — display helpers for forum posts and tags.
 */

import type { ToastInterface } from 'vue-toastification'
import type { PostKind, PostTag, TagKind } from '@/types/forum'
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

export const POST_KIND_LABELS: Record<PostKind, string> = {
  discussion: 'Discussion',
  review: 'Review',
  guide: 'Guide',
  article: 'Article',
}

/** Post kinds in display order. */
export const POST_KINDS = Object.keys(POST_KIND_LABELS) as PostKind[]

/** Kinds a review can score. */
export const REVIEWABLE_KINDS: TagKind[] = ['movie', 'series', 'special']

/** Tag hierarchy level: franchise (0), then movies/series/specials (1), then characters (2). */
export function tagLevel(kind: TagKind) {
  if (kind === 'franchise') return 0
  if (kind === 'character') return 2
  return 1
}

/** Tags in hierarchy order; within a level by name, a series before its episodes. */
export function sortTags<T extends Pick<PostTag, 'kind' | 'name' | 'season' | 'episode'>>(
  tags: T[],
) {
  return [...tags].sort(
    (a, b) =>
      tagLevel(a.kind) - tagLevel(b.kind) ||
      a.name.localeCompare(b.name) ||
      (a.season ?? -1) - (b.season ?? -1) ||
      (a.episode ?? -1) - (b.episode ?? -1),
  )
}

/** Tags grouped by hierarchy level (empty levels dropped), for `franchise › title › character`. */
export function tagLevels<T extends Pick<PostTag, 'kind' | 'name' | 'season' | 'episode'>>(
  tags: T[],
) {
  const levels: T[][] = [[], [], []]
  for (const tag of sortTags(tags)) levels[tagLevel(tag.kind)]?.push(tag)
  return levels.filter((level) => level.length)
}

/**
 * The tag whose picture represents a post: the top tag when it has one, else the
 * highest tag in the hierarchy with a picture (title, then character). Franchises
 * never supply the picture, even as the top tag.
 */
export function coverTag<
  T extends Pick<PostTag, 'kind' | 'name' | 'season' | 'episode' | 'imagePath' | 'top'>,
>(tags: T[]) {
  const pictured = tags.filter((tag) => tag.kind !== 'franchise' && tag.imagePath)
  return pictured.find((tag) => tag.top) || sortTags(pictured)[0] || null
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
