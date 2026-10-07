import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  assertCleanLanguage,
  censorText,
  containsBlockedLanguage,
  findBlockedTerm,
  moderationMessage,
} from './moderation.js'

test('blocks profanity and common evasions', () => {
  for (const text of [
    'what the fuck',
    'FUUUUCK this',
    'sh1t episode',
    'f.u.c.k',
    'f u c k off',
    'xXbullshitXx',
    'you b!tch',
    'ássh0le',
    'dicks',
    'that was shit.',
  ]) {
    assert.equal(containsBlockedLanguage(text), true, text)
  }
})

test('allows ordinary words and romanized Japanese that contain blocked letters', () => {
  for (const text of [
    'Tensei shitara Slime Datta Ken',
    'Kiken na Futari',
    'a classic class assignment',
    'Scene analysis of the finale',
    'Attack on Titan titles',
    'cocky rival, spicy ramen',
    'Hello there! 5 stars',
    'Nigeria and Niger',
    '',
  ]) {
    assert.equal(containsBlockedLanguage(text), false, text)
  }
})

test('findBlockedTerm reports the list term', () => {
  assert.equal(findBlockedTerm('bullsh1t'), 'bullshit')
  assert.equal(findBlockedTerm('fine'), null)
  assert.equal(findBlockedTerm(undefined), null)
})

test('censorText masks blocked words and keeps the rest', () => {
  assert.equal(censorText('this is shit, honestly'), 'this is s***, honestly')
  assert.equal(censorText('a classic scene'), 'a classic scene')
  assert.equal(censorText('f u c k you'), 'f * * * you')
  assert.equal(censorText('ok f.u.c.k off'), 'ok f.*.*.* off')
  assert.equal(censorText('a b c fine'), 'a b c fine')
  assert.equal(censorText('line one\nshit\n\nend'), 'line one\ns***\n\nend')
})

test('assertCleanLanguage throws for express-validator', () => {
  assert.equal(assertCleanLanguage('Naruto fan'), true)
  assert.throws(() => assertCleanLanguage('fuckface'), /isn't allowed/)
})

test('moderationMessage names the first failing field', () => {
  assert.equal(moderationMessage({ Title: 'Great show', Body: 'fine' }), null)
  assert.match(moderationMessage({ Title: 'ok', Body: 'shit' }), /^Body contains/)
})
