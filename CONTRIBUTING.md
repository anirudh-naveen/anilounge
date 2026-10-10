# Contributing to AniLounge

Thanks for helping out. AniLounge is a small project, so every pull request matters, whether
it's a typo fix or a new feature. You're welcome whether you stay for a single PR or for the
long run.

## Finding something to work on

- Issues labelled [`good first issue`](https://github.com/anirudh-naveen/anilounge/labels/good%20first%20issue)
  are small and self-contained, and each one names the files to start from.
- Issues labelled [`help wanted`](https://github.com/anirudh-naveen/anilounge/labels/help%20wanted)
  are bigger. Comment on the issue first so we can agree on an approach before you write
  much code.
- Found a bug or have an idea? Open an issue. For anything larger than a small fix, please
  open the issue before the pull request.

Comment on an issue to claim it, so two people don't build the same thing. If you stop
working on it, say so in a comment and someone else can pick it up.

## Setting up

Follow [DEVELOPMENT.md](DEVELOPMENT.md) top to bottom. It covers Node, the Postgres container,
the free API keys you need (TMDB and MyAnimeList), loading sample data, and signing in with
the demo account.

**Never point your local setup at the production database.** Everything runs against the
local Docker database.

## Making a change

1. Fork the repo and create a branch from `main` (`fix-forum-comment-html`, `add-cypress-smoke-tests`).
2. Keep the pull request focused on one thing. Small PRs get reviewed faster.
3. Follow the code around you: naming, structure, and comment style. Comments follow
   [COMMENTS.md](COMMENTS.md). Every file starts with a short header saying what it's for.
4. Add or update tests for behaviour you change:
   - Backend: `*.test.js` next to the file, using Node's test runner.
   - Frontend: `src/__tests__/*.spec.ts`, using Vitest.
5. If you change `backend/db/schema.sql`, keep it idempotent (`IF NOT EXISTS`,
   `CREATE OR REPLACE`) and say so in the PR, because production needs `db:schema` run
   before deploying.

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

In the PR description, say what changed and why, how you tested it, and add screenshots
for anything visual. Link the issue (`Closes #12`).

Every PR needs a review from the maintainer before it merges (see `.github/CODEOWNERS`).
Changes to CI, the database schema, or auth and security middleware always get a careful
look, so expect questions there.

## AI-assisted contributions

Using AI coding tools is fine, and the project itself is built with them. You're still the
author of your PR:

- Read and understand every line before you submit it.
- Run the app and the checks yourself. Don't submit code you haven't run.
- Be ready to explain and adjust the change in review.

`DEVELOPMENT.md` has a section of notes for AI assistants. Point your tool at it.

## Security issues

Please don't open a public issue for a security problem. Email
[support@anilounge.net](mailto:support@anilounge.net) instead and we'll follow up.

## License

AniLounge is licensed under the [GNU Affero General Public License v3.0](LICENSE). By
submitting a contribution, you agree that it's licensed under the same terms.
