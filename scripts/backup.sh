#!/usr/bin/env bash
# Writes one archive with everything: a dump of the database and the uploaded files.
#
#   scripts/backup.sh            # → backups/planner-<date>.tar.gz
#
# Restore (replaces what is there; stop the planner first):
#   tar -xzf backups/planner-<date>.tar.gz -C /tmp/restore
#   sudo -u postgres dropdb planner && make db
#   psql "$DATABASE_URL" < /tmp/restore/planner.sql
#   rm -rf data/uploads && cp -r /tmp/restore/uploads data/uploads
set -euo pipefail
. "$(dirname "$0")/lib.sh"
cd "$ROOT"

have pg_dump || fail "pg_dump is missing. Run: sudo apt install -y postgresql-client"
url="$(dotenv DATABASE_URL "$DEFAULT_DATABASE_URL")"
data_dir="$(dotenv PLANNER_DATA_DIR data)"
stamp="$(date +%Y-%m-%d-%H%M%S)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

pg_dump --no-owner --no-privileges "$url" > "$work/planner.sql"
if [ -d "$data_dir/uploads" ]; then cp -r "$data_dir/uploads" "$work/uploads"; else mkdir "$work/uploads"; fi

out_dir="$(dotenv PLANNER_BACKUP_DIR backups)"
mkdir -p "$out_dir"
tar -czf "$out_dir/planner-$stamp.tar.gz" -C "$work" planner.sql uploads
ok "Backup written to $out_dir/planner-$stamp.tar.gz ($(du -h "$out_dir/planner-$stamp.tar.gz" | cut -f1))"
