---
name: alfred-architecture
description: Architecture rules for evolving the Alfred monorepo.
---

# Alfred Architecture

Use this skill when adding or changing platform structure.

## Boundaries

- Web UI work belongs in `apps/web`.
- Product API and persistence belong in `apps/api`.
- Graph orchestration belongs in `apps/agent`.
- Shared workflow instructions belong in `.agents/skills`.
- Codex execution roles belong in `.codex/agents`.

## Rules

1. Keep runtime application code out of workflow/config folders.
2. Keep LangGraph graph definitions independent from NestJS controllers.
3. Treat the API as the boundary between UI and backend persistence.
4. Prefer explicit env variables over implicit local defaults.
5. Add an ADR when a structural decision changes.
6. Apply ADR 0009: responsibility-visible React layers, four-layer NestJS feature internals and
   external test suites with executable topology checks.
