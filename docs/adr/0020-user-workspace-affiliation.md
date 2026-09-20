# ADR 0020: One workspace per user without resource sharing

- Status: Partially superseded by ADR 0021 (cardinality, endpoint and affiliation read policy); register reconciliation pending
- Date: 2026-09-10
- Relates to: `ALF-DEC-001`, `ALF-DEC-002`, `ALF-DEC-004`, `ALF-DEC-049`, `ALF-DEC-055`

The single-workspace cardinality and singular lookup below are superseded by
[ADR 0021](0021-multiple-workspace-memberships.md). This record describes the initial migration,
which remains in the migration history; private resource ownership is unchanged.

## Context

The product currently associates each user with one tenant and protects projects by both tenant
and owner. Conversations inherit that protection through their required project, including private
implicit projects for standalone chats. Organizing users into human teams must preserve these
resource boundaries.

The approved increment introduces workspace affiliation only. It explicitly excludes shared
projects, conversations, context documents and skills. The register's accepted `ALF-DEC-055`
historically excludes the Workspace feature from V1. This bounded implementation is an approved
extension of that scope, not a claim that the register has already been amended. Its owner must
reconcile the exclusion; the register itself remains unchanged. Existing `ALF-DEC-003/049`
framework/session discrepancies remain recorded in the memory bank.

## Decision

- A tenant remains the data-isolation root. A workspace represents one human team within a tenant,
  independently of agent teams and LangGraph/LangSmith platform workspaces.
- `api_workspaces` has an opaque UUID primary key, required tenant, slug unique within that tenant,
  display name, active/archived status and timestamps. `(tenant_id,id)` is unique for composite
  references.
- Each user has exactly one required `workspace_id`. Its composite foreign key
  `(tenant_id,workspace_id)` references `api_workspaces(tenant_id,id)` with restricted deletion.
  Keeping the existing user tenant foreign key also preserves the security root explicitly.
- The migration creates a default workspace per existing tenant and backfills users without
  changing user, project or conversation IDs, ownership or content. New accounts receive the
  default workspace of their assigned tenant in the same account-creation transaction.
- Workspaces are affiliation data, not resource owners or ACLs. Projects and skills retain their
  existing tenant/user ownership. Conversations retain their mandatory project relation.
  `findOwnedOrThrow`, project predicates and conversation access rules are not widened.
- `GET /api/users/me/workspace` returns only the authenticated account's tenant/workspace IDs and
  names through a separately validated contract. Existing session and `/users/me` contracts remain
  compatible. No caller-selected user, tenant or workspace grants authority.
- Workspace provisioning is an operator CLI using an explicitly configured database connection.
  Creating, renaming, assigning and archiving use validated inputs and tenant-scoped transactions.
  There is no public administration API, new user role, member directory or self-assignment.
- Reassignment is within one tenant only. A workspace containing accounts cannot be archived.
  Moving a user does not move, publish or delete any resource. Existing account-deletion semantics
  are not changed by affiliation.
- The frontend shows the actual organization/team alongside the personal-space identity. The
  query is account-scoped and revalidated; failed validation/read does not display invented or
  previously authorized affiliation as current. There is no multi-workspace selector.
- This required affiliation is a foundation invariant rather than a switchable collaboration
  capability. The existing `teams` flag continues to represent agent-team functionality and is
  not promoted by this change.

## Deployment and verification

Apply explicit migrations using the normal migration job; do not enable schema synchronization.
The rollout must account for the final required user column: old API writers do not populate it.
Drain old API writers before migrating and start the updated API afterwards. This increment does
not claim a zero-downtime mixed-version rollout. A staged nullable-column rollout would require
separate expand/backfill/contract releases.

Rollback must not silently discard custom workspaces or assignments. Prefer retaining the additive
schema and rolling back only compatible application builds. Review the guarded migration rollback
and retain a backup before a deliberate schema reversal.

Required evidence includes PostgreSQL backfill preservation, required/composite foreign keys,
same-workspace and different-workspace owner isolation, assignment/archive concurrency, onboarding,
authenticated HTTP context and frontend account/error/revalidation behavior. Source/test evidence
does not prove the running deployment was migrated; session records distinguish these boundaries.

## Out of scope

Multiple workspace memberships, tenant transfers, collaborative resources, invitation UI, SSO
organization mapping, new administrators, shared libraries and runtime entitlement changes remain
separate decisions. Suspension of an organization as a global authorization mechanism is not
introduced by this affiliation increment.
