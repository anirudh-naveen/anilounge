/**
 * homeFeed.ts — copy for the homepage status feed, release sidebar, and
 * character of the day.
 */

import type { ActivityEntry, ReleaseUpdate } from '@/types/home'
import { getNextAirInfo, getUpcomingReleaseAt } from '@/utils/airing'

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
/** Past this, relative times switch to a calendar date. */
const RELATIVE_LIMIT_MS = 14 * DAY_MS

const shortDate = (at: Date, now: Date) =>
  at.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(at.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  })

/**
 * Coarse distance for feed timestamps: `5m`, `3h`, `2d`.
 * @param ms - Absolute distance in milliseconds.
 */
const coarseDistance = (ms: number) => {
  if (ms < HOUR_MS) return `${Math.max(1, Math.round(ms / MINUTE_MS))}m`
  if (ms < DAY_MS) return `${Math.round(ms / HOUR_MS)}h`
  return `${Math.round(ms / DAY_MS)}d`
}

/**
 * `just now`, `3h ago`, `2d ago`, or a date once older than two weeks.
 * @param at - Event instant.
 * @param now - Reference clock.
 */
export function timeAgo(at: string | Date, now = new Date()) {
  const date = new Date(at)
  const ms = now.getTime() - date.getTime()
  if (Number.isNaN(ms)) return ''
  if (ms < MINUTE_MS) return 'just now'
  if (ms >= RELATIVE_LIMIT_MS) return shortDate(date, now)
  return `${coarseDistance(ms)} ago`
}

/**
 * `in 3h`, `in 2d`, or a date once further than two weeks out.
 * @param at - Future instant.
 * @param now - Reference clock.
 */
export function timeUntil(at: Date, now = new Date()) {
  const ms = at.getTime() - now.getTime()
  if (ms >= RELATIVE_LIMIT_MS) return shortDate(at, now)
  return `in ${coarseDistance(Math.max(ms, 0))}`
}

/**
 * What a watchlist change did, as the words between the user and the title.
 * Progress reads as the span watched since the user left off, e.g.
 * `watched episodes 5–8 of`; a single new episode reads `watched episode 8 of`.
 * @param entry - Feed entry.
 */
export function describeActivity(
  entry: Pick<ActivityEntry, 'action' | 'status' | 'currentEpisode' | 'previousEpisode'>,
) {
  switch (entry.status) {
    case 'watching': {
      const latest = entry.currentEpisode
      if (latest <= 0) return entry.action === 'added' ? 'started watching' : 'is watching'
      const first = (entry.previousEpisode || 0) + 1
      if (first >= latest) return `watched episode ${latest} of`
      return `watched episodes ${first}–${latest} of`
    }
    case 'completed':
      return 'completed'
    case 'dropped':
      return 'dropped'
    default:
      return 'planned to watch'
  }
}

/**
 * Newest-first merge of personal and friend activity for the "Everyone" tab.
 * @param personal - Viewer's own entries.
 * @param friends - Accepted friends' entries.
 * @param limit - Max entries.
 */
export function mergeActivity(personal: ActivityEntry[], friends: ActivityEntry[], limit = 12) {
  return [...personal, ...friends]
    .sort((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime())
    .slice(0, limit)
}

/**
 * Sidebar timing line for a release update, e.g. `Ep 12 · in 3h` or `Premieres Oct 1`.
 * @param update - Release update from `/home/updates`.
 * @param now - Reference clock.
 */
export function releaseLabel(update: ReleaseUpdate, now = new Date()) {
  const { content } = update
  if (update.kind === 'episode') {
    const episode = content.nextEpisodeNumber ? `Ep ${content.nextEpisodeNumber}` : 'New episode'
    const next = getNextAirInfo(content, now)
    if (next?.airingNow) return `${episode} · Airing now`
    if (next) return `${episode} · ${timeUntil(next.at, now)}`
    if (update.at && new Date(update.at).getTime() <= now.getTime()) return `${episode} · Out now`
    return 'New episodes weekly'
  }

  const isTv = content.contentType === 'tv'
  const at = getUpcomingReleaseAt(content)
  if (!at) return isTv ? 'Premiere date TBA' : 'Release date TBA'
  if (at.getTime() <= now.getTime()) return isTv ? 'Just premiered' : 'Out now'
  return `${isTv ? 'Premieres' : 'Releases'} ${timeUntil(at, now)}`
}

/** Leading `Height: 154 cm`-style stat lines common in MAL/AniList bios. */
const STAT_LINE = /^[\p{L}\s'()./-]{1,40}:\s*[^\n]{0,80}$/u

/**
 * Short prose teaser from a character bio: drops leading stat lines and
 * spoiler markers, then trims to a sentence boundary near `maxLength`.
 * @param about - Raw bio.
 * @param maxLength - Target length before trimming.
 */
export function characterBlurb(about?: string, maxLength = 280) {
  if (!about) return ''
  const lines = about
    .replace(/~!|!~/g, '')
    .split(/\n+/)
    .map((line) => line.trim())
  const firstProse = lines.findIndex((line) => line && !STAT_LINE.test(line))
  const prose = lines
    .slice(firstProse < 0 ? 0 : firstProse)
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (prose.length <= maxLength) return prose
  const cut = prose.slice(0, maxLength)
  const sentenceEnd = cut.lastIndexOf('. ')
  if (sentenceEnd > maxLength * 0.5) return cut.slice(0, sentenceEnd + 1)
  return `${cut.slice(0, cut.lastIndexOf(' ')).trimEnd()}…`
}
