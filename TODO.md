# TODO

## Content

1. Add nicknames for content/franchises
   - more common for Japanese titles.
   - for example, Kono Subarashi is known as KonoSuba, etc.

## Home

## Search

## Watchlist

## Profile

1. Fix user avatar/image upload system
   - Move profile pictures out of Postgres (`user_avatars`) to Cloudflare R2. Set up first: run the Cloudflare agent setup (`claude plugin marketplace add cloudflare/skills`, then `claude plugin install cloudflare@cloudflare`), create an `anilounge-avatars` bucket with a public custom domain (e.g. `img.anilounge.net`) and a read/write API token, and add `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `AVATAR_PUBLIC_URL` to Railway.
   - Then: `services/avatarService.js` uploads to R2 (new key per upload, old one deleted, Postgres fallback when unset), a one-time script copies existing avatars and rewrites `users.profile_picture`, and `/api/avatars/:id` stays until old URLs stop appearing.

## Forum



## Infrastructure

1. Create more CI/CD test blockers before PRs.
2. Ship the scaling upgrade: run `npm run db:schema` on production **before** deploying (the code reads `posts.hot_score`, `content.catalog_score`, `content.rating_count`), then open `https://www.anilounge.net/api/status` and check `clientIp` is your own IP. If it's a Vercel/Railway address, set `TRUST_PROXY=2` and recheck, or every visitor shares one rate-limit bucket.
3. Scale out when one instance gets busy (~5–10k daily users): 2–4 Railway replicas with `RATE_LIMIT_STORE=postgres`, and keep replicas × `PG_POOL_MAX` under Postgres `max_connections` (or add PgBouncer, ignoring `statement_timeout` and `application_name` startup params). Around ~100k daily users, add a read replica via `DATABASE_READ_URL`; beyond that, Redis for rate limits and partitioning `messages`/`watch_events` once they near ~100M rows.
4. Watch Connections sync traffic as sign-ups grow (services/connectionSync.js).
   - Unlike apps that sync from the user's device, every AniList call here comes from our server IP, and AniList allows 30-90 requests a minute per IP, shared with catalog jobs. Polling is budgeted (default 12/min AniList, 20/min MAL, each account at most every 2 min), so it can't get us rate-limited, but with N connected accounts each one is polled roughly every N/12 minutes on AniList (~80 min at 1,000 accounts).
   - When that gets too slow: poll recently active users first (and idle accounts rarely), pull on watchlist page load, and/or batch several accounts into one GraphQL request with aliases.
   - Imports aren't pushed out to other connected sites (a big import would be thousands of writes); only edits made afterwards sync. Revisit if users expect an import from one site to fill the other.
