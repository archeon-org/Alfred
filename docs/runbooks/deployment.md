# Deployment Runbook

## Container Images

Each runtime layer has an isolated Dockerfile:

- `apps/web/Dockerfile` builds the Vite app and serves it with unprivileged Nginx on port `8080`.
- `apps/api/Dockerfile` builds the NestJS API, generates Prisma Client, and runs as a non-root user on port `3000`.
- `apps/agent/Dockerfile` is generated from `apps/agent/langgraph.json` for LangGraph Agent Server deployments.
- `apps/agent/Dockerfile.dev` is the lighter local Compose image for `langgraph dev`.
- `infra/postgres/Dockerfile` owns local PostgreSQL extensions and development databases.

## Required Checks

Run these before shipping a new image:

```bash
pnpm verify
docker compose config --quiet
docker compose build
pnpm audit --audit-level high
UV_CACHE_DIR=.cache/uv uv run --project apps/agent pip-audit
```

## Secrets

The committed `.env.example` is a local contract only. Replace all placeholders in real deployments and inject secrets through the platform, not Docker build arguments or `VITE_` variables.

## LangGraph

Use `apps/agent/langgraph.json` as the source of truth for graph exports. Local Compose runs `Dockerfile.dev`; production-like LangGraph validation should use the official CLI flow from `apps/agent`, including `langgraph build` or `langgraph up` when the target environment supports it.

Before exposing Agent Server, configure authentication and authorization and prevent direct public access to Store endpoints. Alfred derives memory ownership from the authenticated runtime principal and thread and disables memory when either is absent. The committed Store policy retains memory items for 90 days, sweeps every two hours and does not extend retention on reads. Wire `forget_memories` into an authorized API/UI flow before promising end-user deletion controls.

For a user-erasure request, remove both the conversation prefix and the user-shared planning-history prefix. Do not rely on TTL alone for privacy deletion.
