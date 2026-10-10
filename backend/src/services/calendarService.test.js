import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildEpisodeCalendar,
  foldLine,
  icsText,
  icsTime,
  MAX_EPISODES,
} from './calendarService.js'

const show = {
  id: 'c1',
  name: 'Frieren: Beyond, Journey',
  nextEpisodeAt: '2026-10-11T15:00:00.000Z',
  nextEpisodeNumber: 11,
  episodeCount: 12,
  path: '/tv-show/frieren/c1',
}

describe('calendar helpers', () => {
  it('formats times and escapes text', () => {
    assert.equal(icsTime('2026-10-11T15:00:00.000Z'), '20261011T150000Z')
    assert.equal(icsText('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne')
  })

  it('folds long lines at 75 octets without splitting characters', () => {
    const line = `SUMMARY:${'é'.repeat(60)}`
    const folded = foldLine(line)
    for (const part of folded.split('\r\n')) assert.ok(Buffer.byteLength(part) <= 75)
    assert.equal(folded.replace(/\r\n /g, ''), line)
  })
})

describe('buildEpisodeCalendar', () => {
  it('has the next episode at its air time and the rest weekly', () => {
    const ics = buildEpisodeCalendar(show, new Date('2026-10-10T00:00:00Z'))
    const events = ics.split('BEGIN:VEVENT').slice(1)
    assert.equal(events.length, 2)
    assert.match(events[0], /DTSTART:20261011T150000Z/)
    assert.match(events[0], /DTEND:20261011T153000Z/)
    assert.match(events[0], /SUMMARY:Frieren: Beyond\\, Journey – Episode 11/)
    assert.match(events[1], /DTSTART:20261018T150000Z/)
    assert.match(events[1], /UID:c1-ep12@anilounge.net/)
    assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'))
    assert.ok(ics.endsWith('END:VCALENDAR\r\n'))
  })

  it('caps long or unknown seasons', () => {
    const long = buildEpisodeCalendar({ ...show, nextEpisodeNumber: 1, episodeCount: 100 })
    assert.equal(long.split('BEGIN:VEVENT').length - 1, MAX_EPISODES)
    const unknown = buildEpisodeCalendar({ ...show, episodeCount: null })
    assert.equal(unknown.split('BEGIN:VEVENT').length - 1, 12)
  })
})
