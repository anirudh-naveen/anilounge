#!/usr/bin/env bash
# One-off: move a database to franchise → series → seasons → episodes, then import
# every title's seasons, episodes, tags, staff, and ids.
#
#   1. db:schema                     adds the seasons/episodes/... tables (no data change)
#   2. db:restructure-series --dry-run   plans and applies in a transaction, checks users'
#                                    data is unchanged, rolls back; plan in backend/logs/
#   3. (asks to continue)
#   4. db:restructure-series         backs up to a backup_<stamp> schema, applies, commits
#   5. db:reload --phases seasons    imports every title by source priority (long: hours)
#   6. full db:reload                repair, AniList links, new popular titles (with their
#                                    seasons), characters (TVmaze images), studios,
#                                    cleanup, and photos; titles step 5 imported are skipped
#
# Deploy the new code before running this. Uses DATABASE_URL from the environment, else
# backend/.env. Steps 5 and 6 can be stopped and rerun; they resume from a checkpoint.
#
# Usage: bash backend/src/scripts/run-series-migration.sh
set -euo pipefail

# Everything runs inside main(), which bash reads in full before starting: editing or
# pulling this file while it runs (it takes hours) can't make it run half-read lines.
main() {

  cd "$(dirname "$0")/../.."

  if [[ -z "${DATABASE_URL:-}" && -f .env ]]; then
    DATABASE_URL="$(grep -E '^DATABASE_URL=' .env | head -n1 | cut -d= -f2-)"
    export DATABASE_URL
  fi
  if [[ -z "${DATABASE_URL:-}" ]]; then
    echo "DATABASE_URL is not set (and backend/.env has none)." >&2
    exit 1
  fi

  host="$(sed -E 's#^[a-z]+://([^@]*@)?([^/?]+).*#\2#' <<<"$DATABASE_URL")"
  echo "Target database: $host"
  read -r -p "Run the series migration against this database? Type 'yes': " answer
  [[ "$answer" == "yes" ]] || { echo "Stopped."; exit 1; }

  echo
  echo "== 1/5 Applying the schema =="
  npm run db:schema

  echo
  echo "== 2/5 Dry run (applied in a transaction, then rolled back) =="
  npm run db:restructure-series -- --dry-run
  echo
  echo "Plan written to backend/logs/restructure-plan.json (see its 'review' list)."
  read -r -p "The dry run left users' data unchanged. Commit the migration? Type 'yes': " answer
  [[ "$answer" == "yes" ]] || { echo "Stopped before changing anything."; exit 1; }

  echo
  echo "== 3/5 Migrating (backs up first) =="
  npm run db:restructure-series

  echo
  echo "== 4/5 Importing seasons, episodes, tags, staff, and ids =="
  npm run db:reload -- --phases seasons --workers 2 --fresh

  echo
  echo "== 5/5 Full reload (characters, studios, cleanup, photos, new titles) =="
  npm run db:reload -- --phases repair,anilist,import,seasons,characters,studios,cleanup,photos --workers 2

  echo
  echo "Done. Check a few pages (e.g. Blue Box, Attack on Titan) and the Search rails."
}

main "$@"
exit
