/**
 * usePageMeta.ts — per-page title, description, and search-engine tags.
 *
 * The app is one HTML page, so pages that should show up in search results set
 * their own `<title>`, meta description, Open Graph tags, canonical link, and
 * optional JSON-LD structured data while they're mounted. Search engines that run
 * JavaScript (Google, Bing) read these. Leaving the page restores the defaults
 * from index.html, whose Open Graph tags serve link previews (those don't run
 * scripts). `null` meta (still loading) keeps the defaults.
 */

import { onUnmounted, toValue, watchEffect, type MaybeRefOrGetter } from 'vue'

export interface PageMeta {
  /** Page title, without the site name. */
  title: string
  description?: string
  /** In-site path for the canonical link (no query or hash unless it matters). */
  path?: string
  /** Absolute image URL for link previews. */
  image?: string | null
  /** Open Graph type; 'website' by default. */
  type?: 'website' | 'article'
  /** schema.org JSON-LD: one object, or several (e.g. the page plus its breadcrumbs). */
  jsonLd?: Record<string, unknown> | Record<string, unknown>[] | null
}

const SITE_NAME = 'AniLounge'
const DESCRIPTION_MAX = 160
/** Marks the tags this composable added, so they can be removed again. */
const OWNED = 'data-page-meta'
/**
 * The site middleware (`/middleware.js`) writes the first page's meta into the HTML.
 * Tags it added are marked OWNED; index.html tags it changed keep their original
 * content here (and the title in `data-default`), so they still restore correctly.
 */
const DEFAULT_CONTENT = 'data-default-content'

/** index.html's title and description, read before any page changed them. */
let defaults: { title: string; description: string } | null = null
/**
 * The page whose meta is showing. The next page sets up before the previous one
 * unmounts, so a page only restores the defaults while it's still the owner.
 */
let owner: symbol | null = null

/** Text cut to a meta-description length on a word boundary. */
export function metaDescription(text: string, length = DESCRIPTION_MAX) {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length <= length) return flat
  const cut = flat.slice(0, length - 1)
  const space = cut.lastIndexOf(' ')
  return `${(space > length * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`
}

/** index.html's own meta tags this composable changed, with their original content. */
const originals = new Map<HTMLMetaElement, string>()

/**
 * The `<meta>` with this name/property, created (and marked as ours) when missing.
 * An index.html tag is remembered so leaving the page can restore it.
 */
function metaTag(attribute: 'name' | 'property', key: string) {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`)
  if (tag && !tag.hasAttribute(OWNED) && !originals.has(tag)) {
    originals.set(tag, tag.getAttribute(DEFAULT_CONTENT) ?? (tag.getAttribute('content') || ''))
  }
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute(attribute, key)
    tag.setAttribute(OWNED, '')
    document.head.appendChild(tag)
  }
  return tag
}

function ownedElement<K extends 'link' | 'script'>(tagName: K, selector: string) {
  let el = document.head.querySelector<HTMLElementTagNameMap[K]>(`${selector}[${OWNED}]`)
  if (!el) {
    el = document.createElement(tagName)
    el.setAttribute(OWNED, '')
    document.head.appendChild(el)
  }
  return el
}

export function usePageMeta(meta: MaybeRefOrGetter<PageMeta | null>) {
  const id = Symbol('page-meta')
  const descriptionTag = metaTag('name', 'description')
  defaults ??= {
    title: document.querySelector('title')?.getAttribute('data-default') ?? document.title,
    description: originals.get(descriptionTag) ?? (descriptionTag.getAttribute('content') || ''),
  }
  const defaultDescription = defaults.description

  watchEffect(() => {
    const value = toValue(meta)
    if (!value) return
    owner = id
    const title = `${value.title} · ${SITE_NAME}`
    const description = metaDescription(value.description || defaultDescription)
    const url = new URL(value.path || window.location.pathname, window.location.origin).href

    document.title = title
    descriptionTag.setAttribute('content', description)
    metaTag('property', 'og:site_name').setAttribute('content', SITE_NAME)
    metaTag('property', 'og:title').setAttribute('content', value.title)
    metaTag('property', 'og:description').setAttribute('content', description)
    metaTag('property', 'og:type').setAttribute('content', value.type || 'website')
    metaTag('property', 'og:url').setAttribute('content', url)
    metaTag('name', 'twitter:card').setAttribute(
      'content',
      value.image ? 'summary_large_image' : 'summary',
    )
    if (value.image) metaTag('property', 'og:image').setAttribute('content', value.image)
    else {
      document.head.querySelector(`meta[property="og:image"][${OWNED}]`)?.remove()
      const fallback = document.head.querySelector<HTMLMetaElement>('meta[property="og:image"]')
      if (fallback && originals.has(fallback))
        fallback.setAttribute('content', originals.get(fallback)!)
    }

    const canonical = ownedElement('link', 'link[rel="canonical"]')
    canonical.rel = 'canonical'
    canonical.href = url

    if (value.jsonLd) {
      const script = ownedElement('script', 'script[type="application/ld+json"]')
      script.type = 'application/ld+json'
      // `<` escaped so post text can't close the script element.
      script.textContent = JSON.stringify(value.jsonLd).replace(/</g, '\\u003c')
    } else {
      document.head.querySelector(`script[type="application/ld+json"][${OWNED}]`)?.remove()
    }
  })

  onUnmounted(() => {
    if (owner !== id || !defaults) return
    owner = null
    document.title = defaults.title
    descriptionTag.setAttribute('content', defaults.description)
    document.head.querySelectorAll(`[${OWNED}]`).forEach((el) => el.remove())
    originals.forEach((content, tag) => tag.setAttribute('content', content))
  })
}
