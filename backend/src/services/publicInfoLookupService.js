/**
 * publicInfoLookupService.js — Topic-gated Wikipedia summaries for chat.
 *
 * Domain service: encyclopedia fetches are limited to catalog titles,
 * animation studios, voice actors, characters, and genres. Web text never discovers
 * titles to recommend.
 */

import { findByTitle, searchCatalog } from './catalogLookupService.js'
import { findEntityByName } from './entityService.js'
import { serializeEntity } from '../utils/entities.js'
import {
  extractMatchesTopic,
  isAllowedWikipediaUrl,
  isKnownGenre,
  normalizePublicInfoKind,
  parseWikipediaSummary,
  wikipediaPageMatchesCatalog,
  wikipediaSummaryUrl,
  wikiLookupCandidates,
  wikiTitleCandidates,
  WIKIPEDIA_USER_AGENT,
} from '../utils/publicInfoLookup.js'

const FETCH_TIMEOUT_MS = 5000
const CATALOG_NOTE = 'Background only. Recommend only catalog titles returned by search tools.'

/**
 * GET a Wikipedia REST summary. `fetchImpl` is injectable for tests.
 * @param {string} pageTitle
 * @param {{ fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<object|null>}
 */
export async function fetchWikipediaSummary(pageTitle, { fetchImpl = fetch } = {}) {
  const url = wikipediaSummaryUrl(pageTitle)
  if (!url) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': WIKIPEDIA_USER_AGENT,
      },
      redirect: 'follow',
      signal: controller.signal,
    })
    if (!response.ok || !isAllowedWikipediaUrl(response.url || url)) return null
    return parseWikipediaSummary(await response.json())
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function firstWikipediaHit(candidates, options, predicate) {
  for (const candidate of candidates) {
    const summary = await fetchWikipediaSummary(candidate, options)
    if (!summary) continue
    if (predicate && !predicate(summary)) continue
    return summary
  }
  return null
}

function wikiPayload({ kind, name, summary, extra = {} }) {
  return {
    allowed: true,
    kind,
    name,
    extract: summary?.extract,
    source: summary ? 'wikipedia' : undefined,
    sourceUrl: summary?.sourceUrl,
    note: CATALOG_NOTE,
    ...extra,
  }
}

async function lookupTitle(name, options) {
  const doc = await findByTitle(name)
  if (!doc) {
    return {
      docs: [],
      payload: {
        allowed: false,
        reason: 'Title is not in the AniLounge catalog. Do not invent or recommend it.',
      },
    }
  }

  const summary = await firstWikipediaHit(wikiTitleCandidates(doc), options, (hit) =>
    hit.title ? wikipediaPageMatchesCatalog(hit.title, doc) : true,
  )
  if (summary) {
    return {
      docs: [doc],
      payload: wikiPayload({
        kind: 'title',
        name: doc.englishTitle || doc.title,
        summary,
      }),
    }
  }

  return {
    docs: [doc],
    payload: {
      allowed: true,
      found: false,
      kind: 'title',
      catalogTitle: doc.englishTitle || doc.title,
      message: 'No encyclopedia summary. Use catalog overview, studio, and ratings only.',
    },
  }
}

async function lookupStudio(name, options) {
  const docs = await searchCatalog({ studio: name, limit: 8 })
  const summary = await firstWikipediaHit(wikiLookupCandidates(name, 'studio'), options)
  const studioLike = summary
    ? extractMatchesTopic(summary.extract, summary.description, 'studio')
    : false
  if (!docs.length && !studioLike) {
    return {
      docs: [],
      payload: {
        allowed: false,
        reason: 'Not a known animation studio. Stay on movies, series, studios, voice actors, and genres.',
      },
    }
  }
  return {
    docs,
    payload: wikiPayload({
      kind: 'studio',
      name,
      summary: studioLike || docs.length ? summary : null,
      extra: {
        catalogTitles: docs.map((doc) => doc.englishTitle || doc.title),
      },
    }),
  }
}

async function lookupGenre(name, options) {
  const docs = await searchCatalog({ genre: name, limit: 8 })
  if (!isKnownGenre(name) && !docs.length) {
    return {
      docs: [],
      payload: {
        allowed: false,
        reason: 'Not a known animation genre. Stay on movies, series, studios, voice actors, and genres.',
      },
    }
  }
  const summary = await firstWikipediaHit(wikiLookupCandidates(name, 'genre'), options, (hit) =>
    extractMatchesTopic(hit.extract, hit.description, 'genre'),
  )
  return {
    docs,
    payload: wikiPayload({
      kind: 'genre',
      name,
      summary,
      extra: {
        catalogTitles: docs.map((doc) => doc.englishTitle || doc.title),
      },
    }),
  }
}

async function lookupVoiceActor(name, options) {
  const summary = await firstWikipediaHit(
    wikiLookupCandidates(name, 'voice_actor'),
    options,
    (hit) => extractMatchesTopic(hit.extract, hit.description, 'voice_actor'),
  )
  if (!summary) {
    return {
      docs: [],
      payload: {
        allowed: false,
        reason:
          'No voice-actor encyclopedia page found. Do not invent credits or titles.',
      },
    }
  }
  return {
    docs: [],
    payload: wikiPayload({
      kind: 'voice_actor',
      name,
      summary,
      extra: {
        note: 'Do not name titles unless search_catalog confirms they are in the catalog.',
      },
    }),
  }
}

const CHARACTER_NOTE =
  'Answer the character question from this lookup. Do not recommend series from character info. Only search_catalog if the user explicitly asked for title recommendations.'

async function lookupCharacter(name, options) {
  const entity = await findEntityByName(name, 'character')
  if (entity) {
    await entity.populate({
      path: 'appearances.content',
      select: 'title englishTitle nativeTitle contentType',
    })
  }
  const summary = await firstWikipediaHit(
    wikiLookupCandidates(name, 'character'),
    options,
    (hit) => extractMatchesTopic(hit.extract, hit.description, 'character'),
  )
  const serialized = entity ? serializeEntity(entity) : null
  if (!serialized && !summary) {
    return {
      docs: [],
      payload: {
        allowed: false,
        reason:
          'No catalog character or encyclopedia page found. Do not invent biographies or recommend titles.',
      },
    }
  }
  const appearances = (serialized?.appearances || [])
    .map((row) => {
      const content = row.content
      if (!content || typeof content !== 'object') return null
      return content.englishTitle || content.title || null
    })
    .filter(Boolean)
  return {
    docs: [],
    payload: wikiPayload({
      kind: 'character',
      name: serialized?.name || name,
      summary,
      extra: {
        about: serialized?.about || undefined,
        catalogAppearances: appearances,
        role: serialized?.appearances?.[0]?.role,
        note: CHARACTER_NOTE,
      },
    }),
  }
}

/**
 * Look up encyclopedia background for a title, studio, voice actor, or genre.
 * @param {{ name?: string, title?: string, kind?: string }} [args]
 * @param {{ fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<{ docs: object[], payload: object }>}
 */
export async function lookupPublicInfo(args = {}, options = {}) {
  const kind = normalizePublicInfoKind(args.kind)
  const name = String(args.name || args.title || '').trim()
  if (!name) {
    return { docs: [], payload: { allowed: false, reason: 'A name is required.' } }
  }
  if (kind === 'studio') return lookupStudio(name, options)
  if (kind === 'genre') return lookupGenre(name, options)
  if (kind === 'voice_actor') return lookupVoiceActor(name, options)
  if (kind === 'character') return lookupCharacter(name, options)
  return lookupTitle(name, options)
}
