.PHONY: help format check lint lint-fix typecheck test clean install

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies
	pip install -e ".[dev]"

format: ## Format code with ruff
	ruff format src/ tests/

format-check: ## Check code formatting without making changes
	ruff format --check src/ tests/

lint: ## Run linter
	ruff check src/ tests/

lint-fix: ## Run linter and fix issues automatically
	ruff check --fix src/ tests/

typecheck: ## Run type checker
	mypy src/

check: format-check lint typecheck ## Run all code quality checks

test: ## Run tests
	pytest

test-cov: ## Run tests with coverage
	pytest --cov=src/scribe --cov-report=html --cov-report=term

clean: ## Clean up generated files
	rm -rf build dist *.egg-info
	rm -rf .pytest_cache .ruff_cache .mypy_cache
	rm -rf htmlcov .coverage
	find . -type d -name __pycache__ -exec rm -rf {} +

dev: ## Run API server in development mode
	uvicorn scribe.main:app --reload --host 0.0.0.0 --port 8000

worker: ## Run Celery worker
	celery -A scribe.worker worker --loglevel=info
