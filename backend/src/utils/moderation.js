/**
 * Strict language filter for user-written text (usernames, passwords, bios,
 * chatbot prompts, forum posts, comments, and direct messages).
 *
 * Layer: utils. Pure functions. Text is normalized before matching so common
 * evasions still hit: accents, letter repeats (`fuuuck`), leetspeak (`sh1t`),
 * punctuation inside words (`f.u.c.k`), and spaced-out letters (`f u c k`).
 * Surfaces: `findBlockedTerm`, `classifyLanguage`, `containsBlockedLanguage`,
 * `censorText`, `termCategory`, `assertCleanLanguage` (express-validator), and
 * `BLOCKED_LANGUAGE_MESSAGE`.
 *
 * Every term is a 'curse' or a 'slur' (SLUR_TERMS: racial, ethnic, homophobic,
 * transphobic, and ableist slurs). Private messages between two users who both turned
 * on Settings → Communication → Allow profanity pass `{ allowCurses: true }`, which
 * skips curses; slurs are always blocked.
 */

export const BLOCKED_LANGUAGE_MESSAGE = "contains language that isn't allowed on AniLounge."

/**
 * Unambiguous terms, blocked anywhere inside a word (so `xXbullshitXx` fails).
 * Terms that are also parts of ordinary words (`ass` in `class`) or of romanized
 * Japanese (`shit` in `Tensei Shitara`, `kike` in `kiken`) go in WORD_TERMS.
 */
const SUBSTRING_TERMS = [
  'fuck',
  'fck',
  'phuck',
  'motherf',
  'bullshit',
  'shitty',
  'shithead',
  'bitch',
  'cunt',
  'asshole',
  'arsehole',
  'dickhead',
  'cocksucker',
  'bastard',
  'whore',
  'slut',
  'pussy',
  'twat',
  'wank',
  'dildo',
  'porn',
  'blowjob',
  'handjob',
  'jizz',
  'nigger',
  'nigga',
  'faggot',
  'fagot',
  'tranny',
  'retard',
  'wetback',
  'towelhead',
  'raghead',
  'beaner',
  'pedophile',
  'paedophile',
  'molest',
]

/**
 * Terms blocked only as a whole word, optionally with a common suffix (`dicks`, `raping`).
 * No `-y` suffix: it would catch `cocky` and `spicy`.
 */
const WORD_TERMS = [
  'shit',
  'kike',
  'ass',
  'arse',
  'dick',
  'cock',
  'cum',
  'tit',
  'tits',
  'titty',
  'boob',
  'hoe',
  'fag',
  'dyke',
  'spic',
  'chink',
  'gook',
  'coon',
  'paki',
  'kkk',
  'rape',
  'rapist',
  'nude',
  'nudes',
  'milf',
  'pedo',
  'semen',
  'anal',
  'vagina',
  'penis',
  'damn',
  'crap',
  'piss',
  'prick',
  'bollocks',
  'wtf',
  'stfu',
  'kys',
]

/** Terms in the 'slur' category; every other term is a 'curse'. */
const SLUR_TERMS = new Set([
  'nigger',
  'nigga',
  'faggot',
  'fagot',
  'fag',
  'dyke',
  'tranny',
  'retard',
  'wetback',
  'towelhead',
  'raghead',
  'beaner',
  'kike',
  'spic',
  'chink',
  'gook',
  'coon',
  'paki',
  'kkk',
])

/**
 * Which category a list term belongs to.
 * @param {string} term - A term from the lists (as returned by `findBlockedTerm`).
 * @returns {'slur' | 'curse'}
 */
export function termCategory(term) {
  return SLUR_TERMS.has(term) ? 'slur' : 'curse'
}

const WORD_SUFFIX = '(?:s|es|er|ers|ing|ed|head|heads)?'

/** Leetspeak and look-alike symbols, applied only inside chunks that contain a letter. */
const LEET = {
  0: 'o',
  1: 'i',
  3: 'e',
  4: 'a',
  5: 's',
  7: 't',
  8: 'b',
  9: 'g',
  '@': 'a',
  $: 's',
  '!': 'i',
  '|': 'i',
  '+': 't',
  '€': 'e',
}

/**
 * Regex source where every letter may repeat (`f+u+c+k+`), so `fuuuck` matches
 * while `niger` (one g) does not match `nigger`.
 * @param {string} term
 * @returns {string}
 */
const stretch = (term) => [...term].map((letter) => `${letter}+`).join('')

const SUBSTRING_PATTERNS = SUBSTRING_TERMS.map((term) => ({
  term,
  pattern: new RegExp(stretch(term)),
}))
const WORD_PATTERNS = WORD_TERMS.map((term) => ({
  term,
  pattern: new RegExp(`^${stretch(term)}${WORD_SUFFIX}$`),
}))

/**
 * Lowercase, strip accents, and decode leetspeak for one whitespace-delimited chunk,
 * then drop everything but letters.
 * @param {string} chunk
 * @returns {string}
 */
function normalizeChunk(chunk) {
  const plain = chunk.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const decoded = /[a-z]/.test(plain)
    ? [...plain].map((char) => LEET[char] ?? char).join('')
    : plain
  return decoded.replace(/[^a-z]/g, '')
}

/**
 * Letter-only words to check: each chunk, plus runs of single letters joined back
 * together (`f u c k` → `fuck`). CamelCase usernames stay one word.
 * @param {string} text
 * @returns {string[]}
 */
function candidateWords(text) {
  const words = []
  let spelled = ''
  for (const chunk of String(text).split(/\s+/)) {
    const word = normalizeChunk(chunk)
    if (word.length === 1) {
      spelled += word
      continue
    }
    if (spelled.length > 1) words.push(spelled)
    spelled = ''
    if (word) words.push(word)
  }
  if (spelled.length > 1) words.push(spelled)
  return words
}

/**
 * Blocked term in one normalized word, if any. Slurs are checked first so a word
 * matching both reports the slur.
 * @param {string} word
 * @param {{ allowCurses?: boolean }} [options] - Skip 'curse' terms.
 * @returns {string | null}
 */
function matchWord(word, { allowCurses = false } = {}) {
  let curse = null
  for (const { term, pattern } of [...SUBSTRING_PATTERNS, ...WORD_PATTERNS]) {
    if (!pattern.test(word)) continue
    if (SLUR_TERMS.has(term)) return term
    curse ??= term
  }
  return allowCurses ? null : curse
}

/**
 * First blocked term found in `text`.
 * @param {unknown} text
 * @param {{ allowCurses?: boolean }} [options] - Ignore 'curse' terms.
 * @returns {string | null} The matched list term, or null when the text is clean.
 */
export function findBlockedTerm(text, options) {
  return classifyLanguage(text, options)?.term ?? null
}

/**
 * The most serious blocked term in `text`: the first slur, else the first curse.
 * @param {unknown} text
 * @param {{ allowCurses?: boolean }} [options] - Ignore 'curse' terms.
 * @returns {{ term: string, category: 'slur' | 'curse' } | null}
 */
export function classifyLanguage(text, options) {
  if (typeof text !== 'string' || !text.trim()) return null
  let curse = null
  for (const word of candidateWords(text)) {
    const term = matchWord(word, options)
    if (!term) continue
    if (SLUR_TERMS.has(term)) return { term, category: 'slur' }
    curse ??= term
  }
  return curse ? { term: curse, category: 'curse' } : null
}

/**
 * @param {unknown} text
 * @returns {boolean} True when `text` contains a blocked term.
 */
export function containsBlockedLanguage(text) {
  return findBlockedTerm(text) !== null
}

/**
 * Mask blocked words, keeping the first letter (`shit` → `s***`), including
 * spelled-out runs (`f u c k` → `f * * *`). Used on chatbot replies and on direct
 * messages, which are delivered masked with a warning to the sender.
 * @param {string} text
 * @param {{ allowCurses?: boolean }} [options] - Leave curses, mask only slurs.
 * @returns {string}
 */
export function censorText(text, options) {
  if (typeof text !== 'string' || !text) return text
  const parts = text.split(/(\s+)/)
  // Words are at even indexes, whitespace at odd ones.
  for (let i = 0; i < parts.length; i += 2) {
    if (normalizeChunk(parts[i]).length === 1) {
      // Spelled-out run (`f u c k`): check the letters joined back together.
      let end = i
      let spelled = ''
      while (end < parts.length && normalizeChunk(parts[end]).length === 1) {
        spelled += normalizeChunk(parts[end])
        end += 2
      }
      if (spelled.length > 1 && matchWord(spelled, options)) {
        for (let j = i; j < end; j += 2) parts[j] = maskChunk(parts[j], j === i)
      }
      i = end - 2
      continue
    }
    const word = normalizeChunk(parts[i])
    if (word && matchWord(word, options)) parts[i] = maskChunk(parts[i], true)
  }
  return parts.join('')
}

/**
 * Star out a chunk's letters and digits, optionally keeping the first.
 * @param {string} chunk
 * @param {boolean} keepFirst
 * @returns {string}
 */
function maskChunk(chunk, keepFirst) {
  let kept = !keepFirst
  return chunk.replace(/[\p{L}\p{N}@$!|+€]/gu, (char) => {
    if (!kept) {
      kept = true
      return char
    }
    return '*'
  })
}

/**
 * express-validator `custom` check: rejects values with blocked language.
 * @param {unknown} value
 * @returns {true}
 * @throws {Error} When the value contains a blocked term.
 */
export function assertCleanLanguage(value) {
  if (containsBlockedLanguage(value)) {
    throw new Error(`This ${BLOCKED_LANGUAGE_MESSAGE}`)
  }
  return true
}

/**
 * First labeled field that fails the filter, as a user-facing message.
 * @param {Record<string, unknown>} fields - `{ Label: value }`.
 * @returns {string | null} e.g. `"Bio contains language that isn't allowed on AniLounge."`
 */
export function moderationMessage(fields) {
  for (const [label, value] of Object.entries(fields)) {
    if (containsBlockedLanguage(value)) return `${label} ${BLOCKED_LANGUAGE_MESSAGE}`
  }
  return null
}

export default {
  findBlockedTerm,
  classifyLanguage,
  termCategory,
  containsBlockedLanguage,
  censorText,
  assertCleanLanguage,
  moderationMessage,
  BLOCKED_LANGUAGE_MESSAGE,
}
