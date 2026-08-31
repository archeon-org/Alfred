.DEFAULT_GOAL := help

.PHONY: help bootstrap install dev build lint format typecheck test coverage check docker-up docker-down docker-logs

help: ## Show available commands
	@awk 'BEGIN {FS = ":.*## "; printf "\nAlfred commands:\n\n"} /^[a-zA-Z_-]+:.*## / {printf "  %-18s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

bootstrap: ## Prepare local environment and install all dependencies
	./scripts/bootstrap.sh

install: ## Install JavaScript and Python dependencies
	pnpm install
	UV_CACHE_DIR=.cache/uv uv sync --project apps/agent --all-groups

dev: ## Start all applications in watch mode
	pnpm dev

build: ## Build every deployable workspace
	pnpm build

lint: ## Run all linters
	pnpm lint
	pnpm agent:lint

format: ## Format all supported files
	pnpm format

typecheck: ## Run TypeScript and Python type checks
	pnpm typecheck
	pnpm agent:typecheck

test: ## Run unit and integration tests
	pnpm test
	pnpm agent:test

coverage: ## Run tests with coverage thresholds
	pnpm test:coverage
	pnpm agent:test

check: ## Run the complete local quality gate
	pnpm verify

docker-up: ## Build and start the full local stack
	docker compose up --build

docker-down: ## Stop the local stack without deleting data volumes
	docker compose down

docker-logs: ## Follow logs from the full local stack
	docker compose logs --follow
