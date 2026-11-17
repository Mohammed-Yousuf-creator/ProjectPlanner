#!/usr/bin/env bash
# Development mode: Go server on :8080 and the Vite dev server (hot reload) on :5173.
set -euo pipefail
. "$(dirname "$0")/lib.sh"
cd "$ROOT"

[ -d frontend/node_modules ] || (cd frontend && npm install --no-audit --no-fund)

# Each server runs in its own process group so that stopping this script (Ctrl+C) also stops
# what they started themselves: `go run` and `npm` both launch child processes.
pids=()
start() { setsid "$@" & pids+=($!); }
cleanup() {
  trap - INT TERM EXIT
  for pid in "${pids[@]}"; do kill -TERM -- "-$pid" 2>/dev/null || true; done
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

# The dev server forwards /api to wherever the Go server listens.
addr="$(dotenv PLANNER_ADDR 127.0.0.1:8080)"
export PLANNER_API="${PLANNER_API:-http://${addr/#0.0.0.0/127.0.0.1}}"

start bash -c 'cd backend && exec go run ./cmd/planner'
start bash -c 'cd frontend && exec npm run dev'

say "Interface with hot reload: http://localhost:5173   (API: http://$addr)"
wait -n
