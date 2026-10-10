# Contributing to AniLounge

Thanks for helping out. AniLounge is a small project, so every pull request matters, whether
it's a typo fix or a new feature. You're welcome whether you stay for a single PR or for the
long run.

## Finding something to work on

- Open tasks are **gigs**: GitHub issues on the gig board, also posted on our Discord.
  [GIGS.md](GIGS.md) explains how to find and claim one.
- Issues labelled [`good first issue`](https://github.com/anirudh-naveen/anilounge/labels/good%20first%20issue)
  are small and self-contained, and each one names the files to start from.
- Found a bug or have an idea? Open an issue. For anything larger than a small fix, please
  open the issue before the pull request.

## Setting up

AniLounge is a Vue frontend (Vite) and an Express API (`backend/`) backed by PostgreSQL
in Docker. Follow these steps top to bottom the first time.

**Never point your local setup at the production database.** Everything runs against the
local Docker database.

### Prerequisites

- **Node.js** 20.19+ or 22.12+ (`node -v`)
- **Docker** (Docker Desktop on macOS/Windows) for PostgreSQL
- **Git**

### 1. Install dependencies

The frontend and backend have separate `package.json` files.

```bash
npm install
```

```bash
npm --prefix backend install
```

### 2. Start PostgreSQL

```bash
docker compose up -d
```

This starts Postgres 16 in a container named `anilounge-pg` on `localhost:5432`
(user `postgres`, password `dev`, database `anilounge`). Data persists in the
`anilounge_pg` volume across restarts.

### 3. Configure the backend

```bash
cp backend/.env.example backend/.env
```

Then edit `backend/.env`:

| Variable | Needed for | Notes |
| --- | --- | --- |
| `DATABASE_URL` | Everything | Already points at the Docker database. |
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

### 4. Create the database schema

```bash
npm --prefix backend run db:schema
```

Re-run this whenever `backend/db/schema.sql` changes (after every pull is a safe habit).
It is idempotent. If the API logs errors about a missing column or table, this is the fix.

### 5. Load some catalog data

A fresh database has no titles. Pull a small catalog from TMDB and MyAnimeList (needs the
two API keys):

```bash
npm --prefix backend run populate-unified -- --tmdbLimit 40 --malLimit 40
```

For a fuller catalog with characters, studios, and relations, use `npm --prefix backend
run db:reload` (slow; it checkpoints, so it can be interrupted and resumed).

### 6. Run the app

In two terminals:

```bash
npm --prefix backend run dev
```

```bash
npm run dev
```

- API: http://localhost:5001 (health check at `/health`)
- App: http://localhost:5174

The backend restarts on file changes (Node's `--watch` mode); the frontend hot-reloads.

**Sign in** with the demo account the API creates on startup:
`demo@findanimation.com` / `DemoPassword123!`. To make your own account an admin, sign
up, then run `npm --prefix backend run role:creator -- you@example.com`. The email
verification code appears in the backend console.

In development, the hourly catalog sync and account cleanups are off, and the bot and
brute-force protections are skipped, so you can call the API freely. Catalog maintenance
and connection polling still run; set `CATALOG_MAINTENANCE_ENABLED=false` or
`CONNECTIONS_SYNC_ENABLED=false` in `backend/.env` to quiet them.

### How the pieces fit

- `src/`: Vue 3 + TypeScript app (views, components, Pinia stores, `services/api.ts`).
- `backend/src/`: Express API (`routes/` → `controllers/` → `services/` → `models/`).
- `backend/db/schema.sql`: the whole database schema, applied by `db:schema`.
- `backend/src/scripts/`: one-off and maintenance scripts (`npm --prefix backend run …`).
- Production: frontend on Vercel (proxies `/api` to Railway via `vercel.json`), API and
  Postgres on Railway. See [TECHNOLOGY.md](TECHNOLOGY.md) for the full stack.

### Troubleshooting

| Problem | Fix |
| --- | --- |
| `Port 5001 is already in use` | Another API is running: `lsof -ti:5001 \| xargs kill` |
| Frontend won't start on 5174 | The port is pinned (account-linking redirects are registered for it); stop whatever is using it: `lsof -ti:5174 \| xargs kill` |
| `PostgreSQL connection error` | `docker compose up -d`, then `docker ps` to confirm `anilounge-pg` is healthy |
| Errors about missing columns/tables | `npm --prefix backend run db:schema` |
| Catalog pages are empty | Load data (step 5); check `TMDB_API_KEY` / `MAL_CLIENT_ID` |
| Signed out on every reload | Use the app URL (`localhost:5174`), not the API port, so the session cookie is first-party |
| Need a clean database | `docker compose down -v`, then steps 2, 4, and 5 again (deletes all local data) |

## Making a change

1. Fork the repo and create a branch from `main` (`fix-forum-comment-html`, `add-cypress-smoke-tests`).
2. Keep the pull request focused on one thing. Small PRs get reviewed faster.
3. Follow the code around you: naming, structure, and comment style. Comments follow
   [COMMENTS.md](COMMENTS.md). Every file starts with a short header saying what it's for.
4. Add or update tests for behaviour you change:
   - Backend: `*.test.js` next to the file, using Node's test runner.
   - Frontend: `src/__tests__/*.spec.ts`, using Vitest.
5. If you change `backend/db/schema.sql`, keep it idempotent (`IF NOT EXISTS`,
   `CREATE OR REPLACE`), apply it locally with `db:schema`, and say so in the PR, because
   production needs `db:schema` run before deploying. Function bodies must use
   single-quoted strings: the schema runner splits statements on `;`.

## Before you open the pull request

These are the same checks CI runs:

```bash
npm run format:check
```

```bash
npm run lint:check
```

```bash
npm run type-check
```

```bash
npm run test:unit:ci
```

```bash
npm --prefix backend test
```

End-to-end tests (Cypress) run with `npm run test:e2e:dev`.

In the PR description, say what changed and why, how you tested it, and add screenshots
for anything visual. Link the issue (`Closes #12`).

Every PR needs a review from the maintainer before it merges (see `.github/CODEOWNERS`).
Changes to CI, the database schema, or auth and security middleware always get a careful
look, so expect questions there.

## AI-assisted contributions

Using AI coding tools is fine. You're still the author of your PR:

- Read and understand every line before you submit it.
- Run the app and the checks yourself. Don't submit code you haven't run.
- Be ready to explain and adjust the change in review.

If your tool reads project instructions, point it at this file. In particular: never
point `DATABASE_URL` at production, apply schema changes with `db:schema` before testing,
and run the backend and frontend tests after changing either side.

## Security issues

Please don't open a public issue for a security problem. Email
[support@anilounge.net](mailto:support@anilounge.net) instead and we'll follow up.

## License

AniLounge is licensed under the [GNU Affero General Public License v3.0](LICENSE). By
submitting a contribution, you agree that it's licensed under the same terms.
