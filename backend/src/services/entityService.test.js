import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { jikanGet, jikanStatus, mergeAppearance, personIdsConflict } from './entityService.js'
import { characterSourceIdsConflict } from './characterMerge.js'
import { externalIdsConflict } from '../utils/titles.js'
import { pickPrimaryCharacter } from '../utils/entities.js'

describe('voice credits on a character appearance', () => {
  const character = (voiceActors) => ({
    entityType: 'character',
    appearances: [{ content: 'w1', role: 'Main', voiceActors }],
  })

  it('labels an unlabeled TMDB credit instead of adding the same actor again', () => {
    const doc = character([{ name: 'Bryn Apprill', language: 'Unknown' }])
    assert.equal(
      mergeAppearance(doc, { content: 'w1', voiceActors: [{ name: 'Bryn Apprill', language: 'English' }] }),
      true,
    )
    assert.deepEqual(doc.appearances[0].voiceActors, [{ name: 'Bryn Apprill', language: 'English' }])
  })

  it('skips unlabeled repeats but keeps other dub languages', () => {
    const doc = character([{ name: 'Yumi Uchiyama', language: 'Japanese' }])
    mergeAppearance(doc, { content: 'w1', voiceActors: [{ name: 'Yumi Uchiyama' }] })
    mergeAppearance(doc, {
      content: 'w1',
      voiceActors: [{ name: 'Madeleine Morris', language: 'English' }],
    })
    assert.deepEqual(
      doc.appearances[0].voiceActors.map((va) => `${va.name}:${va.language}`),
      ['Yumi Uchiyama:Japanese', 'Madeleine Morris:English'],
    )
  })
})

describe('cross-source identity', () => {
  it('treats different ids from the same source as different people', () => {
    assert.equal(personIdsConflict({ malId: 1 }, { malId: 2 }), true)
    assert.equal(personIdsConflict({ anilistId: 5 }, { anilistId: 6 }), true)
    assert.equal(personIdsConflict({ malId: 1 }, { anilistId: 6 }), false)
    assert.equal(personIdsConflict({ malId: 1, anilistId: 6 }, { malId: 1 }), false)
  })

  it('keeps same-name characters with different MAL or AniList ids apart', () => {
    assert.equal(characterSourceIdsConflict({ anilistId: 1 }, { anilistId: 2 }), true)
    assert.equal(characterSourceIdsConflict({ malId: 3 }, { anilistId: 2 }), false)
  })

  it('never merges titles with different AniList ids', () => {
    assert.equal(externalIdsConflict({ anilistId: 1 }, { anilistId: 2 }), true)
    assert.equal(externalIdsConflict({ anilistId: 1, malId: 5 }, { malId: 5 }), false)
  })

  it('keeps the MAL character, then the AniList one, when merging duplicates', () => {
    const portrait = 'https://cdn.myanimelist.net/images/characters/1.jpg'
    const primary = pickPrimaryCharacter([
      { _id: 'a', imagePath: portrait },
      { _id: 'b', imagePath: portrait, anilistId: 7 },
      { _id: 'c', imagePath: portrait, malId: 9 },
    ])
    assert.equal(primary._id, 'c')
    assert.equal(
      pickPrimaryCharacter([
        { _id: 'a', imagePath: portrait },
        { _id: 'b', imagePath: portrait, anilistId: 7 },
      ])._id,
      'b',
    )
  })
})

function fakeFetch(responses) {
  const calls = []
  const fetchImpl = async (url) => {
    calls.push(url)
    const next = responses.shift()
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      json: async () => next.body,
    }
  }
  return { fetchImpl, calls }
}

describe('jikanGet', () => {
  it('backs off and retries after a 429', async () => {
    const { fetchImpl, calls } = fakeFetch([
      { status: 429, body: null },
      { status: 200, body: { data: { mal_id: 1 } } },
    ])
    const body = await jikanGet('/anime/1/characters', { fetchImpl })
    assert.deepEqual(body, { data: { mal_id: 1 } })
    assert.equal(calls.length, 2)
  })

  it('does not retry a 404', async () => {
    const { fetchImpl, calls } = fakeFetch([{ status: 404, body: null }])
    assert.equal(await jikanGet('/characters/999999999', { fetchImpl }), null)
    assert.equal(calls.length, 1)
  })

  it('retries a 5xx once, then stops calling Jikan during an outage', async () => {
    const { fetchImpl, calls } = fakeFetch(
      Array.from({ length: 10 }, () => ({ status: 504, body: null })),
    )
    for (let i = 0; i < 5; i += 1) {
      assert.equal(await jikanGet(`/characters/${i}`, { fetchImpl }), null)
    }
    assert.equal(calls.length, 10)
    assert.equal(jikanStatus().available, false)
    assert.equal(await jikanGet('/characters/6', { fetchImpl }), null)
    assert.equal(calls.length, 10)
  })
})
