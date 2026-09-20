# ADR 0002: Dual-Plane Memory Bank

- Status: Accepted
- Date: 2026-08-31

## Context

Alfred needs continuity for repository development and agent conversations without treating raw transcripts or hidden reasoning as durable truth.

## Decision

Use two separate memory planes:

1. A reviewed repository memory bank under `docs/memory-bank` for project context, decisions, active work, progress and concise session handoffs.
2. LangGraph thread checkpoints plus its Store for runtime conversation state and bounded long-term planning records.

Runtime namespaces are scoped by trusted user and conversation identity. Cross-conversation sharing requires an explicit context flag. Store records are redacted, size-limited, retained for 90 days and treated as untrusted historical data.

Agent Server identity and thread metadata override request context, unauthenticated server runs cannot read or write memory, and recalled records remain internal graph state. A scoped deletion primitive supports future privacy controls. Redaction is defense in depth rather than a guarantee.

## Consequences

- Development agents receive stable project context across sessions.
- Runtime conversations can resume and optionally share prior planning history.
- Authentication becomes a prerequisite before exposing Agent Server memory endpoints in production.
- The redaction layer is defense in depth, not a guarantee; callers must not submit secrets for memorization.
