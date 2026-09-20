---
name: alfred-infrastructure
description: Build or review Alfred Docker Compose, containers, PostgreSQL, Redis, migrations, or self-hosted LangGraph deployment foundations.
---

# Alfred Infrastructure

Keep the runtime self-hosted and compatible with a restricted enterprise environment. Public cloud services
are optional alternatives only when the user explicitly approves them.

## Invariants

- Keep `docker-compose.yml` usable for local development and the platform overlay explicit. The
  overlay is not evidence of a production orchestrator.
- Require real secrets at runtime; examples contain obvious placeholders only. Never put secrets in
  images, build arguments or `VITE_` variables.
- Run TypeORM migrations as a one-shot compiled process before the API. Application replicas must not
  migrate schemas on startup.
- Keep API and Agent Server data paths on separate private networks. Use distinct PostgreSQL login
  roles and Redis instances; a logical Redis database number is not an authorization boundary.
  Publish development ports only on loopback through the dedicated host-access bridge.
- Run application containers as non-root with dropped capabilities, healthchecks and persistent named
  volumes. Pin deployable base images by digest when the approved registry supports it.
- Separate API and Agent Server persistence and credentials. LangGraph standalone requires its own
  PostgreSQL database, Redis instance and approved licence/air-gap arrangement.
- Never delete existing volumes to repair startup unless the user explicitly authorizes the exact
  disposable target.

## Delivery

Render the base and overlay Compose configurations, syntax-check init scripts, build changed images,
and perform a disposable runtime smoke test when safe. Report static validation separately from a
real startup and from production readiness.
