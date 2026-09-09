# ADR 0016: Conversation metadata and lifecycle

- Status: Accepted implementation plan; delivery proceeds in verified increments.
- Date: 2026-09-10
- Applies: `ALF-DEC-001`, `ALF-DEC-002`, `ALF-DEC-004`, `ALF-DEC-055` (accepted).
- Related: [ADR 0015](0015-tenant-projects-conversations.md) and the
  [target decision register](../creative_phase_2026-07-29_post_poc_decision_workshop.md).

## Context

Conversations already have stable product IDs, one required Project relationship, creation and
deletion APIs. Their ownership derives from the Project's tenant and human owner. Users also
need persistent names and navigation pins, actions in every conversation list, and paged access
to older chats.

## Metadata decision

- Add nullable `api_conversations.pinned_at` with an additive migration. Existing rows are
  unpinned. Pinning is a navigation preference, not artifact retention or a runtime capability.
- `PATCH /api/conversations/:id` accepts a validated non-null `title` and sets `title_source`
  to `user`. `POST /pin` and `/unpin` under the same conversation resource are idempotent by
  state; repeating a pin preserves its timestamp.
- Every mutation derives owner scope on the server, locks the parent Project before the
  Conversation and revalidates the relationship after waiting. Browser IDs never establish
  authorization. Missing and foreign resources remain indistinguishable.
- Lists order pinned chats first, then creation time descending and UUID descending. Pin time
  itself does not reorder pinned chats. The opaque keyset cursor preserves PostgreSQL timestamp
  precision and covers pin priority, timestamp and UUID. Pinned rows are paginated rather than
  silently limited to a fixed maximum. `projectKind` can restrict a list to standalone chats.
- Creation time remains the recency key while no product messages/activity are implemented.
  The richer activity ordering of CONV-02 requires the message delivery slice.
- The web reuses shared menus and dialog primitives, keeps server state in account-scoped query
  caches, and invalidates list/detail state after a mutation. Deleting the open chat returns to
  its named project or to the workspace home for a standalone chat.

## Transfer decision and register reconciliation

The accepted implementation plan also includes transferring a standalone Conversation to an
existing named Project of the same owner and tenant, preserving the Conversation ID. This is an
explicit product exception to `ALF-DEC-034` section 5 and the lifetime Project identity clause of
`ALF-DEC-002` section 3, not the promotion operation described by PRJ-05. The exact-one-Project
invariant and product-plane authorization remain binding. The register is not silently amended;
its owner must reconcile those clauses.

- `POST /api/conversations/:id/move` takes a validated destination `projectId`. The API derives
  ownership from the authenticated principal and requires an active named destination belonging
  to the same owner and tenant. Moving between named projects or back to an implicit project is
  outside this increment.
- The transaction locks source and destination Projects in deterministic UUID order before the
  Conversation. It revalidates the parent after waiting, changes the parent relationship and
  removes the emptied implicit source. Conversation identity, title, creation time and pin remain
  intact. A retry toward the same destination has no additional effect; concurrent conflicting
  destinations cannot both succeed.
- Source context, description, unexpected name or project pin, and additional conversations prevent
  cleanup and therefore prevent transfer. The operation must never delete those resources as an
  incidental cascade. Once product
  messages, artifacts, Executions or runtime bindings exist, their lifecycle and context policy
  must be resolved before extending this operation.
- The browser preserves the open Conversation route and draft, refreshes its detail and list
  caches, and resolves the destination Project through the existing authorized detail API.
  The destination's project context is the product context for future runtime integration;
  this transfer does not invoke an agent or inject a prompt.

Infinite scrolling in pages of ten with loading skeletons is the following web increment.
It does not enable sending messages, runtime bindings, agents, artifacts or memory projection.
`ALF-DEC-010/012` remain the accepted-with-risk authority for eventual context resolution; the
operational/retention questions under `ALF-DEC-019/051` are not resolved by this ADR.

## Deployment and rollback

Run the new migration once before deploying the API that reads `pinned_at`, then deploy the web
application that expects the expanded Conversation contract. The previous API may retain the
additive column unused. Reverting this migration removes navigation pin preferences, so it is
not required for an application-only rollback. Conversation IDs and creation data are unchanged.

Verification includes owner/tenant denial, invalid inputs, metadata persistence, pin idempotence,
pagination past one page, timestamp precision, migration up/down/up and web action journeys.
Fresh results belong in the session record, not in this design decision.
