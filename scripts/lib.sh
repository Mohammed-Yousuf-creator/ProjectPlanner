# Shared helpers for the scripts in this folder. Source it; do not run it.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Toolchains that setup.sh downloaded into the project take precedence.
export PATH="$ROOT/.tools/go/bin:$ROOT/.tools/node/bin:$PATH"

say()  { printf '\033[1;33m==>\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m ✓\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m ✗\033[0m %s\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

# Reads KEY from .env (if present) unless it is already set in the environment.
dotenv() {
  local key="$1" fallback="${2:-}" value=""
  if [ -n "${!key:-}" ]; then printf '%s' "${!key}"; return; fi
  if [ -f "$ROOT/.env" ]; then
    value="$(grep -E "^[[:space:]]*(export[[:space:]]+)?$key=" "$ROOT/.env" | tail -n 1 | cut -d= -f2- | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^["'\'']//' -e 's/["'\'']$//')"
  fi
  printf '%s' "${value:-$fallback}"
}

DEFAULT_DATABASE_URL='postgres://planner:planner@127.0.0.1:5432/planner?sslmode=disable'

# version_ge 1.22.3 1.22 → true when the first version is at least the second.
version_ge() { [ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -n 1)" = "$2" ]; }
