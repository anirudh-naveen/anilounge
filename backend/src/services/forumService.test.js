import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  BODY_MAX,
  excerptOf,
  homeWindowEnd,
  reviewSubject,
  searchWords,
  TAGS_MAX,
  TITLE_MAX,
  validatePostInput,
  validateTags,
} from './forumService.js'

describe('excerptOf', () => {
  it('keeps short text and flattens whitespace', () => {
    assert.equal(excerptOf('one\n\ntwo   three'), 'one two three')
  })

  it('cuts long text on a word boundary', () => {
    const text = `${'word '.repeat(100)}end`
    const cut = excerptOf(text, 50)
    assert.ok(cut.length <= 51)
    assert.ok(cut.endsWith('word…'))
  })
})

describe('homeWindowEnd', () => {
  it('rounds up to the next 3-hour boundary (UTC)', () => {
    assert.equal(
      homeWindowEnd(Date.parse('2026-10-06T10:15:00Z')).toISOString(),
      '2026-10-06T12:00:00.000Z',
    )
    assert.equal(
      homeWindowEnd(Date.parse('2026-10-06T12:00:00Z')).toISOString(),
      '2026-10-06T15:00:00.000Z',
    )
  })
})

describe('validatePostInput', () => {
  const discussion = { kind: 'discussion', title: 'Hi', body: 'There' }

  it('accepts an untagged discussion', async () => {
    const out = await validatePostInput(discussion)
    assert.deepEqual(out, { kind: 'discussion', title: 'Hi', body: 'There', tags: [] })
  })

  it('rejects bad kinds, empty or long text', async () => {
    await assert.rejects(validatePostInput({ ...discussion, kind: 'poll' }), { status: 400 })
    await assert.rejects(validatePostInput({ ...discussion, title: '  ' }), { status: 400 })
    await assert.rejects(validatePostInput({ ...discussion, body: '' }), { status: 400 })
    await assert.rejects(validatePostInput({ ...discussion, title: 'x'.repeat(TITLE_MAX + 1) }), {
      status: 400,
    })
    await assert.rejects(validatePostInput({ ...discussion, body: 'x'.repeat(BODY_MAX + 1) }), {
      status: 400,
    })
  })

  it('needs a 1–10 score on reviews, rounded to a tenth', async () => {
    await assert.rejects(validatePostInput({ ...discussion, kind: 'review' }), { status: 400 })
    await assert.rejects(validatePostInput({ ...discussion, kind: 'review', score: 11 }), {
      status: 400,
    })
    // Valid score but no title tag.
    await assert.rejects(validatePostInput({ ...discussion, kind: 'review', score: 8.25 }), {
      message: /Tag the movie, series, or special/,
    })
  })

  it('only checks the fields an edit sends', async () => {
    const out = await validatePostInput({ title: 'New' }, { partial: true, kind: 'discussion' })
    assert.deepEqual(out, { kind: 'discussion', title: 'New' })
  })
})

describe('validateTags', () => {
  const id = '11111111-1111-4111-8111-111111111111'

  it('rejects bad shapes before touching the database', async () => {
    await assert.rejects(validateTags('x'), { status: 400 })
    await assert.rejects(validateTags([{ contentId: 'nope' }]), { status: 400 })
    await assert.rejects(validateTags([{ contentId: id, season: 1 }]), {
      message: /episode number/,
    })
    await assert.rejects(validateTags([{ contentId: id, season: -1, episode: 2 }]), {
      message: /season number/,
    })
    const many = Array.from({ length: TAGS_MAX + 1 }, (_, i) => ({
      contentId: id.replace(/1$/, String(i)),
    }))
    await assert.rejects(validateTags(many), { message: /up to/ })
  })

  it('treats missing tags as none', async () => {
    assert.deepEqual(await validateTags(undefined), [])
    assert.deepEqual(await validateTags([]), [])
  })
})

describe('reviewSubject', () => {
  it('is the first movie, series, or special tag', () => {
    const tags = [
      { contentId: 'f', kind: 'franchise' },
      { contentId: 'c', kind: 'character' },
      { contentId: 's', kind: 'series' },
      { contentId: 'm', kind: 'movie' },
    ]
    assert.equal(reviewSubject(tags), 's')
    assert.equal(reviewSubject([{ contentId: 'c', kind: 'character' }]), null)
  })
})

describe('searchWords', () => {
  it('splits, lowercases, dedupes, and drops one-letter words', () => {
    assert.deepEqual(searchWords('  Frieren  a EPISODE frieren 5 '), ['frieren', 'episode'])
    assert.deepEqual(searchWords(undefined), [])
  })

  it('caps the number of words', () => {
    assert.equal(searchWords('aa bb cc dd ee ff gg hh').length, 6)
  })
})
