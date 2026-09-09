# ADR 0015: Tenant root, projects and conversations as product resources

- Status: Accepted
- Date: 2026-09-09
- Implements: `ALF-DEC-001`, `ALF-DEC-002`, `ALF-DEC-004`, `ALF-DEC-034`, `ALF-DEC-055` of the
  [target-architecture register](../creative_phase_2026-07-29_post_poc_decision_workshop.md)

## Context

The workspace showed fictional projects and conversations. The register makes the product plane
the owner of durable resources (`ALF-DEC-001`), defines Project as the ownership, authorization and
shared-context boundary with one human owner (`ALF-DEC-002`), requires product-plane object
authorization with an identical 404 for missing and foreign resources (`ALF-DEC-004`), gives every
Conversation exactly one Project with a private implicit Project for standalone chats
(`ALF-DEC-034`), and adds a minimal Tenant isolation root from the first release (`ALF-DEC-055`).
The reusable API foundation of [ADR 0012](0012-reusable-api-foundation.md) already provides
pagination, ownership predicates, business errors and opt-in idempotence.

## Decision

- `api_tenants` is the isolation root. The `CreateTenants` migration bootstraps one `default`
  tenant, adds `api_users.tenant_id NOT NULL` with a `UNIQUE (tenant_id, id)` constraint, and new
  accounts receive the default tenant at creation. No tenant administration surface exists.
- `api_projects` carries `tenant_id` and `owner_user_id` with a composite foreign key to
  `api_users (tenant_id, id)`, so an owner cannot belong to another tenant. `kind` distinguishes
  `named` projects from the `implicit` shell created for a standalone chat; implicit shells never
  appear in the project list. `description` (2,000 characters) and `context` (64 KiB of Markdown)
  are the project's two user-edited documents. `status` reserves `archived` and `deleting` for the
  archive and asynchronous-cleanup stories without another migration.
- `api_conversations` belongs to exactly one project through a cascading foreign key and stores no
  runtime thread identifier; runtime bindings remain a later, private concern.
- Every product command derives the owner scope server-side from `api_users` through
  `TenantsService.scopeFor`, then applies `tenant_id + owner_user_id + id` in one SQL predicate
  through the shared ownership helper. Conversations inherit authorization from their project with
  an `EXISTS` filter so cursor pagination keeps working on unjoined entity queries.
- Project deletion is the immediate transactional variant of story PRJ-06 (option C1): a row lock
  followed by SQL cascade, valid while no artifact, runtime binding or Execution exists. The
  asynchronous variant with receipts is deferred to the artifact stories under `ALF-DEC-019/051`.
- Creation endpoints use `@Idempotent()`; the browser generates one key per user gesture.
- A project can be pinned by its owner: `api_projects.pinned_at` records the moment of pinning
  under a partial index, `POST /api/projects/:id/pin` and `/unpin` are idempotent and refused on
  implicit shells, and `GET /api/projects?pinned=true` returns the pinned list in pin order while
  `pinned=false` pages through the others. Pinning is a per-owner presentation preference of the
  project; no register record covers it and it changes no ownership or context semantics.
- The web application replaces the preview fixtures with services, TanStack Query hooks and three
  routes (`/app`, `/app/projects/:projectId`, `/app/conversations/:conversationId`). Confirmation,
  single-field and Markdown-document dialogs, the dropdown "⋯" action menu and the project
  action menu are shared primitives under `components/ui` and `components/workspace/project`;
  Markdown renders through a typed parser into React elements, never through HTML injection.
  The navigation shows pinned projects first, then three recent projects with on-demand paging;
  a project row opens the project home and the header scope name links back to it.

## Consequences

- The tenant is resolved by one indexed read per product command instead of a JWT claim; adding a
  `tid` claim (story CORE-07) is a later optimization that requires revising ADR 0003.
- Existing database fixtures and any future user insert must provide a tenant.
- Sending messages, message history, Executions and runtime threads are not part of this slice;
  the composer stays inert and a project input only opens a titled chat that carries its draft in
  memory.
- Archive, promotion of an implicit shell into a named project, and the asynchronous deletion
  path remain open follow-ups; the schema already reserves their states.
- The known `ALF-DEC-003` (Next.js wording) and `ALF-DEC-049` (opaque cookie only) reconciliation
  items in [decisions.md](../memory-bank/decisions.md) are unchanged by this ADR.
