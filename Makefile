# =============================================================================
# Thin, readable wrapper around docker compose + npm.
#
# `make` is NOT installed on Windows by default, and these recipes need a POSIX
# shell - run them from Git Bash or WSL, not cmd/PowerShell. Nothing here is
# essential: every target is one docker compose line, and the README lists the
# raw equivalent for each.
#
# Run `make` with no arguments for the target list.
# =============================================================================

SHELL := /bin/sh
.DEFAULT_GOAL := help

COMPOSE      := docker compose
COMPOSE_DEV  := docker compose -f docker-compose.yml -f docker-compose.dev.yml
PROJECTS     := account-service product-service frontend
API_SERVICES := account-service product-service

.PHONY: help up up-dev down restart logs ps build migrate seed smoke psql test lint clean reset .env-check

help: ## Show this help
	@awk 'BEGIN { FS = ":[^#]*## *"; printf "\nlearndev - e-commerce microservices lab\n\nUsage:\n  make <target>\n\nTargets:\n" } \
	     /^[a-zA-Z_-]+:[^#]*## / { printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2 } \
	     END { printf "\nStack: http://localhost  |  API http://localhost/api/products  |  Traefik http://localhost:8080\n\n" }' \
	     $(MAKEFILE_LIST)

.env-check:
	@test -f .env || { \
	  echo "ERROR: .env is missing. Run:  cp .env.example .env"; \
	  exit 1; \
	}

# --wait blocks until every healthcheck passes and exits non-zero if one never
# does. That is the healthchecks being *used* instead of eyeballed in
# `docker compose ps`, and it is why `make seed` below can assume a live database
# rather than failing with "container is restarting".
up: .env-check ## Build if needed and start the full stack, waiting until it is healthy
	$(COMPOSE) up -d --build --wait
	@echo ""
	@echo "  Shop      http://localhost"
	@echo "  API       http://localhost/api/products"
	@echo "  Traefik   http://localhost:8080   (dev only, unauthenticated)"
	@echo ""
	@echo "  Follow the logs with:  make logs"

# Deliberately no --wait here: it implies detached mode, and the first dev boot
# spends minutes running `npm install` inside the containers - you want to watch
# that scroll past, not stare at a silent prompt.
up-dev: .env-check ## Start with the dev override (host ports, hot reload, Swagger)
	$(COMPOSE_DEV) up --build

down: ## Stop and remove the containers (the database volume survives)
	$(COMPOSE_DEV) down --remove-orphans

restart: ## Recreate the application containers without touching postgres
	$(COMPOSE) up -d --force-recreate --no-deps account-service product-service frontend

logs: ## Tail the logs of every service (make logs S=account-service for one)
	$(COMPOSE) logs -f --tail=100 $(S)

ps: ## Show container status and health
	$(COMPOSE) ps

build: .env-check ## Build all three images without starting anything
	$(COMPOSE) build

migrate: ## Apply pending Prisma migrations inside the running API containers
	@for s in $(API_SERVICES); do \
	  echo "==> $$s"; \
	  $(COMPOSE) exec -T $$s npx prisma migrate deploy || exit 1; \
	done

seed: ## Seed both databases (idempotent - safe to run repeatedly)
	@for s in $(API_SERVICES); do \
	  echo "==> $$s"; \
	  $(COMPOSE) exec -T $$s npm run prisma:seed || exit 1; \
	done

# One command that proves the whole chain: healthchecks, Traefik's routing rules,
# the /api strip, the entrypoint migrations and the seed. `make seed` first - the
# catalogue and login checks read rows the seed creates.
#
# /health is checked from INSIDE each container because Traefik does not route it:
# http://localhost/health is the frontend's, not the API's. `$$VAR` is Make's
# escape for a single `$`, so the shell in the container expands its own port.
smoke: .env-check ## Prove the running stack works end to end (health, catalogue, admin login)
	@$(COMPOSE) up -d --wait
	@echo "==> liveness (from inside the containers)"
	@$(COMPOSE) exec -T account-service sh -c 'wget -qO- "http://127.0.0.1:$$ACCOUNT_SERVICE_PORT/health"' >/dev/null || exit 1
	@$(COMPOSE) exec -T product-service sh -c 'wget -qO- "http://127.0.0.1:$$PRODUCT_SERVICE_PORT/health"' >/dev/null || exit 1
	@echo "==> catalogue through Traefik (/api stripped at the edge)"
	@curl -fsS http://localhost/api/categories | grep -q '"id"' \
	  || { echo "FAIL: GET /api/categories returned no category - run 'make seed'"; exit 1; }
	@curl -fsS 'http://localhost/api/products?page=1&limit=2' | grep -q '"totalPages"' \
	  || { echo "FAIL: GET /api/products did not return the paginated envelope"; exit 1; }
	@echo "==> admin login"
	@curl -fsS -X POST http://localhost/api/auth/login \
	  -H 'Content-Type: application/json' \
	  -d '{"email":"admin@shop.local","password":"Admin123!"}' | grep -q '"accessToken"' \
	  || { echo "FAIL: could not log in as admin@shop.local - run 'make seed'"; exit 1; }
	@echo ""
	@echo "  smoke OK - health, routing, /api strip, migrations and seed all good."

psql: ## Open a psql shell on the account database (DB=product_db for the other)
	$(COMPOSE) exec postgres sh -c 'psql -U "$$POSTGRES_USER" -d $(or $(DB),account_db)'

test: ## Run the unit tests of all three projects on the host
	@for p in $(PROJECTS); do \
	  echo "==> $$p"; \
	  (cd $$p && npm run test --if-present) || exit 1; \
	done

lint: ## Lint all three projects on the host
	@for p in $(PROJECTS); do \
	  echo "==> $$p"; \
	  (cd $$p && npm run lint) || exit 1; \
	done

clean: ## Stop the stack and delete local build output (keeps node_modules + data)
	-$(COMPOSE_DEV) down --remove-orphans
	@for p in $(PROJECTS); do \
	  echo "==> cleaning $$p"; \
	  rm -rf $$p/dist $$p/.next $$p/coverage $$p/.eslintcache; \
	done

reset: ## DESTRUCTIVE - wipe containers AND the postgres volume, then start fresh
	@printf 'This deletes the pgdata volume and every row in it. Continue? [y/N] '; \
	 read ans; [ "$$ans" = "y" ] || [ "$$ans" = "Y" ] || { echo "aborted"; exit 1; }
	$(COMPOSE_DEV) down --volumes --remove-orphans
	$(COMPOSE) up -d --build --wait
	@echo "Fresh stack up and healthy. Run 'make seed', then 'make smoke'."
