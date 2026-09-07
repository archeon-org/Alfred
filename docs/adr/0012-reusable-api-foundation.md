# ADR 0012: Reusable API foundation primitives

- Status: Accepted
- Date: 2026-09-07

## Context

Product CRUD capabilities need common pagination, ownership, errors, retry handling and feature
promotion tests. Keeping these concerns in each feature would duplicate security-sensitive behavior.
The source boundary remains NestJS API, shared framework-free contracts and React/Vite consumers.

## Decision

- Use PostgreSQL keyset pagination on a non-null scalar sort column plus UUID `id`. Build the next
  cursor from the last returned row; an extra row only establishes that another page exists.
  Read timestamps as database text to preserve microseconds. Bind cursor values and resolve sort
  columns through entity metadata. Support full, unjoined entity queries; callers retain ownership
  predicates and stable ordering responsibility.
- Read and mutate owned resources with `id` and `ownerUserId` in one predicate. Reject absent
  ownership inputs before TypeORM can ignore them. Missing and foreign resources share a 404 body;
  mutations require exactly one affected row and cannot change identity or ownership.
- Extend the existing failure envelope with explicit business codes. Ordinary HTTP exceptions keep
  `HTTP_<status>`. Preserve validation-message arrays and the existing bounded readiness details;
  arbitrary 5xx messages and business details remain private.
- Make idempotence opt-in on authenticated finite JSON creation handlers. Reserve `(owner, key)`
  persistently before execution; compare canonical method/path/body hashes, store only completed
  successful JSON responses, and bound contenders' HTTP wait to two seconds. Database time owns the
  24-hour expiry. Retain failed or uncertain reservations until expiry, since a generic interceptor
  cannot know whether a handler already committed a business write.
- Keep implementation readiness separate from environment configuration. Declare reserved product
  flags false and require effective ON/OFF manifest and route behavior before promotion. Test
  helpers construct fresh applications and restore the environment after each case.

## Consequences

These primitives establish no product CRUD, external provider validation or deployed capability.
Idempotence does not provide exactly-once behavior across external effects, database loss or expiry;
handlers requiring atomic recovery must coordinate business writes and the response ledger in one
transaction. Reusing a new key is not reconciliation of an uncertain write. SQL can outlive the HTTP
wait until database timeout. Rolling back the ledger migration deletes retry history and therefore
requires stopping keyed traffic and reconciling outstanding writes before resuming it.

The implementation details and current restrictions are documented alongside the idempotency module
and in the capability delivery guide. Feature-owned code depends on common primitives, never the
reverse.
