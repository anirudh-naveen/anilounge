# Local Development

How to run AniLounge on your own machine: a Vue frontend (Vite) and an Express API
(`backend/`) backed by PostgreSQL in Docker. Written for new developers and AI coding
assistants; follow it top to bottom the first time.

## Prerequisites

- **Node.js** 20.19+ or 22.12+ (`node -v`)
- **Docker** (Docker Desktop on macOS/Windows) for PostgreSQL
- **Git**

## 1. Install dependencies

The frontend and backend have separate `package.json` files.

```bash
npm install
```

```bash
npm --prefix backend install
```

## 2. Start PostgreSQL

```bash
docker compose up -d
```

This starts Postgres 16 in a container named `anilounge-pg` on `localhost:5432`
(user `postgres`, password `dev`, database `anilounge`). Data persists in the
`anilounge_pg` volume across restarts.

## 3. Configure the backend

```bash
cp backend/.env.example backend/.env
```

Then edit `backend/.env`:

| Variable | Needed for | Notes |
| --- | --- | --- |
| `DATABASE_URL` | Everything | Already points at the Docker database. **Never use the production URL locally.** |
| `JWT_SECRET` | Sign-in | Any random string of 32+ characters (`openssl rand -base64 48`) |
| `TMDB_API_KEY` | Catalog, search | Free key at https://www.themoviedb.org/settings/api |
| `MAL_CLIENT_ID` | Catalog, search | Create a client at https://myanimelist.net/apiconfig |
| `GEMINI_API_KEY` | AI chat | https://aistudio.google.com/apikey (optional) |
| `CONNECTIONS_SECRET` | Linking AniList/MAL/TMDB accounts | Optional; `openssl rand -base64 48` |
| `KOFI_VERIFICATION_TOKEN` | Ko-fi donation webhook (Supporter badge) | Optional; any string locally, sent as `verification_token` in test payloads |

Everything else can stay blank. Without email keys, verification codes and other
emails are printed to the backend console instead of sent.

The frontend needs no `.env` in development: Vite proxies `/api` to
`http://localhost:5001`.

## 4. Create the database schema

```bash
npm --prefix backend run db:schema
```

Re-run this whenever `backend/db/schema.sql` changes (after every pull is a safe habit).
It is idempotent. If the API logs errors about a missing column or table, this is the fix.

## 5. Load some catalog data

A fresh database has no titles. Pull a small catalog from TMDB and MyAnimeList (needs the
two API keys):

```bash
npm --prefix backend run populate-unified -- --tmdbLimit 40 --malLimit 40
```

For a fuller catalog with characters, studios, and relations, use `npm --prefix backend
run db:reload` (slow; it checkpoints, so it can be interrupted and resumed).

## 6. Run the app

In two terminals:

```bash
npm --prefix backend run dev
```

```bash
npm run dev
```

- API: http://localhost:5001 (health check at `/health`)
- App: http://localhost:5174

The backend restarts on file changes using Node's built-in `--watch` flag; the frontend hot-reloads.

**Sign in** with the demo account the API creates on startup:
`demo@findanimation.com` / `DemoPassword123!`. To make your own account an admin, sign
up, then run `npm --prefix backend run role:creator -- you@example.com`. The email
verification code appears in the backend console.

## Tests and checks

| Command | What it runs |
| --- | --- |
| `npm --prefix backend test` | Backend unit tests (Node test runner) |
| `npm run test:unit` | Frontend unit tests (Vitest) |
| `npm run type-check` | TypeScript checks for the frontend |
| `npm run lint:check` | ESLint without modifying files |
| `npm run test:e2e:dev` | Cypress end-to-end tests |

## How the pieces fit

- `src/`: Vue 3 + TypeScript app (views, components, Pinia stores, `services/api.ts`).
- `backend/src/`: Express API (`routes/` → `controllers/` → `services/` → `models/`).
- `backend/db/schema.sql`: the whole database schema, applied by `db:schema`.
- `backend/src/scripts/`: one-off and maintenance scripts (`npm --prefix backend run …`).
- Production: frontend on Vercel (proxies `/api` to Railway via `vercel.json`), API and
  Postgres on Railway. See `TECHNOLOGY.md` for the full stack.

In development, the hourly catalog sync and account cleanups are off, and the bot and
brute-force protections are skipped, so you can call the API freely. Catalog maintenance
and connection polling still run; set `CATALOG_MAINTENANCE_ENABLED=false` or
`CONNECTIONS_SYNC_ENABLED=false` in `backend/.env` to quiet them.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `Port 5001 is already in use` | Another API is running: `lsof -ti:5001 \| xargs kill` |
| Frontend won't start on 5174 | The port is pinned (account-linking redirects are registered for it); stop whatever is using it: `lsof -ti:5174 \| xargs kill` |
| `PostgreSQL connection error` | `docker compose up -d`, then `docker ps` to confirm `anilounge-pg` is healthy |
| Errors about missing columns/tables | `npm --prefix backend run db:schema` |
| Catalog pages are empty | Load data (step 5); check `TMDB_API_KEY` / `MAL_CLIENT_ID` |
| Signed out on every reload | Use the app URL (`localhost:5174`), not the API port, so the session cookie is first-party |
| Need a clean database | `docker compose down -v`, then steps 2, 4, and 5 again (deletes all local data) |

## Notes for AI assistants

- Run the app with the `frontend` and `backend` entries in `.claude/launch.json` rather
  than starting servers in a shell.
- Never point `DATABASE_URL` at production. If you must, set
  `CONNECTIONS_SYNC_ENABLED=false` so you don't sync real users' accounts.
- After changing `backend/db/schema.sql`, apply it with `db:schema` before testing.
  Schema changes must be idempotent (`IF NOT EXISTS`, `CREATE OR REPLACE`), and function
  bodies must use single-quoted strings: the schema runner splits statements on `;`.
- Run `npm --prefix backend test` after backend changes and `npm run test:unit` after
  frontend changes.
- Don't commit or push unless asked.
