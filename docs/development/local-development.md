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

For frontend development with hot reload inside Docker:

```bash
pnpm docker:dev
```

This uses `docker-compose.dev.yml` together with the base file. React/Vite serves
`http://localhost:5173` and observes the mounted frontend sources; API and agent images still
require rebuilding after their source changes. Do not run native Vite on the same port.
See the [local development runbook](../runbooks/local-development.md) for rebuild boundaries and
the purpose of the PostgreSQL initialization jobs.

For the compiled Nginx frontend, without hot reload:

```bash
docker compose --env-file .env up --build
```

Compose waits for the idempotent PostgreSQL bootstrap and TypeORM migration before starting the
API. Stop the stack without deleting data using `docker compose down`. Volume deletion is
intentionally not part of normal troubleshooting because it destroys local state.

The local LangGraph development server binds to `127.0.0.1`. The production-like overlay adds
durable PostgreSQL/Redis services; runtime memory still requires a validated `MemoryContext`, and
cross-conversation sharing remains opt-in.

## Configuration

`.env.example` is the committed contract. `.env` is local and ignored. Browser-visible values must start with `VITE_`; that prefix means the value is public and embedded into the web bundle.

Before deploying, replace all example passwords, configure an allow-listed CORS origin, provide secrets through the deployment platform, and run the checks in `docs/runbooks/deployment.md`.
