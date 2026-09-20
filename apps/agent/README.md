# Alfred Agent Application

This directory contains Alfred's LangGraph graph application. It is an independently deployable
runtime boundary, not a second application backend.

## Current foundation

- `langgraph.json` loads only `apps/agent/.env`; API and Compose secrets are not inherited.
- Local development uses `langgraph dev` and an in-memory store.
- Deployed Agent Server supplies the authenticated runtime identity, thread context, PostgreSQL and
  its dedicated Redis instance.
- Runtime memory is scoped by trusted user and conversation identity, bounded, redacted, TTL-based
  and explicitly deletable. Recent recall uses a bounded recency index rather than a namespace scan.

## Deliberately deferred

The graph is still a tested foundation. Product tools, the external agent library adapter, AG-UI
event production and the NestJS-to-Agent-Server principal handoff are not implemented yet. Add them
only through the existing contracts and the NestJS-to-runtime trust boundary (provider-neutral
identity, runtime principal derived from the authenticated session).

## Verification

```bash
pnpm agent:lint
pnpm agent:typecheck
pnpm agent:test
```
