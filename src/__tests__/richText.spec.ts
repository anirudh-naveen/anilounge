import { describe, expect, it } from 'vitest'
import { parseInline, parseRichText, plainText } from '@/utils/richText'
import { applyFormatting } from '@/utils/richTextEditing'

describe('parseInline', () => {
  it('reads bold, italics, strikethrough, and links', () => {
    expect(parseInline('a **b** *c* _d_ ~~e~~ [f](https://x.test/y)')).toEqual([
      { type: 'text', text: 'a ' },
      { type: 'bold', children: [{ type: 'text', text: 'b' }] },
      { type: 'text', text: ' ' },
      { type: 'italic', children: [{ type: 'text', text: 'c' }] },
      { type: 'text', text: ' ' },
      { type: 'italic', children: [{ type: 'text', text: 'd' }] },
      { type: 'text', text: ' ' },
      { type: 'strike', children: [{ type: 'text', text: 'e' }] },
      { type: 'text', text: ' ' },
      { type: 'link', href: 'https://x.test/y', children: [{ type: 'text', text: 'f' }] },
    ])
  })

  it('nests marks', () => {
    expect(parseInline('***both***')).toEqual([
      {
        type: 'bold',
        children: [{ type: 'italic', children: [{ type: 'text', text: 'both' }] }],
      },
    ])
  })

  it('leaves stray marks, snake_case, and non-http links as text', () => {
    expect(parseInline('2 * 3 * 4')).toEqual([{ type: 'text', text: '2 * 3 * 4' }])
    expect(parseInline('snake_case_name')).toEqual([{ type: 'text', text: 'snake_case_name' }])
    expect(parseInline('[x](javascript:alert(1))')).toEqual([
      { type: 'text', text: '[x](javascript:alert(1))' },
    ])
  })
})

describe('parseRichText', () => {
  it('splits headings, paragraphs, lists, and quotes', () => {
    const blocks = parseRichText('## Intro\nline one\nline two\n\n- a\n- b\n1. c\n> q1\n> q2')
    expect(blocks.map((block) => block.type)).toEqual([
      'heading',
      'paragraph',
      'list',
      'list',
      'quote',
    ])
    expect(blocks[1]).toEqual({
      type: 'paragraph',
      children: [
        { type: 'text', text: 'line one' },
        { type: 'break' },
        { type: 'text', text: 'line two' },
      ],
    })
    expect(blocks[2]).toMatchObject({ ordered: false, items: [[{ text: 'a' }], [{ text: 'b' }]] })
    expect(blocks[3]).toMatchObject({ ordered: true })
  })

  it('flattens to plain text', () => {
    expect(plainText('## Big **news**\n\n- [one](https://a.test)\n- two\n> *said*')).toBe(
      'Big news\none\ntwo\nsaid',
    )
  })
})

describe('applyFormatting', () => {
  it('wraps the selection, or a placeholder, and selects the inside', () => {
    expect(applyFormatting('hi there', 3, 8, 'bold')).toEqual({
      text: 'hi **there**',
      selectionStart: 5,
      selectionEnd: 10,
    })
    expect(applyFormatting('', 0, 0, 'italic')).toEqual({
      text: '*italic text*',
      selectionStart: 1,
      selectionEnd: 12,
    })
  })

  it('keeps spaces outside the marks', () => {
    expect(applyFormatting('a word b', 1, 7, 'bold').text).toBe('a **word** b')
  })

  it('unwraps an already formatted selection', () => {
    expect(applyFormatting('hi **there**', 5, 10, 'bold')).toEqual({
      text: 'hi there',
      selectionStart: 3,
      selectionEnd: 8,
    })
    expect(applyFormatting('**x**', 2, 3, 'italic').text).toBe('***x***')
    expect(applyFormatting('***x***', 3, 4, 'italic').text).toBe('**x**')
  })

  it('prefixes and unprefixes every selected line', () => {
    const listed = applyFormatting('one\ntwo', 0, 7, 'numbers')
    expect(listed.text).toBe('1. one\n2. two')
    expect(applyFormatting(listed.text, 0, listed.text.length, 'numbers').text).toBe('one\ntwo')
    expect(applyFormatting('1. one\n2. two', 0, 13, 'bullets').text).toBe('- one\n- two')
    expect(applyFormatting('title\nbody', 2, 2, 'heading').text).toBe('## title\nbody')
  })

  it('makes links from selected text or a selected URL', () => {
    expect(applyFormatting('see docs', 4, 8, 'link').text).toBe('see [docs](https://)')
    expect(applyFormatting('https://a.test', 0, 14, 'link').text).toBe(
      '[link text](https://a.test)',
    )
  })
})
