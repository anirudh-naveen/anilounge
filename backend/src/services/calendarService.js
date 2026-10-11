/**
 * "Add to calendar" for airing shows: an iCalendar (.ics) file with the next episode at
 * its known air time and the rest of the season estimated weekly after it.
 *
 * Layer: service. Pure text building plus one catalog read; Apple Calendar, Google
 * Calendar, and Outlook all import the result.
 */

import { query } from '../../config/postgres.js'
import { isUuid } from '../db/ids.js'
import { HttpError } from '../utils/httpError.js'
import { contentPagePath } from '../utils/slug.js'

const SITE = 'https://www.anilounge.net'
const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const EPISODE_MINUTES = 30
/** Most episodes put in one file when the season length is unknown or long. */
export const MAX_EPISODES = 26
const UNKNOWN_LENGTH_EPISODES = 12

/** iCalendar UTC timestamp, e.g. 20261010T150000Z. */
export function icsTime(date) {
  return new Date(date)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')
}

/** Escape text for an iCalendar property value. */
export function icsText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/** Fold a content line to 75 octets, continuing lines with a space (RFC 5545). */
export function foldLine(line) {
  const bytes = Buffer.from(line, 'utf8')
  if (bytes.length <= 75) return line
  const parts = []
  let start = 0
  let limit = 75
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length)
    // Don't split a multi-byte character.
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end -= 1
    parts.push(bytes.subarray(start, end).toString('utf8'))
    start = end
    limit = 74
  }
  return parts.join('\r\n ')
}

/**
 * Episode events for a show, from the next episode to the season's end.
 * @param {{ id: string, name: string, nextEpisodeAt: Date | string, nextEpisodeNumber: number | null, episodeCount: number | null, path: string }} show
 * @param {Date} [now] - DTSTAMP.
 * @returns {string} The .ics file.
 */
export function buildEpisodeCalendar(show, now = new Date()) {
  const first = show.nextEpisodeNumber || 1
  const remaining = show.episodeCount
    ? Math.max(1, show.episodeCount - first + 1)
    : UNKNOWN_LENGTH_EPISODES
  const count = Math.min(remaining, MAX_EPISODES)
  const start = new Date(show.nextEpisodeAt).getTime()
  const url = `${SITE}${show.path}`
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AniLounge//Episodes//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsText(show.name)}`,
  ]
  for (let index = 0; index < count; index += 1) {
    const episode = first + index
    const at = start + index * WEEK_MS
    const note =
      index === 0
        ? `Episode ${episode} of ${show.name}.`
        : `Episode ${episode} of ${show.name}. Estimated: one week after the previous episode.`
    lines.push(
      'BEGIN:VEVENT',
      `UID:${show.id}-ep${episode}@anilounge.net`,
      `DTSTAMP:${icsTime(now)}`,
      `DTSTART:${icsTime(at)}`,
      `DTEND:${icsTime(at + EPISODE_MINUTES * 60_000)}`,
      `SUMMARY:${icsText(`${show.name} – Episode ${episode}`)}`,
      `DESCRIPTION:${icsText(`${note}\n${url}`)}`,
      `URL:${url}`,
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.map(foldLine).join('\r\n') + '\r\n'
}

/**
 * The .ics for a series with a known upcoming episode.
 * @param {string} contentId
 * @returns {Promise<{ filename: string, body: string }>}
 * @throws {HttpError} 404 unknown series or no upcoming episode date.
 */
export async function episodeCalendarFor(contentId) {
  if (!isUuid(contentId)) throw new HttpError(404, 'Show not found.')
  const { rows } = await query(
    `SELECT c.id, c.name, s.next_episode_at, s.next_episode_number, s.episode_count
     FROM content c JOIN series s ON s.content_id = c.id
     WHERE c.id = $1`,
    [contentId],
  )
  const row = rows[0]
  if (!row) throw new HttpError(404, 'Show not found.')
  if (!row.next_episode_at || new Date(row.next_episode_at).getTime() < Date.now() - WEEK_MS) {
    throw new HttpError(404, "This show doesn't have an upcoming episode date yet.")
  }
  const body = buildEpisodeCalendar({
    id: String(row.id),
    name: row.name,
    nextEpisodeAt: row.next_episode_at,
    nextEpisodeNumber: row.next_episode_number,
    episodeCount: row.episode_count,
    path: contentPagePath({ kind: 'series', id: row.id, name: row.name }),
  })
  const slug = String(row.name)
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
  return { filename: `${slug || 'episodes'}.ics`, body }
}

export default { episodeCalendarFor }
