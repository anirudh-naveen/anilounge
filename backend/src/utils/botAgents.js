/**
 * Name the bot or crawler behind a metrics event, or null for a person.
 *
 * Layer: utils (pure). Used by services/metricsService.js to keep bots out of the
 * visitor counts and show them separately on the admin Metrics tab. Only the name is
 * stored, never the User-Agent. Most crawlers never run the app's JavaScript, so they
 * never report events at all; this catches the ones that do (search engines render
 * pages), plus browsers driven by automation (`navigator.webdriver`).
 */

/** Known bots, checked in order; the first match names it. */
const KNOWN_BOTS = [
  [
    'Googlebot',
    /Googlebot|Google-InspectionTool|GoogleOther|AdsBot-Google|Mediapartners-Google|Storebot-Google/i,
  ],
  ['Bingbot', /bingbot|BingPreview|msnbot|adidxbot/i],
  ['Applebot', /Applebot/i],
  ['DuckDuckBot', /DuckDuckBot|DuckAssistBot/i],
  ['YandexBot', /Yandex(?:Bot|RenderResourcesBot|Images)/i],
  ['Baiduspider', /Baiduspider/i],
  [
    'AI crawler',
    /GPTBot|ChatGPT-User|OAI-SearchBot|ClaudeBot|Claude-(?:User|SearchBot)|anthropic-ai|PerplexityBot|Perplexity-User|CCBot|Bytespider|Amazonbot|meta-externalagent|cohere-ai|Diffbot/i,
  ],
  [
    'Link preview',
    /facebookexternalhit|facebookcatalog|Twitterbot|Slackbot|Discordbot|TelegramBot|WhatsApp|LinkedInBot|redditbot|Embedly|Pinterestbot|SkypeUriPreview|iMessage|Iframely/i,
  ],
  [
    'SEO crawler',
    /AhrefsBot|SemrushBot|MJ12bot|DotBot|Screaming Frog|SEOkicks|BLEXBot|DataForSeoBot/i,
  ],
  ['Speed or uptime check', /Lighthouse|PageSpeed|GTmetrix|Pingdom|UptimeRobot|StatusCake/i],
  ['Headless browser', /HeadlessChrome|PhantomJS|Puppeteer|Playwright|Selenium|Cypress/i],
  [
    'Script',
    /\bcurl\/|Wget|python|axios|node-fetch|undici|Go-http-client|okhttp|Java\/|libwww|httpx/i,
  ],
]

/** Anything else that says it is a bot. */
const GENERIC_BOT = /bot\b|bot\/|crawl|spider|slurp|scraper|preview|fetcher|monitor/i

/**
 * @param {string | null | undefined} userAgent
 * @param {{ automated?: boolean }} [signals] - `automated`: the page reported
 *   `navigator.webdriver` (a browser under automation).
 * @returns {string | null} The bot's name, or null when it looks like a person.
 */
export function botName(userAgent, { automated = false } = {}) {
  const agent = String(userAgent || '').trim()
  if (agent.length < 5) return 'No user agent'
  for (const [name, pattern] of KNOWN_BOTS) {
    if (pattern.test(agent)) return name
  }
  if (GENERIC_BOT.test(agent)) return 'Other bot'
  if (automated) return 'Automated browser'
  return null
}
