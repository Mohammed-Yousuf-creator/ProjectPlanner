#!/usr/bin/env bash
# Starts the planner: one process that serves the API and the built interface.
set -euo pipefail
. "$(dirname "$0")/lib.sh"
cd "$ROOT"

[ -x bin/planner ] || fail "The server is not built yet. Run: make build"
[ -f frontend/dist/index.html ] || fail "The interface is not built yet. Run: make build"

if have pg_isready; then
  url="$(dotenv DATABASE_URL "$DEFAULT_DATABASE_URL")"
  if ! pg_isready -q -d "$url"; then
    fail "PostgreSQL is not answering. Start it with:  sudo systemctl start postgresql   (see README → Start the database)"
  fi
fi

exec ./bin/planner
