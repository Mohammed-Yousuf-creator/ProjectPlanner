#!/usr/bin/env bash
# One-time setup on Linux Mint / Ubuntu / Debian: installs what is missing, creates the
# database and builds the app. Safe to run again — it skips whatever is already done.
set -euo pipefail
. "$(dirname "$0")/lib.sh"
cd "$ROOT"

GO_MIN=1.22
GO_VERSION="${GO_VERSION:-1.22.12}"
NODE_MIN=18.0
NODE_VERSION="${NODE_VERSION:-20.18.1}"

case "$(uname -m)" in
  x86_64)  GO_ARCH=amd64; NODE_ARCH=x64 ;;
  aarch64) GO_ARCH=arm64; NODE_ARCH=arm64 ;;
  *) fail "Unsupported CPU: $(uname -m)" ;;
esac

# ---- 1. system packages -------------------------------------------------------------------
packages=()
have psql || packages+=(postgresql)
have curl || packages+=(curl ca-certificates)
have make || packages+=(make)
have git  || packages+=(git)
have tar  || packages+=(tar)
if [ "${#packages[@]}" -gt 0 ]; then
  have apt-get || fail "Please install these yourself, then run this again: ${packages[*]}"
  say "Installing: ${packages[*]} (asks for your password)"
  sudo apt-get update -qq
  sudo apt-get install -y "${packages[@]}"
fi
ok "PostgreSQL client: $(psql --version)"

# ---- 2. Go (for the server) ---------------------------------------------------------------
go_version() { go env GOVERSION 2>/dev/null | sed 's/^go//' ; }
if have go && version_ge "$(go_version)" "$GO_MIN"; then
  ok "Go $(go_version)"
else
  say "Downloading Go $GO_VERSION into .tools/ (your system Go is missing or older than $GO_MIN)"
  mkdir -p .tools && rm -rf .tools/go
  curl -fsSL "https://go.dev/dl/go$GO_VERSION.linux-$GO_ARCH.tar.gz" | tar -xz -C .tools
  hash -r
  ok "Go $(go_version) (in .tools/go — nothing was installed system-wide)"
fi

# ---- 3. Node.js (only to build the interface) ---------------------------------------------
node_version() { node --version 2>/dev/null | sed 's/^v//'; }
if have node && have npm && version_ge "$(node_version)" "$NODE_MIN"; then
  ok "Node.js $(node_version)"
else
  say "Downloading Node.js $NODE_VERSION into .tools/ (your system Node.js is missing or older than $NODE_MIN)"
  mkdir -p .tools && rm -rf .tools/node
  curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-$NODE_ARCH.tar.gz" | tar -xz -C .tools
  mv ".tools/node-v$NODE_VERSION-linux-$NODE_ARCH" .tools/node
  hash -r
  ok "Node.js $(node_version) (in .tools/node)"
fi

# ---- 4. database --------------------------------------------------------------------------
"$ROOT/scripts/setup-db.sh"

# ---- 5. settings --------------------------------------------------------------------------
if [ ! -f .env ]; then
  cp .env.example .env
  ok "Created .env"
fi

# ---- 6. build -----------------------------------------------------------------------------
say "Building the interface and the server"
make --no-print-directory build

echo
ok "All set. Start it with:  make run"
echo "   Then open http://localhost:8080"
