APP := app
COMPOSE := docker compose --project-directory $(APP)
LOCAL_DATABASE_URL := postgres://celestiea:celestiea@localhost:5432/celestiea

.PHONY: local local-down seed-local test lint

## Start the full local stack on http://localhost:8080
local:
	$(COMPOSE) up -d --build --wait

local-down:
	$(COMPOSE) down

## Load the full seed (about a minute); SCALE=small for ~5k articles
seed-local:
	cd $(APP) && DATABASE_URL=$(LOCAL_DATABASE_URL) pnpm seed --scale=$(or $(SCALE),full)

## Unit and integration tests against the compose Postgres and Valkey
test:
	$(COMPOSE) up -d --wait postgres valkey
	cd $(APP) && pnpm test

lint:
	cd $(APP) && pnpm lint && pnpm typecheck
