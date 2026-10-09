/**
 * Decide what the catalog sync may change on an existing row, and which changes to
 * tell admins about.
 *
 * Layer: utils (pure). For each editorial field (the ones on the admin page):
 * - sync value empty while the row has one: denied silently (keep current);
 * - admin-locked field the sync disagrees with: kept, noted as "blocked";
 * - row empty while the sync has a value: filled in, no notice;
 * - normal progress (upcoming → airing → finished, rising episode/season counts): applied, no notice;
 * - any other change: applied, noted as "changed" (an admin can revert and lock it).
 * Scores, votes, popularity, and schedule fields are not editorial and always update.
 * Nicknames are skipped: only admins set them.
 */

import { CONTENT_FIELDS, fieldsForKind, isListField } from './adminContent.js'

const AIRING_ORDER = ['upcoming', 'airing', 'finished']
const GROWING_FIELDS = new Set(['episodeCount', 'seasonCount'])

/**
 * Comparable form of a field value: trimmed text, whole numbers, and null for empty
 * (including 0 for counts/runtime, which the sources use for "unknown").
 * @param {string} field
 * @param {unknown} value
 * @returns {string | number | null}
 */
export function normalizeFieldValue(field, value) {
  if (value === null || value === undefined) return null
  if (CONTENT_FIELDS[field]?.type === 'int') {
    const number = Number(value)
    return Number.isFinite(number) && number > 0 ? Math.round(number) : null
  }
  const text = String(value).trim()
  return text || null
}

/**
 * @param {string} field
 * @param {string | number} current
 * @param {string | number} proposed
 * @returns {boolean} True when the change is ordinary forward progress.
 */
function isProgress(field, current, proposed) {
  if (field === 'airingStatus') {
    return AIRING_ORDER.indexOf(proposed) > AIRING_ORDER.indexOf(current)
  }
  if (GROWING_FIELDS.has(field)) return proposed > current
  return false
}

/**
 * @param {{ kind: string, current: Record<string, unknown>, incoming: Record<string, unknown>,
 *   locked?: Iterable<string>, accepted?: Iterable<string> }} input - Values in admin field
 *   names. `incoming` is what the sync put on the document before admin locks were applied.
 * @returns {{ keep: Record<string, unknown>,
 *   notices: Array<{ field: string, outcome: 'changed' | 'blocked', oldValue: unknown, newValue: unknown }> }}
 *   `keep`: current values to put back on the document.
 */
export function planSyncChanges({ kind, current, incoming, locked = [], accepted = [] }) {
  const lockedSet = new Set(locked)
  const acceptedSet = new Set(accepted)
  const keep = {}
  const notices = []

  for (const field of fieldsForKind(kind)) {
    // Nicknames are admin-only; the sync never has a value for them.
    if (acceptedSet.has(field) || isListField(field)) continue
    const now = normalizeFieldValue(field, current[field])
    const next = normalizeFieldValue(field, incoming[field])
    if (now === next) continue

    if (next === null) {
      if (!lockedSet.has(field)) keep[field] = current[field]
    } else if (lockedSet.has(field)) {
      notices.push({ field, outcome: 'blocked', oldValue: now, newValue: next })
    } else if (now !== null && !isProgress(field, now, next)) {
      notices.push({ field, outcome: 'changed', oldValue: now, newValue: next })
    }
  }
  return { keep, notices }
}
