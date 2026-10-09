/**
 * pageMeta.ts — search-engine meta (title, description, schema.org data) for catalog
 * pages, passed to `usePageMeta`.
 *
 * Pure builders so title, character, voice actor, studio, and franchise pages describe
 * themselves the same way. Image paths are resolved by the caller (`getPosterUrl`).
 */

import type { PageMeta } from '@/composables/usePageMeta'
import type { UnifiedContent } from '@/types/content'
import { getDisplayTitle } from '@/utils/titles'

/** Absolute URL of an in-site path (structured data needs full URLs). */
export const absoluteUrl = (path: string, origin = window.location.origin) =>
  new URL(path, origin).href

/** Genre names, whichever shape the catalog sent. */
export const genreNames = (content: Pick<UnifiedContent, 'genres'>) =>
  (content.genres || [])
    .map((genre) => (typeof genre === 'string' ? genre : genre?.name || ''))
    .filter(Boolean)

const yearOf = (value?: string | Date) => {
  if (!value) return null
  const year = new Date(value).getFullYear()
  return Number.isFinite(year) ? year : null
}

/** Fewest AniLounge ratings before a title's schema.org data carries its average (stars). */
export const RATING_MIN_COUNT = 3

/**
 * schema.org AggregateRating from AniLounge's own ratings (1–10), or null with too few.
 * Only ratings made on the site count (Google doesn't allow scores copied from MAL or
 * TMDB). Same as `aggregateRating` in backend/src/services/seoService.js.
 */
export function aggregateRating(average?: number | null, count?: number | null) {
  const ratings = Number(count || 0)
  if (ratings < RATING_MIN_COUNT || average == null) return null
  return {
    '@type': 'AggregateRating',
    ratingValue: Math.round(Number(average) * 10) / 10,
    bestRating: 10,
    worstRating: 1,
    ratingCount: ratings,
  }
}

export interface Crumb {
  name: string
  path: string
}

/** schema.org BreadcrumbList (the path shown above a search result); Home first. */
export function breadcrumbList(items: Crumb[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  }
}

export const HOME_CRUMB: Crumb = { name: 'AniLounge', path: '/' }

const isoDate = (value?: string | Date) => {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10)
}

/**
 * Meta for a movie, series, or special page.
 * @param content - The title on screen.
 * @param options.path - Its in-site path (`/movie/<slug>/<id>`, `/tv-show/<slug>/<id>`).
 * @param options.image - Absolute poster URL, or null.
 * @param options.seasonLabel - Season being shown ("Season 2"), when not the whole show.
 */
export function titlePageMeta(
  content: UnifiedContent,
  { path, image, seasonLabel = '' }: { path: string; image: string | null; seasonLabel?: string },
): PageMeta {
  const name = getDisplayTitle(content)
  const series = content.contentType === 'tv'
  const year = yearOf(content.releaseDate)
  const noun = series ? 'anime series' : content.contentType === 'special' ? 'special' : 'movie'
  const heading = [name, seasonLabel].filter(Boolean).join(' ')
  const genres = genreNames(content)
  const rating = aggregateRating(content.userRatingAverage, content.userRatingCount)
  const summary =
    content.overview?.trim() ||
    `${name}${year ? ` (${year})` : ''}: an animated ${noun}${genres.length ? ` · ${genres.slice(0, 3).join(', ')}` : ''}.`
  return {
    title: year ? `${heading} (${year})` : heading,
    description: `${summary} Track it, rate it, and discuss it on AniLounge.`,
    path,
    image,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': series ? 'TVSeries' : 'Movie',
        name,
        ...(content.nativeTitle && content.nativeTitle !== name
          ? { alternateName: content.nativeTitle }
          : {}),
        url: absoluteUrl(path),
        ...(content.overview ? { description: content.overview } : {}),
        ...(image ? { image } : {}),
        ...(genres.length ? { genre: genres } : {}),
        ...(isoDate(content.releaseDate)
          ? { [series ? 'startDate' : 'datePublished']: isoDate(content.releaseDate) }
          : {}),
        ...(series && content.episodeCount ? { numberOfEpisodes: content.episodeCount } : {}),
        ...(content.studios?.length
          ? {
              productionCompany: content.studios.map((studio) => ({
                '@type': 'Organization',
                name: studio,
              })),
            }
          : {}),
        ...(rating ? { aggregateRating: rating } : {}),
      },
      breadcrumbList([
        HOME_CRUMB,
        series
          ? { name: 'Animated Series', path: '/tv' }
          : { name: 'Animated Movies', path: '/movies' },
        { name, path },
      ]),
    ],
  }
}

/** Which kind of catalog entity a page shows. */
export type EntityPageKind = 'character' | 'voice_actor' | 'studio' | 'franchise'

const ENTITY_TYPE: Record<EntityPageKind, string> = {
  character: 'Person',
  voice_actor: 'Person',
  studio: 'Organization',
  franchise: 'CreativeWorkSeries',
}

const ENTITY_FALLBACK: Record<EntityPageKind, (name: string, works: string[]) => string> = {
  character: (name, works) =>
    `${name}${works.length ? `, a character from ${works.slice(0, 3).join(', ')}` : ''}: profile, voice actors, and appearances.`,
  voice_actor: (name, works) =>
    `${name}, voice actor${works.length ? ` in ${works.slice(0, 3).join(', ')}` : ''}: roles and characters voiced.`,
  studio: (name, works) =>
    `${name}, animation studio${works.length ? ` behind ${works.slice(0, 3).join(', ')}` : ''}: every title they made.`,
  franchise: (name, works) =>
    `The ${name} franchise${works.length ? `: ${works.slice(0, 3).join(', ')}` : ''}. Every movie, series, and special in watch order.`,
}

/**
 * Meta for a character, voice actor, studio, or franchise page.
 * @param kind - Page kind.
 * @param entity.name - Display name.
 * @param entity.about - Biography or description, if any.
 * @param options.path - In-site path.
 * @param options.image - Absolute image URL, or null.
 * @param options.works - Titles it's known for, most notable first (for the fallback
 *   description).
 * @param options.parent - Breadcrumb between Home and this page (a character's title).
 */
export function entityPageMeta(
  kind: EntityPageKind,
  entity: { name: string; nativeName?: string; about?: string },
  {
    path,
    image,
    works = [],
    parent = null,
  }: { path: string; image: string | null; works?: string[]; parent?: Crumb | null },
): PageMeta {
  const about = entity.about?.trim() || ''
  // Fictional characters aren't people schema.org-wise, but Person is what search
  // engines expect for them; mark them with `additionalType`.
  const fictional = kind === 'character' ? { additionalType: 'FictionalCharacter' } : {}
  return {
    title: entity.name,
    description: about || ENTITY_FALLBACK[kind](entity.name, works),
    path,
    image,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': ENTITY_TYPE[kind],
        ...fictional,
        name: entity.name,
        ...(entity.nativeName && entity.nativeName !== entity.name
          ? { alternateName: entity.nativeName }
          : {}),
        url: absoluteUrl(path),
        ...(about ? { description: about } : {}),
        ...(image ? { image } : {}),
      },
      breadcrumbList([HOME_CRUMB, ...(parent ? [parent] : []), { name: entity.name, path }]),
    ],
  }
}
