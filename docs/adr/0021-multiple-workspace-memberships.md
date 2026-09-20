# ADR 0021: Multiple workspaces within one tenant

- Status: Accepted implementation scope; register reconciliation pending
- Date: 2026-09-10
- Supersedes: the single-workspace cardinality in [ADR 0020](0020-user-workspace-affiliation.md)
- Relates to: `ALF-DEC-001/002/004/049/055`

## Context

A user can belong to several human teams in the same organization. Each user still has exactly
one tenant, and all projects, conversations, context and skills remain private to their existing
owner. Team membership never grants access to a colleague's resources.

The previously approved single-team migration has already been applied locally. Its history must
not be rewritten. The explicitly approved cardinality correction is a new migration, preserving
existing affiliations and resource IDs/content. The register's historical V1 Workspace exclusion
remains an owner reconciliation item, as in ADR 0020; the register is not amended by this change.

## Decision

Create an explicit TypeORM `WorkspaceMembershipEntity` for `api_workspace_memberships`:

| Column / constraint                                            | Purpose                                                                                  |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `user_id`, `workspace_id`                                      | Composite primary key: one link per user/team pair                                       |
| `tenant_id NOT NULL`                                           | One shared tenant value constrains both referenced objects                               |
| `(tenant_id,user_id)` FK → `api_users(tenant_id,id)`           | Membership must use the account's tenant; user deletion cascades its links               |
| `(tenant_id,workspace_id)` FK → `api_workspaces(tenant_id,id)` | Workspace must belong to that same tenant; deleting a referenced workspace is restricted |
| `created_at`                                                   | Creation time of the membership                                                          |
| Index on `(tenant_id,workspace_id)`                            | Team membership checks and archive protection                                            |

This is a many-to-many domain relation. The explicit join entity uses two `@ManyToOne` relations
with composite `@JoinColumn` decorators, rather than an automatic `@ManyToMany/@JoinTable` that
hides the additional tenant column and integrity requirements. One user can have any number of
distinct rows, but changing `tenant_id` in a forged row cannot satisfy both foreign keys when the
two objects belong to different tenants.

`@Check` remains appropriate for row-local values such as workspace status. It is not used to
look up another table's tenant, directly or through a function. PostgreSQL recommends foreign
keys for continuously enforced cross-table restrictions. NestJS delegates entity/relation handling
to TypeORM; migrations remain explicit and `synchronize` remains disabled.

## Lifecycle and contracts

- A new migration backfills one membership from every existing `api_users.workspace_id`, then
  removes that old column, relation and index. `api_users.tenant_id` remains required and unchanged.
- Account creation inserts the default membership in the same transaction as the account and
  identity. Later logins preserve all memberships. Supported removal refuses to remove the final
  membership. These lifecycle rules enforce the normal at-least-one policy in application
  transactions; the two foreign keys alone do not prohibit a user with zero membership rows.
- Operator `assign` now adds a membership idempotently; it never replaces another. `unassign`
  removes only the specified membership and protects the last one. Tenant/workspace/user locking
  serializes supported membership mutations. Workspace archival checks the junction table,
  including links from disabled accounts, and still refuses the default workspace.
- `GET /api/users/me/workspaces` returns `{tenant: {id,name}, workspaces: [{id,name}]}` for the
  authenticated account. The internal singular endpoint and its consumer are replaced together.
  The response contains active teams only, sorted by French name collation and then ID to keep
  homonymous teams in a deterministic order. The frontend displays all affiliations with a bounded
  collapsed list and a way to expand it, without selecting a resource owner or widening access.
- Tenant suspension is not a global authorization policy in this increment and does not reject
  this informational read alone. The authenticated user must still be active. An internal
  affiliation-integrity anomaly is not reported as an authentication failure.
- Affiliation display uses an account-scoped cache with bounded freshness and stale-only
  mount/focus revalidation, without periodic polling or refresh-token-driven reloads. A transient
  transport/server failure may retain that account's last received display data with an explicit
  refresh warning. Authentication/authorization failures hide the cached display. These names
  never authorize resource access.
- No active/default team preference is invented for resource queries. Personal projects and
  standalone chats continue to use the same owner/tenant predicates and implicit project model.
- Rollback requires exactly one membership for every remaining user before restoring the old
  column. Zero or multiple memberships cause rollback to fail instead of discarding data or
  arbitrarily selecting a team.

## Verification and rollout

Test valid memberships to several teams, foreign-key rejection on both sides of a forged tenant,
duplicate links, default enrollment, additive assignment, last-link removal, concurrent removal/
archive behavior, migration data preservation, guarded rollback and TypeORM schema parity on a
disposable PostgreSQL database. Re-run owner-isolation HTTP tests between team colleagues and
other tenants. Verify account cache isolation, empty/error states and responsive team display.

Build API/migration images, drain old API writers, back up API tables, apply the new migration,
check schema drift, recreate the compatible API and verify readiness. Release its plural endpoint
with the matching frontend. Old binaries reference the removed column, so this is a coordinated
maintenance rollout rather than a mixed-version deployment. Record actual local deployment
separately from tests and from any production claim.

## Primary documentation consulted

- [NestJS database integration](https://docs.nestjs.com/techniques/database): TypeORM integration
  and explicit warning against production schema synchronization.
- [TypeORM many-to-many with custom properties](https://typeorm.io/docs/relations/many-to-many-relations/#many-to-many-relations-with-custom-properties): explicit join entity with two many-to-one relations.
- [TypeORM join columns](https://typeorm.io/docs/relations/relations/#joincolumn-options): joining
  multiple columns with explicit referenced column names.
- [PostgreSQL 16 constraints](https://www.postgresql.org/docs/16/ddl-constraints.html): row-local
  `CHECK` semantics and composite foreign keys for cross-table integrity.
