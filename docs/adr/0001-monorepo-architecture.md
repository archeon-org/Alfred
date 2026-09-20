# ADR 0001: Monorepo Architecture

## Status

Accepted

## Context

Alfred needs a frontend, an API, and an agent runtime surface that can evolve together without duplicating tooling or deployment conventions.

## Decision

Use a pnpm workspace with Turborepo task orchestration:

- `apps/web` owns the React/Vite user interface.
- `apps/api` owns the NestJS HTTP API and database access.
- `apps/agent` owns the LangGraph graph application loaded by LangGraph Platform / Agent Server.
- Docker Compose owns local multi-service execution.
- `.codex/agents` and `.agents/skills` define the development workflow surface.

## Consequences

- Shared commands run from the repository root.
- Each app remains deployable as its own container.
- Agent runtime code stays separated from the user-facing backend.
