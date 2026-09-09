# Alfred

Alfred is a professional monorepo scaffold for a simplified agent platform inspired by Codex and Cloud Code.

It contains three runnable application layers:

- `apps/web`: React + Vite frontend.
- `apps/api`: NestJS backend with private-by-default routes, environment-controlled feature flags,
  optional Google OAuth, rotating sessions, strict validation and TypeORM migrations.
- `apps/agent`: Python LangGraph application prepared for LangGraph Platform / Agent Server development.

## Requirements

- Node.js `>=22.17.0`
- pnpm `>=10`
- Python `>=3.12`
- uv
- Docker and Docker Compose
- The sibling `langgraph-agent-repo` checkout, whose Compose stack provides PostgreSQL and Redis
  (`docker compose up -d postgres redis` there)

## Quick Start

```bash
pnpm setup:env
pnpm install
UV_CACHE_DIR=.cache/uv uv sync --project apps/agent --all-groups
pnpm dev
```

Useful URLs:

- Web: http://localhost:5173
- API liveness: http://localhost:3000/health/live
- API readiness: http://localhost:3000/health/ready
- LangGraph dev server: http://localhost:2024

## Docker

```bash
pnpm setup:env
docker compose up --build
```

PostgreSQL and Redis are not part of this stack. Start them first from `langgraph-agent-repo`;
Alfred containers join its `langgraph-agent-repo_agent-network` network (`DATA_NETWORK`) and the
API stores `api_`-prefixed tables in the shared `langgraph` database. See the
[local development runbook](docs/runbooks/local-development.md) for the connection URLs.

The setup command creates private `.env` files for Compose, NestJS, Vite and the standalone Agent
Server. It generates local secrets without printing them and never overwrites an existing file.
It preserves existing secrets while synchronizing managed feature flags and adding missing runtime
defaults for sessions, proxy trust and observability.
Google OAuth and the LangGraph licence remain disabled until their approved credentials are added.
See the [foundation report](docs/alfred-foundation-report.md) for the component summary, environment
matrix and exact Google OAuth setup checklist.

## Feature flags

Capabilities are controlled by validated `FEATURE_*_ENABLED` variables in the backend environment.
Optional product capabilities default off, are enforced by NestJS and may be exposed to React
through the public, read-only `/api/features` manifest. Operational flags remain server-only;
rate limiting defaults on and can be explicitly disabled without blocking the API on Redis.
`FEATURE_OPENAPI_ENABLED=false` removes local Swagger UI and its JSON endpoint; production keeps
both disabled regardless of that flag. Environment flags are startup snapshots, not live toggles.
Reserved product flags stay false in the public manifest until their execution path exists, even
when an environment profile sets the variable to `true`.
Google OAuth is intended for external or commercial deployments and remains disabled in the Enterprise
profile.

Reserved capabilities remain effectively disabled even when their environment switch is true;
only implemented execution paths can be advertised. See the
[capability delivery contract](docs/development/capability-delivery.md) for ownership, fallback
semantics and required checks. `pnpm architecture:check` enforces source boundaries and file size.

The Compose stack starts (PostgreSQL and Redis come from `langgraph-agent-repo`):

- `migrate`: one-shot TypeORM migration job against the shared `langgraph` database.
- `api`: NestJS API; Redis is required for readiness only while rate limiting is enabled.
- `web`: Vite production bundle served by Nginx.
- `agent`: LangGraph development server for local graph iteration.

## Commands

```bash
pnpm dev             # run web + API + LangGraph dev server
pnpm dev:web         # frontend only
pnpm dev:api         # backend only
pnpm dev:agent       # LangGraph local development server
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm build
pnpm memory:check
pnpm verify
```

## Memory Bank

Alfred has two complementary memory planes:

- `docs/memory-bank` is the repository memory for development agents. It keeps concise project context, architectural decisions, current work, verified progress and session handoffs in Git.
- `apps/agent/src/alfred_agent/memory.py` is the runtime memory contract. LangGraph checkpoints retain thread state, while the Store retains bounded planning episodes by trusted user and conversation identity.

Runtime memory is opt-out and cross-conversation sharing is opt-in. Historical entries are treated as untrusted data, never copied into task instructions or returned in the public graph output, and common secret formats are redacted before storage. Agent Server owns the durable Store in deployed environments; tests use `InMemoryStore` only. `forget_memories` provides scoped deletion for privacy workflows.

In Agent Server, Alfred ignores client-supplied namespace identifiers and derives the owner and conversation from the authenticated runtime identity and thread. Memory fails closed when either is unavailable. Do not expose the Agent Server Store endpoints publicly. Redaction is only defense in depth: callers must still avoid sending secrets or personal data for memorization.

## Repository Layout

```text
apps/
  web/       React + Vite frontend
  api/       NestJS API
  agent/     LangGraph graph application
packages/
  contracts/ Runtime-validated browser/API contracts
docs/
  adr/       Architecture decisions
  runbooks/  Operational runbooks
.codex/
  agents/    Project-local Codex agent role configs
.agents/
  skills/    Project-local skills loaded on demand
```

## LangGraph Note

`apps/agent` is the graph application. LangGraph Platform / Agent Server is the runtime that loads that graph, exposes the API, and supplies production persistence with PostgreSQL plus queueing/cache services such as Redis.

For local iteration, use `pnpm dev:agent`, which runs `langgraph dev` on port `2024`. Build the deployable Agent Server image from the app directory:

```bash
cd apps/agent
uv run --frozen langgraph build -t alfred-agent:local
```

`apps/agent/Dockerfile` is generated from `langgraph.json` for deployment; `Dockerfile.dev` is the lightweight local Compose image. Run `langgraph up` when a production-like local Agent Server with PostgreSQL and Redis is required.
