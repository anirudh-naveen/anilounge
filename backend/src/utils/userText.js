/**
 * Plain-text cleanup for user prose (friend notes, messages, posts, comments).
 *
 * Layer: utils. The global `sanitizeHtmlInput` middleware strips tags and escapes
 * `&`, `<`, and `>` in every body string. Social text is stored as plain text and
 * rendered with Vue text interpolation (never `v-html`), so the escapes are undone
 * here to keep "Tom & Jerry" from displaying as "Tom &amp; Jerry".
 */

const ENTITIES = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
  '&nbsp;': ' ',
}

/**
 * Undo the sanitizer's HTML escaping.
 * @param {string} text
 * @returns {string}
 */
export function decodeEntities(text) {
  return text.replace(/&(?:amp|lt|gt|quot|#39|#x27|nbsp);/g, (entity) => ENTITIES[entity])
}

/**
 * Normalize a submitted text field: decode escapes, unify newlines, strip control
 * characters, trim, and cap runs of blank lines.
 *
 * @param {unknown} value
 * @returns {string} Cleaned text ('' for non-strings).
 */
export function cleanUserText(value) {
  if (typeof value !== 'string') return ''
  return decodeEntities(value)
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
