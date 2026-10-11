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

  it('reads collapsible sections and callouts, nested, with their own blocks', () => {
    const blocks = parseRichText(
      'Intro\n+++ Filler **list**\n- 26\n- 97\n::: warning Skip these\nall of them\n:::\n+++\nafter\n::: plain title\nx',
    )
    expect(blocks.map((block) => block.type)).toEqual([
      'paragraph',
      'section',
      'paragraph',
      'callout',
    ])
    expect(blocks[1]).toMatchObject({
      summary: [{ type: 'text', text: 'Filler ' }, { type: 'bold' }],
      blocks: [
        { type: 'list', items: [[{ text: '26' }], [{ text: '97' }]] },
        { type: 'callout', tone: 'warning', title: [{ text: 'Skip these' }] },
      ],
    })
    // An unknown tone is a note's title; an unclosed block runs to the end.
    expect(blocks[3]).toMatchObject({
      tone: 'note',
      title: [{ text: 'plain title' }],
      blocks: [{ type: 'paragraph' }],
    })
    expect(parseRichText('+++\nhidden\n+++')[0]).toMatchObject({
      summary: [{ text: 'Show more' }],
    })
  })

  it("doesn't nest blocks of the same kind, and closes on a trailing fence", () => {
    const blocks = parseRichText(
      '+++ One\na\n+++ Two\n- b\n- c +++\nafter\n::: tip Hi\nsaid it :::\n+++ Three +++',
    )
    expect(blocks.map((block) => block.type)).toEqual([
      'section',
      'section',
      'paragraph',
      'callout',
      'section',
    ])
    expect(blocks[0]).toMatchObject({ summary: [{ text: 'One' }], blocks: [{ type: 'paragraph' }] })
    expect(blocks[1]).toMatchObject({
      blocks: [{ type: 'list', items: [[{ text: 'b' }], [{ text: 'c' }]] }],
    })
    expect(blocks[3]).toMatchObject({ blocks: [{ children: [{ text: 'said it' }] }] })
    expect(blocks[4]).toMatchObject({ summary: [{ text: 'Three' }], blocks: [] })
  })

  it('flattens blocks to plain text', () => {
    expect(plainText('+++ Fillers\n- 26\n:::  tip\nskip\n:::\n+++')).toBe('Fillers\n26\nskip')
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

  it('fences the selected lines, or a placeholder, as a section or callout', () => {
    expect(applyFormatting('Fillers\n\n26, 97', 9, 15, 'section')).toEqual({
      text: 'Fillers\n\n+++ Section title\n26, 97\n+++',
      selectionStart: 13,
      selectionEnd: 26,
    })
    expect(applyFormatting('intro\n', 6, 6, 'callout')).toEqual({
      text: 'intro\n\n::: tip\nCallout text\n:::',
      selectionStart: 15,
      selectionEnd: 27,
    })
  })
})

describe('pictures (site news only)', () => {
  const text = 'Hi\n![The new forum](/api/news-images/abc-123)\n![x](javascript:alert(1))'

  it('stays plain text unless images are on', () => {
    expect(parseRichText(text).some((block) => block.type === 'image')).toBe(false)
  })

  it('renders uploaded and https pictures, nothing else', () => {
    const blocks = parseRichText(`${text}\n![](https://example.com/a.png)`, { images: true })
    expect(blocks.filter((block) => block.type === 'image')).toEqual([
      { type: 'image', alt: 'The new forum', src: '/api/news-images/abc-123' },
      { type: 'image', alt: '', src: 'https://example.com/a.png' },
    ])
  })
})
