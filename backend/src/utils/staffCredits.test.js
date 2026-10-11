import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  anilistEpisodeCredits,
  noteEpisodes,
  parseAnilistRole,
  tmdbEpisodeCredits,
  tmdbKeyStaff,
} from './staffCredits.js'

describe('noteEpisodes', () => {
  it('reads single episodes, lists, and ranges', () => {
    assert.deepEqual(noteEpisodes('ep 3'), [3])
    assert.deepEqual(noteEpisodes('eps 1, 5-7'), [1, 5, 6, 7])
    assert.deepEqual(noteEpisodes('eps 1-3, ED'), [1, 2, 3])
  })

  it('ignores opening and ending credits', () => {
    assert.deepEqual(noteEpisodes('OP1'), [])
    assert.deepEqual(noteEpisodes('OP1, ED2'), [])
    assert.deepEqual(noteEpisodes('ED2, ep 4'), [4])
  })
})

describe('parseAnilistRole', () => {
  it('splits the role from its note', () => {
    assert.deepEqual(parseAnilistRole('Animation Director (eps 3, 7)'), {
      role: 'Animation Director',
      episodes: [3, 7],
      hasNote: true,
    })
    assert.deepEqual(parseAnilistRole('Director  '), {
      role: 'Director',
      episodes: [],
      hasNote: false,
    })
  })
})

describe('anilistEpisodeCredits', () => {
  it('keeps episode roles with episode notes, one credit per episode', () => {
    const credits = anilistEpisodeCredits([
      { role: 'Animation Director (eps 1, 3)', node: { id: 7, name: { full: 'A' } } },
      { role: 'Animation Director (ED2)', node: { id: 8, name: { full: 'B' } } },
      { role: 'Key Animation (ep 1)', node: { id: 9, name: { full: 'C' } } },
      { role: 'Script (ep 2)', node: { id: 10, name: { full: 'D' }, image: { large: 'd.jpg' } } },
      { role: 'Director', node: { id: 11, name: { full: 'E' } } },
    ])
    assert.deepEqual(
      credits.map(({ episode, role, person }) => [episode, role, person.name]),
      [
        [1, 'Animation Director', 'A'],
        [3, 'Animation Director', 'A'],
        [2, 'Script', 'D'],
      ],
    )
    assert.equal(credits[2].person.imagePath, 'd.jpg')
  })
})

describe('tmdbEpisodeCredits', () => {
  it('maps TMDB crew jobs onto episode roles', () => {
    const credits = tmdbEpisodeCredits([
      {
        number: 1,
        crew: [
          { id: 1, name: 'Dave Filoni', job: 'Director', profile_path: '/df.jpg' },
          { id: 2, name: 'Aaron Ehasz', job: 'Writer' },
          { id: 3, name: 'Someone', job: 'Casting' },
        ],
      },
    ])
    assert.deepEqual(
      credits.map(({ episode, role, person }) => [episode, role, person.tmdbId]),
      [
        [1, 'Episode Director', 1],
        [1, 'Script', 2],
      ],
    )
  })
})

describe('tmdbKeyStaff', () => {
  it('lists creators, then key crew, skipping one-off directors', () => {
    const staff = tmdbKeyStaff(
      { created_by: [{ id: 1, name: 'Michael Dante DiMartino' }] },
      {
        crew: [
          {
            id: 2,
            name: 'Jeremy Zuckerman',
            jobs: [{ job: 'Original Music Composer', episode_count: 61 }],
          },
          { id: 3, name: 'Guest Director', jobs: [{ job: 'Director', episode_count: 1 }] },
          { id: 4, name: 'Giancarlo Volpe', jobs: [{ job: 'Director', episode_count: 18 }] },
        ],
      },
    )
    assert.deepEqual(
      staff.map(({ name, role }) => [name, role]),
      [
        ['Michael Dante DiMartino', 'Creator'],
        ['Giancarlo Volpe', 'Director'],
        ['Jeremy Zuckerman', 'Original Music Composer'],
      ],
    )
  })
})
