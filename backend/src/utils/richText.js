/**
 * Forum post formatting marks, removed for plain-text previews.
 *
 * Layer: utils. Post bodies are plain text with a few Markdown-style marks
 * (`**bold**`, `*italic*`/`_italic_`, `~~strike~~`, `[text](https://link)`, and line
 * prefixes `## `, `- `/`* `, `1. `, `> `); the client renders them (see
 * `src/utils/richText.ts`, whose patterns these match). Excerpts and page
 * descriptions use the text without the marks.
 */

const LINE_MARKS = [/^#{1,3}\s+/, /^>\s?/, /^[-*]\s+/, /^\d{1,3}[.)]\s+/]

const INLINE_MARKS = [
  [/\[([^\]\n]+)\]\((https?:\/\/[^\s()<>]+)\)/g, '$1'],
  [/\*\*(?=\S)(.+?)(?<=\S)\*\*(?!\*)/g, '$1'],
  [/~~(?=\S)(.+?)(?<=\S)~~/g, '$1'],
  [/\*(?=[^\s*])(.+?)(?<=[^\s*])\*/g, '$1'],
  [/(?<![\p{L}\p{N}_])_(?=[^\s_])(.+?)(?<=[^\s_])_(?![\p{L}\p{N}_])/gu, '$1'],
]

/**
 * One line without its inline marks (nested marks included).
 * @param {string} line
 * @returns {string}
 */
function stripInline(line) {
  let text = line
  for (let pass = 0; pass < 4; pass += 1) {
    const next = INLINE_MARKS.reduce((current, [re, to]) => current.replace(re, to), text)
    if (next === text) break
    text = next
  }
  return text
}

/**
 * Post text without formatting marks.
 * @param {unknown} text
 * @returns {string}
 */
export function stripFormatting(text) {
  return String(text || '')
    .split('\n')
    .map((line) => stripInline(LINE_MARKS.reduce((current, re) => current.replace(re, ''), line)))
    .join('\n')
}
