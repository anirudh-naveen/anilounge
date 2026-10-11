/**
 * richText.ts — the small formatting language of forum posts.
 *
 * Posts are stored as plain text with a few Markdown-style marks, so old posts and
 * excerpts still read fine as text:
 *
 * - inline: `**bold**`, `*italic*` (or `_italic_`), `~~strikethrough~~`, and
 *   `[text](https://link)` (http/https only);
 * - lines: `## Heading` (one preset size; `#` and `###` count too), `- item` or
 *   `* item` lists, `1. item` numbered lists, and `> quote`;
 * - fenced blocks, which hold any of the above (and each other):
 *   `+++ Title` … `+++` is a collapsible section, closed until opened, and
 *   `::: tip Title` … `:::` is a colored callout box (`note`, `tip`, or `warning`;
 *   the title is optional). A block left open runs to the end of the post. Blocks of
 *   the same kind don't nest: the next `+++ Title` starts a new section. A fence at
 *   the end of a text line (`last line +++`) closes the block too, so pasted text
 *   that lost its line breaks still reads right.
 *
 * Pictures are only for site news (`{ images: true }`): a line that is just
 * `![caption](url)` shows the picture (https, or an uploaded `/api/news-images/...`
 * file). Elsewhere that line stays plain text, so forum posts can't embed images.
 *
 * Text has no sizes of its own: only the heading and body presets. `parseRichText`
 * builds a tree that `ForumRichText.vue` renders with Vue (never `v-html`), and
 * `plainText` flattens it for previews and page descriptions.
 */

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'bold' | 'italic' | 'strike'; children: Inline[] }
  | { type: 'link'; href: string; children: Inline[] }
  | { type: 'break' }

export const CALLOUT_TONES = ['note', 'tip', 'warning'] as const
export type CalloutTone = (typeof CALLOUT_TONES)[number]

export type Block =
  | { type: 'heading' | 'paragraph' | 'quote'; children: Inline[] }
  | { type: 'list'; ordered: boolean; items: Inline[][] }
  | { type: 'section'; summary: Inline[]; blocks: Block[] }
  | { type: 'callout'; tone: CalloutTone; title: Inline[]; blocks: Block[] }
  | { type: 'image'; src: string; alt: string }

export interface RichTextOptions {
  /** Render `![caption](url)` lines as pictures (site news only). */
  images?: boolean
}

/** Inline marks, tried in this order when two start at the same place. */
const INLINE_RULES: { type: 'link' | 'bold' | 'italic' | 'strike'; re: RegExp }[] = [
  { type: 'link', re: /\[([^\]\n]+)\]\((https?:\/\/[^\s()<>]+)\)/ },
  { type: 'bold', re: /\*\*(?=\S)(.+?)(?<=\S)\*\*(?!\*)/ },
  { type: 'strike', re: /~~(?=\S)(.+?)(?<=\S)~~/ },
  { type: 'italic', re: /\*(?=[^\s*])(.+?)(?<=[^\s*])\*/ },
  { type: 'italic', re: /(?<![\p{L}\p{N}_])_(?=[^\s_])(.+?)(?<=[^\s_])_(?![\p{L}\p{N}_])/u },
]

const HEADING = /^#{1,3}\s+(.*)$/
const QUOTE = /^>\s?(.*)$/
const BULLET = /^[-*]\s+(.*)$/
const NUMBERED = /^\d{1,3}[.)]\s+(.*)$/
/** Fence lines: with text they open a block, bare they close it. */
const SECTION = /^\+{3}(?:\s+(.*))?$/
const CALLOUT = /^:{3}(?:\s+(.*))?$/
/** A picture line: `![caption](https://…)` or an uploaded news image. */
const IMAGE = /^!\[([^\]\n]{0,200})\]\((https:\/\/[^\s()<>]+|\/api\/news-images\/[\w-]+)\)$/
/** A fence closing its block at the end of a text line. */
const TRAILING_FENCE = { section: /\s+\+{3}$/, callout: /\s+:{3}$/ }

/** Summary of a section fence without its own title. */
export const SECTION_DEFAULT_SUMMARY = 'Show more'

/** Inline marks of one line of text. */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = []
  let rest = text
  while (rest) {
    let best: { type: (typeof INLINE_RULES)[number]['type']; match: RegExpExecArray } | null = null
    for (const rule of INLINE_RULES) {
      const match = rule.re.exec(rest)
      if (match && (!best || match.index < best.match.index)) best = { type: rule.type, match }
    }
    if (!best) {
      out.push({ type: 'text', text: rest })
      break
    }
    const { type, match } = best
    if (match.index) out.push({ type: 'text', text: rest.slice(0, match.index) })
    if (type === 'link') {
      out.push({
        type: 'link',
        href: match[2] as string,
        children: parseInline(match[1] as string),
      })
    } else {
      out.push({ type, children: parseInline(match[1] as string) })
    }
    rest = rest.slice(match.index + match[0].length)
  }
  return out
}

/** Lines joined with line breaks. */
function joinLines(lines: string[]): Inline[] {
  return lines.flatMap((line, index) => [
    ...(index ? [{ type: 'break' } as Inline] : []),
    ...parseInline(line),
  ])
}

/**
 * Lines inside the fenced block opened at `start`, and the index of its last line: its
 * closing fence, the line before the next opening fence of its kind, or the line it
 * ends on with a trailing fence.
 */
function fenced(lines: string[], start: number, fence: RegExp, trailing: RegExp) {
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = (lines[index] as string).trim()
    const match = fence.exec(line)
    if (match) {
      if (match[1]?.trim()) return { body: lines.slice(start + 1, index), end: index - 1 }
      return { body: lines.slice(start + 1, index), end: index }
    }
    if (trailing.test(line)) {
      return {
        body: [...lines.slice(start + 1, index), line.replace(trailing, '')],
        end: index,
      }
    }
  }
  return { body: lines.slice(start + 1), end: lines.length }
}

/** Tone and title of a callout fence's text (`tip Title`, or just a title for a note). */
function calloutHead(head: string) {
  const [first = '', ...rest] = head.trim().split(/\s+/)
  const tone = CALLOUT_TONES.find((value) => value === first.toLowerCase())
  return tone ? { tone, title: rest.join(' ') } : { tone: 'note' as const, title: head.trim() }
}

/** Blocks of a post body. */
export function parseRichText(text: string, options: RichTextOptions = {}): Block[] {
  return parseLines(String(text || '').split('\n'), options)
}

function parseLines(lines: string[], options: RichTextOptions): Block[] {
  const blocks: Block[] = []
  let paragraph: string[] = []
  let quote: string[] = []
  let list: { ordered: boolean; items: string[] } | null = null

  const flush = () => {
    if (paragraph.length) blocks.push({ type: 'paragraph', children: joinLines(paragraph) })
    if (quote.length) blocks.push({ type: 'quote', children: joinLines(quote) })
    if (list)
      blocks.push({ type: 'list', ordered: list.ordered, items: list.items.map(parseInline) })
    paragraph = []
    quote = []
    list = null
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = (lines[index] as string).trimEnd()
    if (!line.trim()) {
      flush()
      continue
    }
    const section = SECTION.exec(line.trim())
    const callout = CALLOUT.exec(line.trim())
    if (section || callout) {
      flush()
      const trailing = TRAILING_FENCE[section ? 'section' : 'callout']
      let head = ((section || callout) as RegExpExecArray)[1]?.trim() || ''
      // `+++ Title +++` is a whole block on one line.
      const oneLine = trailing.test(head)
      head = head.replace(trailing, '')
      const { body, end } = oneLine
        ? { body: [], end: index }
        : fenced(lines, index, section ? SECTION : CALLOUT, trailing)
      if (section) {
        blocks.push({
          type: 'section',
          summary: parseInline(head || SECTION_DEFAULT_SUMMARY),
          blocks: parseLines(body, options),
        })
      } else {
        const { tone, title } = calloutHead(head)
        blocks.push({
          type: 'callout',
          tone,
          title: parseInline(title),
          blocks: parseLines(body, options),
        })
      }
      index = end
      continue
    }
    const image = options.images ? IMAGE.exec(line.trim()) : null
    if (image) {
      flush()
      blocks.push({ type: 'image', alt: (image[1] as string).trim(), src: image[2] as string })
      continue
    }
    const heading = HEADING.exec(line)
    const quoted = QUOTE.exec(line)
    const bullet = BULLET.exec(line)
    const numbered = NUMBERED.exec(line)
    if (heading) {
      flush()
      blocks.push({ type: 'heading', children: parseInline(heading[1] as string) })
    } else if (quoted) {
      if (!quote.length) flush()
      quote.push(quoted[1] as string)
    } else if (bullet || numbered) {
      const ordered = !bullet
      if (!list || list.ordered !== ordered) {
        flush()
        list = { ordered, items: [] }
      }
      list.items.push(((bullet || numbered) as RegExpExecArray)[1] as string)
    } else {
      if (quote.length || list) flush()
      paragraph.push(line)
    }
  }
  flush()
  return blocks
}

/** Text of inline marks, without the marks. */
function inlineText(nodes: Inline[]): string {
  return nodes
    .map((node) => {
      if (node.type === 'text') return node.text
      if (node.type === 'break') return '\n'
      return inlineText(node.children)
    })
    .join('')
}

/** Plain text of blocks, one line per paragraph, heading, quote, list item, or block title. */
function blocksText(blocks: Block[]): string {
  return blocks
    .map((block) => {
      if (block.type === 'list') return block.items.map((item) => inlineText(item)).join('\n')
      if (block.type === 'section') return [inlineText(block.summary), blocksText(block.blocks)]
      if (block.type === 'callout') return [inlineText(block.title), blocksText(block.blocks)]
      if (block.type === 'image') return block.alt
      return inlineText(block.children)
    })
    .flat()
    .filter(Boolean)
    .join('\n')
}

/** A post body as plain text, one line per paragraph, heading, quote, or list item. */
export function plainText(text: string, options: RichTextOptions = {}) {
  return blocksText(parseRichText(text, options))
}
