# Local development

## Native watch mode

Install everything once with `make bootstrap`, then start all workspaces:

```bash
pnpm dev
```

The default local ports are:

| Service            | URL                     |
| ------------------ | ----------------------- |
| React/Vite         | `http://localhost:5173` |
| NestJS API         | `http://localhost:3000` |
| LangGraph Platform | `http://localhost:2024` |
| PostgreSQL         | `localhost:5432`        |

Individual applications can be started with `pnpm dev:web`, `pnpm dev:api` and `pnpm dev:agent`.

## Container mode

```bash
docker compose up --build
```

Compose waits for PostgreSQL readiness before starting dependent services. Stop the stack without deleting data using `docker compose down`. Volume deletion is intentionally not part of the normal scripts because it destroys local database state.

The local Agent Server binds to `127.0.0.1` and persists its development data in the `agent-data` volume. Runtime memory requires a validated `MemoryContext`; cross-conversation sharing remains disabled unless the caller explicitly enables it.

## Configuration

`.env.example` is the committed contract. `.env` is local and ignored. Browser-visible values must start with `VITE_`; that prefix means the value is public and embedded into the web bundle.

Before deploying, replace all example passwords, configure an allow-listed CORS origin, provide secrets through the deployment platform, and run the checks in `docs/runbooks/deployment.md`.
