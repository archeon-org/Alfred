# ADR 0014: Shared Platform Data Services and Prefixed API Tables

- Status: Accepted
- Date: 2026-09-09
- Supersedes: the PostgreSQL/Redis provisioning, role and network items of
  [ADR 0004](0004-self-hosted-runtime-isolation.md)
- Amends: the `citext` and table-naming consequences of
  [ADR 0003](0003-authentication-and-persistence.md); the Redis provisioning note of
  [ADR 0010](0010-capability-flags-and-operational-fallbacks.md)

## Context

Alfred's PostgreSQL and Redis were provisioned by this repository: a pgvector-based image,
idempotent bootstrap and grant jobs, four logical databases and least-privilege login roles. The
LangGraph platform now runs from the sibling `langgraph-agent-repo` checkout, whose Compose stack
already provides PostgreSQL 16 (`langgraph` database) and Redis on its own network. Running two
database stacks duplicated data services, credentials and volumes for the same local product, and
the API could not share persistence with the runtime it will call.

The target-architecture register keeps `ALF-DEC-007` (persistence) and `ALF-DEC-054` (app/data
plane) accepted and `ALF-DEC-019` (operations) in discussion; the latter states that sharing one
PostgreSQL service must not merge product and runtime roles, migrations or lifecycle. This ADR
implements a local development and integration topology; it does not decide production roles.

## Decision

- This repository no longer provisions PostgreSQL or Redis. `infra/postgres`, the `postgres`,
  `postgres-bootstrap`, `postgres-runtime-grants`, `redis` and `agent-redis` services and their
  volumes are removed from both Compose files.
- Containers reach the platform services on the pre-existing external Docker network named by
  `DATA_NETWORK` (default `langgraph-agent-repo_agent-network`) as `postgres` and `redis`. Host
  processes use the loopback ports the platform stack publishes. `DATABASE_URL` and `REDIS_URL`
  are passed verbatim from the root `.env` to `migrate` and `api`.
- The API stores its tables in the platform's `langgraph` database, in schema `public`, next to
  the LangGraph runtime tables. Every API-owned table carries the `api_` prefix, including the
  TypeORM ledger `api_migrations`. Entity metadata names the prefixed tables explicitly; the
  `PrefixApiTables1788979000000` migration renames the tables created by the earlier migrations.
  Constraint and index names already embed their table name and are unchanged.
- The migration ledger, not infrastructure, installs the only required extension with
  `CREATE EXTENSION IF NOT EXISTS "citext"`; the migration credential must be allowed to create
  that trusted extension. The concurrent replacement-index migration repairs its index on either
  the original or the renamed table so a ledger retry after the rename still converges.
- `migrate` remains a one-shot job built from the API image; `api` starts only after it succeeds.
- The standalone Agent Server overlay receives `AGENT_DATABASE_URI` and `AGENT_REDIS_URI` from the
  environment and must target a database and Redis logical database reserved for it, never the
  `langgraph` database owned by the platform's own server. `apps/agent` is otherwise unchanged.

## Consequences

- One local PostgreSQL and one Redis serve the platform and the product API. Tables are visible
  side by side in any client; the `api_` prefix identifies the backend's objects.
- Least-privilege separation between a schema-owner and a runtime role is no longer provisioned
  here. Local development and the extended CI job use the platform's `postgres` superuser for
  both migration and runtime connections. A deployment must inject a dedicated migration role
  and a DML-only runtime role through `DATABASE_URL`; the PostgreSQL integration suite skips the
  role-separation assertion when both test URLs share one role.
- Redis is unauthenticated on the local platform stack. The production configuration contract
  still requires a password in `REDIS_URL` while rate limiting is enabled.
- Databases created by the removed in-repo cluster (`alfred_app`, `alfred_test`, `alfred_blobs`,
  `alfred_langgraph`) are not read or migrated automatically. Their retained volume can be deleted
  or exported explicitly.
- CI cannot rely on the sibling checkout; the extended workflow starts disposable `postgres:16`
  and Redis containers on a throwaway network with the same aliases and database name.
- Backup, PITR and lifecycle separation between product and runtime data remain open under
  `ALF-DEC-019` and are not settled by this local topology.
