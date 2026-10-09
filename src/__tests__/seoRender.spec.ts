import { describe, expect, it } from 'vitest'
import { escapeHtml, renderNotFound, renderPage, setMeta, type SeoPage } from '../../seo/renderPage'

const SHELL = `<!doctype html>
<html lang="en">
  <head>
    <meta
      name="description"
      content="AniLounge — settle in &amp; discover."
    />
    <meta property="og:title" content="AniLounge" />
    <meta property="og:image" content="https://www.anilounge.net/anilounge-logo.png" />
    <title>AniLounge</title>
  </head>
  <body>
    <div id="app"></div>
  </body>
</html>`

const page = (overrides: Partial<SeoPage> = {}): SeoPage => ({
  title: 'Attack on Titan (2013)',
  description: 'Humans <fight> "Titans".',
  canonical: 'https://www.anilounge.net/tv-show/t1/attack-on-titan',
  image: 'https://image.tmdb.org/t/p/w500/a.jpg',
  type: 'website',
  robots: null,
  heading: 'Attack on Titan',
  intro: 'Humans fight Titans.\n\nReleased 2013 · Action',
  sections: [{ title: 'Characters', links: [{ href: '/character/c1/levi', label: 'Levi & co' }] }],
  jsonLd: { '@type': 'TVSeries', name: '</script><script>alert(1)</script>' },
  ...overrides,
})

describe('renderPage', () => {
  it('writes the title and meta, keeping index.html defaults for the app', () => {
    const html = renderPage(SHELL, page())
    expect(html).toContain(
      '<title data-default="AniLounge">Attack on Titan (2013) · AniLounge</title>',
    )
    expect(html).toContain(
      '<meta name="description" content="Humans &lt;fight&gt; &quot;Titans&quot;." data-default-content="AniLounge — settle in &amp; discover." />',
    )
    expect(html).toContain(
      '<meta property="og:title" content="Attack on Titan (2013)" data-default-content="AniLounge" />',
    )
    expect(html).toContain(
      '<meta property="og:url" content="https://www.anilounge.net/tv-show/t1/attack-on-titan" data-page-meta />',
    )
    expect(html).toContain(
      '<meta name="twitter:card" content="summary_large_image" data-page-meta />',
    )
    expect(html).toContain(
      '<link rel="canonical" href="https://www.anilounge.net/tv-show/t1/attack-on-titan" data-page-meta />',
    )
    expect(html).not.toContain('name="robots"')
    // Only one description tag.
    expect(html.match(/name="description"/g)).toHaveLength(1)
  })

  it("can't be broken out of by page text", () => {
    const html = renderPage(SHELL, page())
    expect(html).not.toContain('</script><script>alert(1)')
    expect(html).toContain('\\u003c/script>')
    expect(html).toContain('<a href="/character/c1/levi">Levi &amp; co</a>')
  })

  it('puts a readable summary inside #app', () => {
    const html = renderPage(SHELL, page())
    expect(html).toMatch(
      /<div id="app"><main[^>]*><h1>Attack on Titan<\/h1><p>Humans fight Titans.<\/p><p>Released 2013 · Action<\/p><section><h2>Characters<\/h2>/,
    )
  })

  it('marks thin pages noindex and keeps the default image when there is none', () => {
    const html = renderPage(SHELL, page({ robots: 'noindex', image: null }))
    expect(html).toContain('<meta name="robots" content="noindex" data-page-meta />')
    expect(html).toContain('content="https://www.anilounge.net/anilounge-logo.png"')
    expect(html).toContain('<meta name="twitter:card" content="summary" data-page-meta />')
  })
})

describe('helpers', () => {
  it('escapes and sets meta tags', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    )
    expect(setMeta('<head></head>', 'name', 'robots', 'noindex')).toContain(
      '<meta name="robots" content="noindex" data-page-meta />',
    )
    expect(renderNotFound(SHELL)).toContain('name="robots" content="noindex"')
  })
})
