# Technology

The languages, frameworks, services, and tools AniLounge is built with.

## Frontend

| Technology | Used for |
| --- | --- |
| [Vue 3](https://vuejs.org) | UI framework (Composition API, `<script setup>`) |
| [TypeScript](https://www.typescriptlang.org) | Typed frontend code |
| [Vite](https://vite.dev) | Dev server and production build |
| [Vue Router](https://router.vuejs.org) | Client-side routing and auth guards |
| [Pinia](https://pinia.vuejs.org) | State stores (auth, content, entities, favorites) |
| [Axios](https://axios-http.com) | API client with session-refresh interceptor |
| [Vue Toastification](https://github.com/Maronato/vue-toastification) | Toast notifications |
| [Cropper.js](https://github.com/fengyuanchen/cropperjs) / [vue-cropperjs](https://github.com/Agontuk/vue-cropperjs) | Profile picture cropping |
| [Google Fonts](https://fonts.google.com) | Fraunces (display) and Outfit (body) typefaces |
| Web Locks API | Coordinates session refresh across browser tabs |
| [schema.org](https://schema.org) JSON-LD + Open Graph | Per-page structured data and link previews (`usePageMeta`, `src/utils/pageMeta.ts`) |

## Backend

| Technology | Used for |
| --- | --- |
| [Node.js](https://nodejs.org) (20.19+ / 22.12+) | Runtime (ES modules) |
| [Express](https://expressjs.com) | HTTP API |
| [PostgreSQL 16](https://www.postgresql.org) via [node-postgres (`pg`)](https://node-postgres.com) | Primary database |
| [jsonwebtoken](https://github.com/auth0/node-jsonwebtoken) | 15-minute access tokens (HS256) |
| [bcryptjs](https://github.com/dcodeIO/bcrypt.js) | Password hashing |
| Node `crypto` | Hashed session/refresh tokens, email codes, TOTP (RFC 6238) two-factor codes |
| [qrcode](https://github.com/soldair/node-qrcode) | QR codes for authenticator-app setup |
| [nodemailer](https://nodemailer.com) | SMTP email transport (fallback to Resend) |
| [node-cron](https://github.com/node-cron/node-cron) | Scheduled jobs (content sync, inactive-account cleanup) |
| [multer](https://github.com/expressjs/multer) | Profile picture uploads |
| [express-validator](https://express-validator.github.io) | Request validation |
| [Helmet](https://helmetjs.github.io) | Security headers |
| [cors](https://github.com/expressjs/cors) | Cross-origin allowlist |
| [express-rate-limit](https://github.com/express-rate-limit/express-rate-limit) / [express-slow-down](https://github.com/express-rate-limit/express-slow-down) | Rate limiting and brute-force slowdown |
| [sanitize-html](https://github.com/apostrophecms/sanitize-html) / [xss](https://github.com/leizongmin/js-xss) | Input sanitization |
| [cookie](https://github.com/jshttp/cookie) | Reading the httpOnly session cookie |
| [dotenv](https://github.com/motdotla/dotenv) | Environment configuration |
| [Node watch mode](https://nodejs.org/api/cli.html#--watch) | Auto-restart in development (`npm run dev`) |

## External APIs and data sources

| Service | Used for |
| --- | --- |
| [TMDB API](https://developer.themoviedb.org) | Movie and series metadata, posters, episodes; watchlist/ratings import (user-approved session) |
| [MyAnimeList API](https://myanimelist.net/apiconfig/references/api/v2) | Anime metadata and scores; public anime list import |
| [Jikan](https://jikan.moe) | Unofficial MyAnimeList API (characters, voice actors, studios) |
| [AniList GraphQL API](https://docs.anilist.co) | Additional anime metadata and linking; public anime list import |
| [Google Gemini](https://ai.google.dev) (`gemini-2.5-flash`) | The AI chatbot |

## Search and discovery

| Service | Used for |
| --- | --- |
| [Google Search Console](https://search.google.com/search-console) | Domain verification (DNS TXT record), sitemap submission, and indexing/search reports |
| [Bing Webmaster Tools](https://www.bing.com/webmasters) | Indexing for Bing, DuckDuckGo, Yahoo, and ChatGPT search (imported from Search Console) |
| XML sitemaps | `/sitemap.xml` index with per-section files under `/sitemaps/`, built live from the database (`services/sitemapService.js`); thin pages left out (`utils/seoIndexing.js`) |
| [Vercel Routing Middleware](https://vercel.com/docs/routing-middleware) | Writes each public page's title, meta tags, canonical link, JSON-LD, and a text summary into the HTML before JavaScript runs (`middleware.ts`, `seo/renderPage.ts`, `GET /api/seo/page`) |
| `robots.txt` | Crawl rules and the sitemap location (`public/robots.txt`) |

## Donations

| Service | Used for |
| --- | --- |
| [Ko-fi](https://ko-fi.com/anilounge) | Donations; its webhook (`POST /api/webhooks/kofi`) grants the Supporter badge to the account with the donor's email (`services/donationService.js`) |

## Email

| Service | Used for |
| --- | --- |
| [Zoho Mail](https://www.zoho.com/mail/) | Email service for the anilounge.net domain (`notify@`, `support@` mailboxes) |
| [Resend](https://resend.com) | Transactional sending over HTTPS: verification codes, lockout unlocks, email-change notices, inactivity warnings (Railway blocks SMTP below the Pro plan) |

## Hosting and infrastructure

| Service | Used for |
| --- | --- |
| [Vercel](https://vercel.com) | Frontend hosting; proxies `/api`, `/uploads`, and the sitemaps to the backend and sets security headers (`vercel.json`); DNS for anilounge.net; Routing Middleware for search-engine HTML |
| [Railway](https://railway.com) | Backend API and production PostgreSQL (client IPs read from Vercel's `X-Vercel-Forwarded-For`, `middleware/clientIp.js`) |
| [Docker](https://www.docker.com) / Docker Compose | Local PostgreSQL (`docker-compose.yml`) |

## Testing and tooling

| Tool | Used for |
| --- | --- |
| [Vitest](https://vitest.dev) + [Vue Test Utils](https://test-utils.vuejs.org) + [jsdom](https://github.com/jsdom/jsdom) | Frontend unit and component tests (including the middleware's HTML rendering) |
| [Cypress](https://www.cypress.io) | End-to-end tests |
| Node test runner (`node:test`) | Backend unit tests |
| [vue-tsc](https://github.com/vuejs/language-tools) | Type-checking |
| [ESLint](https://eslint.org) + [Prettier](https://prettier.io) | Linting and formatting |
