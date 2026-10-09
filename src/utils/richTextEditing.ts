/**
 * richTextEditing.ts — the composer's formatting buttons (see `richText.ts`).
 *
 * Each tool edits the text around the selection and says what to select next:
 * inline marks wrap the selection (or a placeholder) and unwrap it when it is already
 * wrapped; line marks prefix every selected line and remove the prefix when all of
 * them have it already.
 */

export type FormatTool =
  | 'bold'
  | 'italic'
  | 'strike'
  | 'heading'
  | 'bullets'
  | 'numbers'
  | 'quote'
  | 'link'

export interface FormatResult {
  text: string
  selectionStart: number
  selectionEnd: number
}

const WRAPS: Partial<Record<FormatTool, { mark: string; placeholder: string }>> = {
  bold: { mark: '**', placeholder: 'bold text' },
  italic: { mark: '*', placeholder: 'italic text' },
  strike: { mark: '~~', placeholder: 'struck text' },
}

/** Line prefix of each line tool; `numbers` counts up from 1. */
const LINE_PREFIX: Partial<Record<FormatTool, { re: RegExp; make: (index: number) => string }>> = {
  heading: { re: /^#{1,3}\s+/, make: () => '## ' },
  bullets: { re: /^[-*]\s+/, make: () => '- ' },
  numbers: { re: /^\d{1,3}[.)]\s+/, make: (index) => `${index + 1}. ` },
  quote: { re: /^>\s?/, make: () => '> ' },
}

const LINK_PLACEHOLDER = 'https://'

function wrap(text: string, start: number, end: number, mark: string, placeholder: string) {
  const before = text.slice(0, start)
  const after = text.slice(end)
  const selected = text.slice(start, end)
  // `**` also ends with `*`, so italic only unwraps an odd run of `*` (`*x*`, `***x***`).
  const stars = (side: string) => side.length - side.replace(/^\*+/, '').length
  const wrapped =
    mark === '*'
      ? stars([...before].reverse().join('')) % 2 === 1 && stars(after) % 2 === 1
      : before.endsWith(mark) && after.startsWith(mark)
  if (wrapped) {
    return {
      text: before.slice(0, -mark.length) + selected + after.slice(mark.length),
      selectionStart: start - mark.length,
      selectionEnd: end - mark.length,
    }
  }
  // Keep surrounding spaces outside the marks: `** bold**` doesn't format.
  const inner = selected.trim() || placeholder
  const lead = selected.length - selected.trimStart().length
  const trail = selected.trim() ? selected.length - selected.trimEnd().length : 0
  const head = before + selected.slice(0, lead) + mark
  return {
    text: head + inner + mark + selected.slice(selected.length - trail) + after,
    selectionStart: head.length,
    selectionEnd: head.length + inner.length,
  }
}

function prefixLines(
  text: string,
  start: number,
  end: number,
  prefix: { re: RegExp; make: (index: number) => string },
) {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1
  // A selection ending right after a newline doesn't include the next line.
  const lastChar = end > start && text[end - 1] === '\n' ? end - 1 : end
  const nextBreak = text.indexOf('\n', lastChar)
  const lineEnd = nextBreak === -1 ? text.length : nextBreak
  const lines = text.slice(lineStart, lineEnd).split('\n')
  const all = lines.every((line) => !line.trim() || prefix.re.test(line))
  let count = 0
  const next = lines.map((line) => {
    if (all) return line.replace(prefix.re, '')
    if (!line.trim()) return line
    // Swap any other line prefix (a bullet becoming a number, say).
    const bare = Object.values(LINE_PREFIX).reduce(
      (current, other) => current.replace(other!.re, ''),
      line,
    )
    return prefix.make(count++) + bare
  })
  const block = next.join('\n')
  return {
    text: text.slice(0, lineStart) + block + text.slice(lineEnd),
    selectionStart: lineStart,
    selectionEnd: lineStart + block.length,
  }
}

function link(text: string, start: number, end: number) {
  const selected = text.slice(start, end).trim()
  if (/^https?:\/\/\S+$/.test(selected)) {
    const head = `${text.slice(0, start)}[`
    return {
      text: `${head}link text](${selected})${text.slice(end)}`,
      selectionStart: head.length,
      selectionEnd: head.length + 'link text'.length,
    }
  }
  const label = selected || 'link text'
  const head = `${text.slice(0, start)}[${label}](`
  return {
    text: `${head}${LINK_PLACEHOLDER})${text.slice(end)}`,
    selectionStart: head.length,
    selectionEnd: head.length + LINK_PLACEHOLDER.length,
  }
}

/** Apply a formatting tool to `text` with the selection `start`–`end`. */
export function applyFormatting(
  text: string,
  start: number,
  end: number,
  tool: FormatTool,
): FormatResult {
  const from = Math.max(0, Math.min(start, end, text.length))
  const to = Math.min(text.length, Math.max(start, end))
  const wrapTool = WRAPS[tool]
  if (wrapTool) return wrap(text, from, to, wrapTool.mark, wrapTool.placeholder)
  const prefix = LINE_PREFIX[tool]
  if (prefix) return prefixLines(text, from, to, prefix)
  return link(text, from, to)
}
