# TODO

## Content

1. Add nicknames for content/franchises
   - more common for Japanese titles.
   - for example, Kono Subarashi is known as KonoSuba, etc.
2. Fix how seasons work for anime
   - With franchises as a content, seasons should be spit up and rated seperately, with franchise taking the average rating of all the reasons combines and rounded to the nearest tenth.
   - One such content needing fixing in the database is My Hero Academia, with season 1 having access to all seasons and 170 episodes rather than just season 1.

## Home
1. Make sure the site can appear in search engines
   - If the user enters the site naturally without having an account, pop-up a sign-in prompt.
      - For example, at home, have a "Join the Community" prompt
2. Add a source for donations
   - Grant donaters a badge

## Search
1. Move search to the server
   - Right now the browser downloads the whole catalog (up to 10,000 titles) and filters it locally. Search is the only page that needs that download, so this removes it entirely. The search page's UI doesn't change.
   - Add one endpoint that takes the query, filters, sort, and page. Text matching can use `Content.searchIds` (kept unused for this); type, genre, and country map onto the existing query code.
   - Port to SQL: the rating range on the weighted score, year/season/status (based on airing dates), the "Japanese" language guess, titles credited to matching studios and voice actors, and the relevance ranking. The year dropdown needs a small earliest/latest-year query.
   - `Search.vue` sends its filters and shows one page of results; the store's local filtering and full-catalog load go away.
   - Most of the work is matching today's results (`src/utils/searchFilters.ts` and its tests). Trade-off: filtering waits on the server instead of being instant.

## Watchlist
1. Marking Status as Completed should autolock episode count to max
   - This should also update the episodes watched timeline


## Profile

1. Fix user avatar/image upload system
   - Move profile pictures out of Postgres (`user_avatars`) to Cloudflare R2. Set up first: run the Cloudflare agent setup (`claude plugin marketplace add cloudflare/skills`, then `claude plugin install cloudflare@cloudflare`), create an `anilounge-avatars` bucket with a public custom domain (e.g. `img.anilounge.net`) and a read/write API token, and add `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `AVATAR_PUBLIC_URL` to Railway.
   - Then: `services/avatarService.js` uploads to R2 (new key per upload, old one deleted, Postgres fallback when unset), a one-time script copies existing avatars and rewrites `users.profile_picture`, and `/api/avatars/:id` stays until old URLs stop appearing.

## Forum
0. Selecting a "top tag" doesn't change the image to the top tag's image. Also, remove franchises from the image consideration.
1. Add Text features for writing forum posts
   - bold text, italics, etc. 
   - no specific sizes for text, preset for heading and bosy
2. Add Forum filters for Guides and Articles
   - These don't need a content to be attached, but can have it as an option
3. Make sure forum posts can appear in search engines
   - If the user enters a forum post naturally without having an account, pop-up a sign-in prompt.
      - For example, in a forum, have a "Join the Conversation" prompt
      - For example, at home, have a "Join the Community" prompt
4. Fix the sort font to match the rest of the site's theme.



## Infrastructure
1. Ship the scaling upgrade: run `npm run db:schema` on production **before** deploying (the code reads `posts.hot_score`, `content.catalog_score`, `content.rating_count`), then open `https://www.anilounge.net/api/status` and check `clientIp` is your own IP. If it's a Vercel/Railway address, set `TRUST_PROXY=2` and recheck, or every visitor shares one rate-limit bucket.
2. Scale out when one instance gets busy (~5–10k daily users): 2–4 Railway replicas with `RATE_LIMIT_STORE=postgres`, and keep replicas × `PG_POOL_MAX` under Postgres `max_connections` (or add PgBouncer, ignoring `statement_timeout` and `application_name` startup params). Around ~100k daily users, add a read replica via `DATABASE_READ_URL`; beyond that, Redis for rate limits and partitioning `messages`/`watch_events` once they near ~100M rows.
3. Watch Connections sync traffic as sign-ups grow (services/connectionSync.js).
   - Unlike apps that sync from the user's device, every AniList call here comes from our server IP, and AniList allows 30-90 requests a minute per IP, shared with catalog jobs. Polling is budgeted (default 12/min AniList, 20/min MAL, each account at most every 2 min), so it can't get us rate-limited, but with N connected accounts each one is polled roughly every N/12 minutes on AniList (~80 min at 1,000 accounts).
   - When that gets too slow: poll recently active users first (and idle accounts rarely), pull on watchlist page load, and/or batch several accounts into one GraphQL request with aliases.
   - Imports aren't pushed out to other connected sites (a big import would be thousands of writes); only edits made afterwards sync. Revisit if users expect an import from one site to fill the other.


## Application
1. Produce an iOS application for AniLounge.
2. Produce an Android application for AniLounge.