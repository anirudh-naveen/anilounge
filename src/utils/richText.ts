/**
 * richText.ts — the small formatting language of forum posts.
 *
 * Posts are stored as plain text with a few Markdown-style marks, so old posts and
 * excerpts still read fine as text:
 *
 * - inline: `**bold**`, `*italic*` (or `_italic_`), `~~strikethrough~~`, and
 *   `[text](https://link)` (http/https only);
 * - lines: `## Heading` (one preset size; `#` and `###` count too), `- item` or
 *   `* item` lists, `1. item` numbered lists, and `> quote`.
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

export type Block =
  | { type: 'heading' | 'paragraph' | 'quote'; children: Inline[] }
  | { type: 'list'; ordered: boolean; items: Inline[][] }

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

/** Blocks of a post body. */
export function parseRichText(text: string): Block[] {
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

  for (const raw of String(text || '').split('\n')) {
    const line = raw.trimEnd()
    if (!line.trim()) {
      flush()
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

/** A post body as plain text, one line per paragraph, heading, quote, or list item. */
export function plainText(text: string) {
  return parseRichText(text)
    .map((block) =>
      block.type === 'list'
        ? block.items.map((item) => inlineText(item)).join('\n')
        : inlineText(block.children),
    )
    .join('\n')
}
