# ADR 0018: Product-owned personal skills catalog

- Status: Accepted implementation plan, validated on 2026-09-10.
- Date: 2026-09-10
- Applies: `ALF-DEC-001/004/013/055` (accepted), `ALF-DEC-010/050`
  (accepted-with-risk).
- Implements the validated personal CRUD slice of `ALF-DEC-011` (still `to-decide`
  in the register). The register owner must reconcile that record; this ADR does
  not change its status or accept organization-wide publishing policy.

## Ownership and format

NestJS owns the authenticated product catalog and PostgreSQL persistence. React
uses the same-origin Product API. LangGraph Store is not the canonical catalog.
This maps the register's historical BFF vocabulary to the existing React/Vite and
NestJS split, preserving the known framework/session reconciliation items.

One skill is a package with a root `SKILL.md` and optional relative files such as
scripts, references and templates. A single Markdown file is the smallest package.
The frontmatter follows the [Agent Skills specification](https://agentskills.io/specification)
with a name and description. Package content never grants tools, credentials or
data access. Files are opaque stored content; importing and publishing do not
execute them.

`api_skills` holds stable identity, tenant, owner and optimistic write version.
`api_skill_versions` holds immutable package snapshots and draft/publication state.
`api_skill_files` stores exact file bytes per snapshot in PostgreSQL `bytea` with
relative paths and metadata. Publication and package writes are transactional.
Skills are global within their owner account, independent of conversations. The user explicitly
rejected per-conversation selection on 2026-09-10; its API, contracts and persistence are removed.

The personal catalog is isolated by authenticated tenant and user, derived
server-side. A caller cannot select another owner or tenant in request fields.
Missing and foreign resources have indistinguishable not-found behavior.
Updates, publication and deletion require the observed version; stale requests
perform no mutation. Retained versions count toward the same user storage quota.

## Import and limits

Markdown and ZIP imports are processed into an explicit browser draft. Saving
sends a bounded JSON package containing base64 file contents; the server validates
every file independently of browser checks. ZIP decoding is bounded by actual
expanded bytes and file count. Absolute paths, traversal, backslashes, duplicate
paths, symbolic links and unsupported archive features are rejected. YAML aliases
and unsupported tags cannot expand the parsed frontmatter. Active HTML is never
rendered from imported file content.

Initial configurable limits are 50 files, 1 MiB decoded bytes per package,
128 KiB for `SKILL.md`, and 25 MiB per user across retained versions. Startup
validation rejects inconsistent limits. These are implementation defaults for the
skills catalog, not new architecture-wide artifact quotas or retention decisions.
Transport limits account for base64 and JSON overhead. Changing the user quota
does not automatically erase existing content.

These controls follow the [OWASP file upload guidance](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html).
They do not claim antivirus scanning or safe execution of uploaded scripts.

## Lifecycle and capability boundary

The `skills` product flag exposes the global catalog and authoring
only when configured and implemented. Flag OFF hides the surface and rejects its
API routes. It remains independent of `agentRuntime` and `fileUploads`: this slice
does not implement general artifact upload or invoke an agent.

An explicit confirmed delete purges the personal skill, its retained bytes transactionally. This immediate policy is valid only while no
runtime projection, execution lease or historical attachment references these
packages. Introducing those references requires a revocation and durable cleanup
contract before reusing the deletion path. Schema rollback must refuse to discard
authored skills without an explicit export/deletion decision.

Later runtime work must authenticate the Product service, resolve trusted
Execution ownership, expose only authorized skill packages under `/skills`, and
observe current publication/revocation through the accepted Context Epoch rules.
Store may become a rebuildable compatibility projection after a measured adapter
experiment. It must never become a second writable catalog.

### Personal lifecycle extension (authorized 2026-09-10)

Owned history is paginated by descending immutable snapshot version (`before`,
exclusive; default limit 20, maximum 100). As corrected by the user on 2026-09-10,
restoration requires CAS and selects the existing snapshot as current, without copying bytes,
creating a version or deleting later history. It restores name and description and retains the
published pointer until explicit publication. CAS revisions remain monotonic independently of
snapshot numbers. Subsequent package edits allocate the greatest retained snapshot number plus
one, even after rollback. Restoring the current snapshot is a no-op after CAS. Historical-name
collisions roll back the whole transaction. Restoration does not consume additional package quota. An additive migration allows the published
pointer to exceed the current pointer while keeping both bounded by the monotonic CAS revision.
Its down migration refuses incompatible pointers instead of rewriting user state.

Availability defaults to enabled. A real availability change increments the CAS
version without creating a package snapshot. Disabled skills remain editable and visible in the owner's catalog but are excluded from the
global available-skills panel. No conversation bindings are created or removed by availability.
These are product-only operations, with no runtime projection or execution behavior.

The corrective removal migration drops only `api_conversation_skills`, preserving skills,
versions, file bytes and conversations. Historical migrations stay unchanged; reverting the
removal recreates an empty association table and cannot recover discarded selections.

An additive migration adds availability and snapshot creation timestamps without
changing the original migration. Preexisting snapshot creation times were not
recorded; their backfill is migration time, not a reconstructed historical date.
New snapshots record their own creation time. Lifecycle rollback refuses to
silently discard metadata while authored skills remain.

## Open work and verification

Script execution requires a separately controlled sandbox and dependency/resource
policy. Organization sharing, autonomous skill creation, retention/expiry schedules
(`ALF-DEC-019/051`, in discussion), and in-flight capability snapshots
(`ALF-DEC-038`, in discussion) are not silently implemented by this CRUD slice.
Deferred MCP/OpenAPI infrastructure is not introduced.

Verification covers tenant/user isolation, atomic snapshot writes,
concurrent CAS and quota enforcement, SQL constraints and migration parity,
malicious packages and byte-faithful round trips, draft/conflict recovery,
responsive keyboard-accessible authoring and both feature-flag states. Runtime
and deployment evidence must be reported separately from mocked browser tests.
