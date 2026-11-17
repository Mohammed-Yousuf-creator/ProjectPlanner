# ProjectPlanner — everyday commands. Run `make` to list them.

# Toolchains downloaded by `make setup` live in .tools/ and take precedence.
export PATH := $(CURDIR)/.tools/go/bin:$(CURDIR)/.tools/node/bin:$(PATH)

TEST_DATABASE_URL ?= postgres://planner:planner@127.0.0.1:5432/planner_test?sslmode=disable

FRONTEND_SRC := $(shell find frontend/src frontend/public -type f 2>/dev/null) frontend/index.html frontend/package.json frontend/vite.config.ts
BACKEND_SRC  := $(shell find backend -type f \( -name '*.go' -o -name '*.sql' \) 2>/dev/null) backend/go.mod backend/go.sum

.PHONY: help setup db build run dev test backup clean
.DEFAULT_GOAL := help

help: ## List the commands
	@grep -hE '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F ':.*## ' '{ printf "  make %-8s %s\n", $$1, $$2 }'

setup: ## First-time setup: install what is missing, create the database, build
	@./scripts/setup.sh

db: ## Start PostgreSQL and create the planner database (safe to repeat)
	@./scripts/setup-db.sh

build: bin/planner frontend/dist/index.html ## Build the server and the interface

run: build ## Start the planner at http://localhost:8080
	@./scripts/run.sh

dev: ## Development mode with hot reload at http://localhost:5173
	@./scripts/dev.sh

test: ## Run the backend tests (uses a separate planner_test database)
	@./scripts/setup-db.sh planner_test
	cd backend && PLANNER_TEST_DATABASE_URL='$(TEST_DATABASE_URL)' go test ./...

backup: ## Save the database and uploads to backups/
	@./scripts/backup.sh

clean: ## Remove build output (keeps your data)
	rm -rf bin frontend/dist

bin/planner: $(BACKEND_SRC)
	cd backend && go build -trimpath -o ../bin/planner ./cmd/planner

frontend/node_modules/.package-lock.json: frontend/package.json frontend/package-lock.json
	cd frontend && npm ci --no-audit --no-fund
	@touch $@

frontend/dist/index.html: frontend/node_modules/.package-lock.json $(FRONTEND_SRC)
	cd frontend && npm run build
	@touch $@
