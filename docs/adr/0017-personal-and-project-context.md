# ADR 0017: Personal and project context documents

- Status: Accepted implementation plan, validated on 2026-09-10.
- Date: 2026-09-10
- Applies: `ALF-DEC-001/002/004/049/055` (accepted), `ALF-DEC-010/012/050`
  (accepted-with-risk).
- Related: [ADR 0015](0015-tenant-projects-conversations.md),
  [ADR 0016](0016-conversation-lifecycle.md) and the
  [target decision register](../creative_phase_2026-07-29_post_poc_decision_workshop.md).

## Context

Each person needs instructions and response preferences that apply across their own conversations.
Each project adds descriptive context and project-specific preferences. These are explicit product
documents, independent of automatically learned runtime memory. The global scope means the signed-in
person, never every user of an installation.

The existing project description overlaps with context in the interface. Its historical contents
must survive removal of the editor. Existing project context must also survive migration.

## Product storage and authorization

The API owns a semantic context-document repository backed by PostgreSQL. A document has exactly
one parent, a user or a project, and an allowed kind. Personal kinds are instructions and
preferences; project kinds are context and preferences. SQL constraints enforce parent exclusivity,
allowed kinds, foreign keys and one document per parent and kind. Ownership and tenant scope come
from the authenticated principal and authorized parent rather than browser-supplied scope fields.

Documents retain current content, a monotone revision, a SHA-256 content hash and timestamps.
An absent document has revision zero. Writes require the observed revision and reject stale
edits, including stale identical content. A current identical write is a no-op. Clearing a document
retains its row and advances its revision, preventing an old draft from matching a recreated
revision. No unbounded content history is introduced. Logs contain metadata, never private text.

Project and user deletion cascade to their documents. A standalone-conversation transfer must not
delete an implicit project containing nonempty documents. Empty documents left after an explicit
reset do not by themselves prevent transfer. Existing source metadata guards still apply.

## Editing and import

The private `/app/settings` page contains the existing display controls and two personal editors,
named Instructions générales and Préférences de réponse. Project editors expose Contexte du projet
and Préférences du projet. The project description is removed from the interface; its historical
database contents are retained. Display controls keep their existing session-local behavior.

Each editor supports explicit save, a safe Markdown preview and `.txt`/`.md` import into a draft.
The browser validates extension, byte size, UTF-8 decoding and NUL exclusion before accepting a
file. Import does not persist the original file, filename, path or blob. Only text is sent on save.
CRLF is normalized to LF; inputs are never silently truncated. The API remains the validation
authority and exposes its configured limit, initially 64 KiB per document. Request-body limits
must accommodate JSON escaping as well as decoded text size.

Modified drafts survive failed saves and conflicts. Replacing a modified draft by import or
navigation requires an explicit discard choice. A conflict requires reloading the current version
before a new write rather than silently retrying against a newer revision.

## Future runtime boundary

A server-side resolver takes a trusted principal and an authorized conversation and derives the
current project relationship. It returns four separate typed sources, with provenance, revisions,
content hashes and a composite fingerprint covering scope and kind as well as content. Reads must
be coherent with concurrent transfers and saves.

Personal instructions, personal response preferences and explicit project preferences are user
directives. Descriptive project context is evidence. Text never grants authorization. The future
runtime adapter must reuse this product scope mapping after trusted identity resolution; the
browser cannot submit an authoritative assembled context or choose runtime namespaces.

This increment does not invoke agents, flatten sources into a prompt, implement Context Epochs or
enable the reserved runtime-memory capability. Versions and fingerprints prepare those later
integrations. Retention and operational questions under `ALF-DEC-019/051` remain in discussion;
rich document editors and deferred MCP/OpenAPI capabilities remain outside this decision.

## Migration and compatibility

Existing project context is migrated unchanged to the canonical document store. The legacy project
column remains a read-only compatibility mirror, synchronized in the same transaction as a
versioned document write. Initial project creation can seed both values atomically. Legacy PATCH
writes to context are rejected with `context_revision_required`, preventing a revision bypass.
Historical
description is preserved without converting it into directives. Removing the description editor
does not authorize deleting its data.

A legacy column alone is not a rollback plan: rollback must preserve the latest canonical project
context and control old unversioned writers. Personal instructions and project preferences have
no legacy destination, so destructive schema rollback requires an explicit export and retention
decision. The deployment runbook records the actual migration behavior and supported sequence.

## Register reconciliation

The accepted typed-plane rules in `ALF-DEC-010` distinguish these manually authored response
preferences from evidence learned by memory. Earlier local story proposals that mapped preferences
to learned facts or all project context to instructions do not define this feature's semantics.
No existing runtime projection is being reclassified because these product fields were not wired
to an agent. `ALF-DEC-012` requires shared product-owned semantics, not a browser-facing LangGraph
Store API.

The existing React/Vite and NestJS boundaries remain despite the register's Next.js vocabulary
under `ALF-DEC-003`. Existing session authentication also remains; the discrepancy under
`ALF-DEC-049` is not resolved by adding settings. The register itself is unchanged.

Verification must include database constraints, migration fidelity and drift, concurrent saves,
ownership denial, coherent conversation resolution, transfer cleanup protection, valid and invalid
imports, conflict recovery, navigation protection and responsive authenticated page journeys.
