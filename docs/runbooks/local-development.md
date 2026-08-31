# Local Development Runbook

## Start Everything

```bash
cp .env.example .env
pnpm install
UV_CACHE_DIR=.cache/uv uv sync --project apps/agent --all-groups
pnpm dev
```

## Start Infrastructure

```bash
docker compose up postgres redis
```

## Validate

```bash
pnpm verify
pnpm agent:lint
pnpm agent:typecheck
pnpm agent:test
```

## Troubleshooting

- If Vite is not reachable from Docker, verify it binds to `0.0.0.0`.
- If the API refuses to boot, validate `DATABASE_URL` and required env variables.
- If LangGraph state disappears in `langgraph dev`, remember that local dev uses in-memory / local persistence; use production-like Agent Server testing when validating durable PostgreSQL persistence.
