---
name: alfred-quality-gate
description: Verification checklist for Alfred changes.
---

# Alfred Quality Gate

Use this skill before considering a change complete.

## Required Checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format:check
pnpm agent:lint
pnpm agent:typecheck
pnpm agent:test
pnpm memory:check
```

## Review

- No hardcoded secrets.
- Docker images run one process per service.
- Public API inputs are validated.
- Frontend only exposes public `VITE_` variables.
- LangGraph graph imports cleanly from `apps/agent/langgraph.json`.
