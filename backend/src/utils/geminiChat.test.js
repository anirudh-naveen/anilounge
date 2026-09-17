import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildSystemInstruction,
  fallbackChatReply,
  getFunctionCalls,
  getResponseText,
  toGeminiHistory,
} from './geminiChat.js'

describe('toGeminiHistory', () => {
  it('maps roles, caps length, and drops leading model turns', () => {
    const history = [
      { role: 'model', text: 'Welcome' },
      { role: 'user', text: 'action anime' },
      { role: 'bot', text: 'Try these' },
    ]
    assert.deepEqual(toGeminiHistory(history), [
      { role: 'user', parts: [{ text: 'action anime' }] },
      { role: 'model', parts: [{ text: 'Try these' }] },
    ])
  })

  it('ignores empty or non-array history', () => {
    assert.deepEqual(toGeminiHistory(null), [])
    assert.deepEqual(toGeminiHistory([{ role: 'user', text: '   ' }]), [])
  })
})

describe('getFunctionCalls', () => {
  it('reads functionCalls() when present', () => {
    const response = {
      functionCalls: () => [{ name: 'search_catalog', args: { genre: 'Action' } }],
    }
    assert.deepEqual(getFunctionCalls(response), [
      { name: 'search_catalog', args: { genre: 'Action' } },
    ])
  })

  it('falls back to candidate parts', () => {
    const response = {
      candidates: [
        {
          content: {
            parts: [{ functionCall: { name: 'get_title_details', args: { title: 'Nausicaa' } } }],
          },
        },
      ],
    }
    assert.deepEqual(getFunctionCalls(response), [
      { name: 'get_title_details', args: { title: 'Nausicaa' } },
    ])
  })
})

describe('getResponseText', () => {
  it('uses text() and swallows function-call-only errors', () => {
    assert.equal(getResponseText({ text: () => '  Hello  ' }), 'Hello')
    assert.equal(
      getResponseText({
        text: () => {
          throw new Error('no text')
        },
        candidates: [{ content: { parts: [{ text: 'From parts' }] } }],
      }),
      'From parts',
    )
  })
})

describe('grounded copy', () => {
  it('names only catalog titles in the fallback reply', () => {
    assert.match(fallbackChatReply([]), /couldn't find matching titles/i)
    assert.match(
      fallbackChatReply([{ title: 'Nausicaa', englishTitle: 'Nausicaä of the Valley of the Wind' }]),
      /Nausicaä of the Valley of the Wind/,
    )
  })

  it('includes watchlist personalization in the system instruction', () => {
    const instruction = buildSystemInstruction({
      favoriteGenres: ['Action'],
      watchlist: [{ title: 'Frieren', status: 'watching' }],
    })
    assert.match(instruction, /must call search_catalog/)
    assert.match(instruction, /Favorite genres: Action/)
    assert.match(instruction, /Frieren \(watching\)/)
  })
})
