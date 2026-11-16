#!/usr/bin/env bash
# Starts PostgreSQL and creates the planner role and database. Safe to run again.
#
#   scripts/setup-db.sh              # database "planner"
#   scripts/setup-db.sh planner_test # an extra database, e.g. for `make test`
#
# Settings (all optional): PLANNER_DB_USER, PLANNER_DB_PASSWORD,
# PG_ADMIN_URL (connect as a superuser with this URL instead of `sudo -u postgres`).
set -euo pipefail
. "$(dirname "$0")/lib.sh"

DB_NAME="${1:-planner}"
DB_USER="${PLANNER_DB_USER:-planner}"
DB_PASS="${PLANNER_DB_PASSWORD:-planner}"

case "$DB_NAME$DB_USER" in *[!a-z0-9_]*) fail "Database and role names may only contain a-z, 0-9 and _." ;; esac
case "$DB_PASS" in *\'*) fail "The password must not contain a single quote." ;; esac

have psql || fail "PostgreSQL is not installed. Run: sudo apt install -y postgresql"

admin() {
  if [ -n "${PG_ADMIN_URL:-}" ]; then
    psql "$PG_ADMIN_URL" -v ON_ERROR_STOP=1 -qAt "$@"
  else
    (cd / && sudo -u postgres psql -v ON_ERROR_STOP=1 -qAt "$@")
  fi
}

if [ -z "${PG_ADMIN_URL:-}" ]; then
  say "Starting PostgreSQL (asks for your password if sudo needs it)"
  if have systemctl && systemctl list-unit-files postgresql.service >/dev/null 2>&1; then
    sudo systemctl enable --now postgresql
  else
    sudo service postgresql start
  fi
  for _ in $(seq 1 30); do
    if admin -c 'select 1' >/dev/null 2>&1; then break; fi
    sleep 1
  done
fi
admin -c 'select 1' >/dev/null || fail "Could not connect to PostgreSQL as its superuser."
ok "PostgreSQL is running"

if [ "$(admin -c "select 1 from pg_roles where rolname = '$DB_USER'")" = "1" ]; then
  admin -c "alter role \"$DB_USER\" login password '$DB_PASS'"
  ok "Role $DB_USER exists"
else
  admin -c "create role \"$DB_USER\" login password '$DB_PASS'"
  ok "Created role $DB_USER"
fi

if [ "$(admin -c "select 1 from pg_database where datname = '$DB_NAME'")" = "1" ]; then
  ok "Database $DB_NAME exists"
else
  admin -c "create database \"$DB_NAME\" owner \"$DB_USER\""
  ok "Created database $DB_NAME"
fi

DATA_DIR="$(admin -c 'show data_directory' 2>/dev/null || true)"
[ -n "$DATA_DIR" ] && ok "Database files live on this computer in $DATA_DIR"
exit 0
