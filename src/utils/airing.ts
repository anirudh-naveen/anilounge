/**
 * airing.ts — currently-airing / upcoming tags and next-episode countdown.
 *
 * MAL `currently_airing` is the source of truth for the airing tag. Upcoming
 * uses `not_yet_aired` or a future `releaseDate` for movies, TV, and specials.
 * The airing timer prefers TMDB `nextEpisodeAirDate`, then MAL's weekly JST slot.
 */

export interface AiringFields {
  contentType?: string
  malStatus?: string
  releaseDate?: string | Date | null
  broadcastDay?: string
  broadcastTime?: string
  nextEpisodeAirDate?: string | Date | null
  nextEpisodeNumber?: number | null
  nextEpisodeSeason?: number | null
}

export type UpcomingFields = Pick<AiringFields, 'contentType' | 'malStatus' | 'releaseDate'>

export interface NextAirInfo {
  at: Date
  airingNow: boolean
  episodeNumber?: number
  seasonNumber?: number
}

const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
}

const JST_OFFSET_MS = 9 * 60 * 60 * 1000

const MAL_STATUS_LABELS: Record<string, string> = {
  currently_airing: 'Currently Airing',
  finished_airing: 'Finished Airing',
  not_yet_aired: 'Not Yet Aired',
}

function parseTimeJst(time?: string | null): { hours: number; minutes: number } {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time || '')
  if (!match) return { hours: 0, minutes: 0 }
  return { hours: Number(match[1]), minutes: Number(match[2]) }
}

function jstWallClockToUtc(
  year: number,
  month: number,
  date: number,
  hours: number,
  minutes: number,
): Date {
  return new Date(Date.UTC(year, month, date, hours, minutes, 0) - JST_OFFSET_MS)
}

function getJstParts(date: Date) {
  const shifted = new Date(date.getTime() + JST_OFFSET_MS)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    date: shifted.getUTCDate(),
    hours: shifted.getUTCHours(),
    minutes: shifted.getUTCMinutes(),
    day: shifted.getUTCDay(),
  }
}

function isUtcMidnight(date: Date): boolean {
  return (
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0
  )
}

/**
 * Human label for MAL airing status (`currently_airing` → `Currently Airing`).
 * @param status - Raw MAL status string.
 * @returns Display label, or the original string when unknown.
 */
export const formatAiringStatus = (status?: string | null) => {
  if (!status) return ''
  return MAL_STATUS_LABELS[status] || status
}

/**
 * Whether a catalog title should show the currently-airing tag.
 * TV with `malStatus === currently_airing`, or TV with a future next air and no finished/upcoming MAL status.
 * @param content - Catalog fields used for airing.
 * @param from - Clock used for "future next episode" fallback (defaults to now).
 */
export const isCurrentlyAiring = (content: AiringFields | null | undefined, from = new Date()) => {
  if (!content || content.contentType !== 'tv') return false
  if (content.malStatus === 'currently_airing') return true
  if (content.malStatus === 'finished_airing' || content.malStatus === 'not_yet_aired') return false
  const next = getNextAirInfo(content, from)
  return next != null && (next.airingNow || next.at.getTime() > from.getTime())
}

/**
 * Premiere/release instant used for the upcoming countdown.
 * @param content - Catalog fields used for upcoming.
 */
export const getUpcomingReleaseAt = (content: UpcomingFields | null | undefined): Date | null => {
  if (!content?.releaseDate) return null
  const premiere = new Date(content.releaseDate)
  return Number.isNaN(premiere.getTime()) ? null : premiere
}

/**
 * Whether a title should show the upcoming tag.
 * Movies, TV, and specials with MAL `not_yet_aired`, or a future premiere/release
 * date and no finished/airing MAL status. Currently airing TV is never upcoming.
 * Date-only premieres stay upcoming through the end of that UTC day.
 * @param content - Catalog fields used for upcoming.
 * @param from - Clock used for "future premiere" fallback (defaults to now).
 */
export const isUpcoming = (content: UpcomingFields | null | undefined, from = new Date()) => {
  if (!content) return false
  const type = content.contentType
  if (type !== 'tv' && type !== 'movie' && type !== 'special') return false
  if (content.malStatus === 'currently_airing' || content.malStatus === 'finished_airing') {
    return false
  }
  if (content.malStatus === 'not_yet_aired') return true
  const premiere = getUpcomingReleaseAt(content)
  if (!premiere) return false
  const until = isUtcMidnight(premiere)
    ? premiere.getTime() + 24 * 60 * 60 * 1000 - 1
    : premiere.getTime()
  return until > from.getTime()
}

/**
 * Next occurrence of a MAL weekly JST air slot.
 * @param broadcastDay - `sunday` … `saturday`.
 * @param broadcastTime - Optional `HH:MM` in JST (defaults to 00:00).
 * @param from - Instant to search forward from.
 * @returns Next air Date in UTC, or null when the day is missing/`other`.
 */
export const nextWeeklyAirDate = (
  broadcastDay?: string | null,
  broadcastTime?: string | null,
  from = new Date(),
): Date | null => {
  if (!broadcastDay) return null
  const targetDay = WEEKDAY_INDEX[broadcastDay.toLowerCase()]
  if (targetDay == null) return null

  const { hours, minutes } = parseTimeJst(broadcastTime)
  const jst = getJstParts(from)
  let daysAhead = (targetDay - jst.day + 7) % 7
  let candidate = jstWallClockToUtc(jst.year, jst.month, jst.date + daysAhead, hours, minutes)
  if (candidate.getTime() <= from.getTime()) {
    daysAhead += 7
    candidate = jstWallClockToUtc(jst.year, jst.month, jst.date + daysAhead, hours, minutes)
  }
  return candidate
}

function resolveTmdbNextAir(content: AiringFields, from: Date): Date | null {
  if (!content.nextEpisodeAirDate) return null
  const raw = new Date(content.nextEpisodeAirDate)
  if (Number.isNaN(raw.getTime())) return null

  if (isUtcMidnight(raw)) {
    const { hours, minutes } = parseTimeJst(content.broadcastTime)
    const start = jstWallClockToUtc(
      raw.getUTCFullYear(),
      raw.getUTCMonth(),
      raw.getUTCDate(),
      hours,
      minutes,
    )
    const endOfDay = jstWallClockToUtc(
      raw.getUTCFullYear(),
      raw.getUTCMonth(),
      raw.getUTCDate(),
      23,
      59,
    )
    if (from.getTime() < start.getTime()) return start
    if (from.getTime() <= endOfDay.getTime()) return from
    return null
  }

  return raw.getTime() > from.getTime() ? raw : null
}

/**
 * Next episode air instant: TMDB date (with MAL JST time when the date is date-only), else weekly MAL slot.
 * @param content - Catalog airing fields.
 * @param from - Instant to search forward from.
 */
export const getNextAirInfo = (
  content: AiringFields | null | undefined,
  from = new Date(),
): NextAirInfo | null => {
  if (!content) return null

  const tmdbAt = resolveTmdbNextAir(content, from)
  if (tmdbAt) {
    const airingNow = tmdbAt.getTime() <= from.getTime()
    return {
      at: tmdbAt,
      airingNow,
      episodeNumber: content.nextEpisodeNumber ?? undefined,
      seasonNumber: content.nextEpisodeSeason ?? undefined,
    }
  }

  const weeklyAt = nextWeeklyAirDate(content.broadcastDay, content.broadcastTime, from)
  if (!weeklyAt) return null
  return { at: weeklyAt, airingNow: false }
}

/**
 * Compact remaining-time label (`2d 5h 12m`, `5h 12m 03s`, or `Airing now`).
 * @param ms - Milliseconds remaining. Values <= 0 become `zeroLabel`.
 * @param zeroLabel - Copy when time is up (default `Airing now`).
 */
export const formatCountdown = (ms: number, zeroLabel = 'Airing now') => {
  if (!Number.isFinite(ms) || ms <= 0) return zeroLabel
  const totalSeconds = Math.floor(ms / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  if (hours > 0) {
    return `${hours}h ${minutes}m ${String(seconds).padStart(2, '0')}s`
  }
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`
}

/**
 * Detail/hover timer copy, e.g. `Episode 8 in 2d 5h 12m` or `Next episode in 2d 5h`.
 * @param content - Catalog airing fields.
 * @param from - Instant used for remaining time.
 */
export const getAiringTimerLabel = (
  content: AiringFields | null | undefined,
  from = new Date(),
) => {
  const next = getNextAirInfo(content, from)
  if (!next) return ''
  if (next.airingNow) return 'Airing now'
  const countdown = formatCountdown(next.at.getTime() - from.getTime())
  if (next.episodeNumber) return `Episode ${next.episodeNumber} in ${countdown}`
  return `Next episode in ${countdown}`
}

/**
 * Detail/hover countdown to premiere or theatrical release, e.g. `Premieres in 14d 5h`.
 * @param content - Catalog fields used for upcoming.
 * @param from - Instant used for remaining time.
 */
export const getUpcomingTimerLabel = (
  content: UpcomingFields | null | undefined,
  from = new Date(),
) => {
  if (!isUpcoming(content, from)) return ''
  const at = getUpcomingReleaseAt(content)
  if (!at) return ''
  const remaining = at.getTime() - from.getTime()
  const isTv = content?.contentType === 'tv'
  if (remaining <= 0) return isTv ? 'Premiering now' : 'Out now'
  const countdown = formatCountdown(remaining, isTv ? 'Premiering now' : 'Out now')
  return `${isTv ? 'Premieres' : 'Releases'} in ${countdown}`
}
