# ADR 0004: Self-Hosted Runtime Isolation

- Status: Accepted
- Date: 2026-09-03

## Context

The local platform must model the security boundaries expected in Enterprise infrastructure without
requiring public cloud storage or managed external services. Retained developer volumes must also
upgrade without destructive recreation.

## Decision

- Docker Compose keeps web, API and LangGraph as separate application containers. The base file runs
  the in-memory LangGraph development server; an explicit overlay selects standalone Agent Server.
- A repeatable `postgres-bootstrap` job creates logical databases, required extensions and restricted
  login roles on both fresh and retained PostgreSQL volumes. PostgreSQL uses the pinned pgvector
  distribution so the standalone Agent Server extension contract is available without runtime
  installation.
- `alfred_migrator` owns the API/blob/test schemas and is available only to migration jobs.
  `alfred_api` can connect only to those databases with DML privileges and no schema creation
  right. `alfred_agent` can connect only to `alfred_langgraph`. Application containers never
  receive the PostgreSQL bootstrap or migration credential. A post-migration one-shot job revokes
  runtime DML on the TypeORM migration ledger before API replicas start.
- API Redis and Agent Server Redis are separate password-protected instances on separate internal
  networks. Docker's Redis database number is not treated as an authorization boundary.
- Published development ports bind to loopback. The production-like overlay removes API, Agent
  Server, PostgreSQL and Redis host publication, keeps data services on internal networks, isolates
  Agent Server from the web/API network, forces runtime feature flags off until service
  authentication exists and disables vendor tracing. Application containers run without root, drop
  Linux capabilities and use read-only filesystems where the runtime contract has been verified.
- Deployable base images are pinned by digest. A production platform must mirror and scan them in the
  Enterprise-approved registry before promotion.

## Consequences

- Compromising the API credential does not grant schema ownership or direct access to the agent
  runtime's PostgreSQL database or Redis instance.
- Local startup is ordered: PostgreSQL readiness, idempotent bootstrap, TypeORM migration, API,
  then web. A migration failure blocks API replicas.
- `alfred_blobs` reserves a self-hosted blob boundary but does not yet implement file storage.
- The standalone Agent Server overlay still requires an approved licence or air-gapped arrangement,
  TLS, secret injection, backups, image scanning and orchestrator-level network policy. Compose
  validation alone is not production approval.

## Amendment 2026-09-09

PostgreSQL and Redis are no longer provisioned by this repository. The `postgres-bootstrap` and
`postgres-runtime-grants` jobs, the `alfred_migrator`/`alfred_api`/`alfred_agent` roles, the four
logical databases and the separate API/Agent Redis instances are removed; containers reach the
sibling LangGraph platform services on an external network. The non-root, read-only, capability
and loopback-publication items above remain in force. See
[ADR 0014](0014-shared-platform-data-services.md).
