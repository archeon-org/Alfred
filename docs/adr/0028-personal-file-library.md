# ADR 0028: Personal File Library, Extraction and Message Attachments

- Status: Accepted implementation plan, validated by the product owner on 2026-09-18
- Date: 2026-09-18
- Builds on: [ADR 0027](0027-uploaded-file-content-store.md) (byte storage),
  [ADR 0010](0010-capability-flags-and-operational-fallbacks.md) (capability flags),
  [ADR 0022](0022-runtime-chat-bridge.md) and [ADR 0023](0023-durable-execution-streaming.md)
  (runtime bridge and durable executions)
- Architecture constraints: ALF-DEC-002, ALF-DEC-013, ALF-DEC-025, ALF-DEC-028, ALF-DEC-029,
  ALF-DEC-054 and ALF-DEC-055 (`accepted`), ALF-DEC-010 (`accepted-with-risk`), workshop Revision
  86 (owner steering); ALF-DEC-051, ALF-DEC-019 and ALF-DEC-008 (`in-discussion`), ALF-DEC-021 and
  ALF-DEC-023 (`to-decide`, not built).

## Context

The product owner wants to upload PDF, DOCX and image files from the chat, find every file he ever
uploaded in one catalog — searchable, filterable, organized in folders — and attach any of them to
any conversation so that the agent can use it: extracted text for a document, the image itself for
the multimodal model. Six independent reviews of the first step challenged the plan against the
decision register; the owner then settled the eight product questions they raised.

## Decision

### Ownership: a personal library

- Every upload is an `Artifact` of its owner's **personal library** (ALF-DEC-013 `/user`,
  ALF-DEC-002 §6), whether it came from the composer or from the library screen. It is never owned
  by a project: a New Chat has an implicit project that is deleted with the chat, and attaching a
  project-owned file in another project is the cross-project sharing the register defers.
  Sharing with a project stays a later explicit action (ALF-DEC-026).
- Tables (`1789500000000-create-artifacts`): `api_artifacts` (the catalog row and everything a
  list filters on), `api_artifact_revisions` (ALF-DEC-025: an upload creates revision 1),
  `api_artifact_contents` (one stored object, its SHA-256, size, state; also the quota ledger),
  `api_artifact_extractions` (extracted text or reduced image, and the job), `api_artifact_folders`
  and `api_message_attachments`. Owner foreign keys `RESTRICT`: bytes live outside PostgreSQL, so
  a row cascade would orphan stored objects.
- The same bytes are one library entry per owner (`uq_artifacts_owner_sha256`): a second upload
  answers the existing file with `deduplicated: true` and charges nothing.
- Folders are **library metadata** (adjacency list, depth ≤ 8, at most 500 per owner), never
  storage paths: ALF-DEC-054 forbids exposing a physical key, and a rename or move is one row
  update whatever the folder holds. Sibling names are unique case-insensitively; a name clash on
  upload is suffixed « (2) », a clash on rename or move is refused (ALF-DEC-013: "path collisions
  fail rather than overwrite"). Only an empty folder is deleted.

### Upload

- `POST /api/files` is `multipart/form-data`, one file, parsed in memory under explicit bounds
  (size, one file, few short fields), behind a per-user throttler and a per-instance concurrency
  bound. The type is decided from the bytes, never from the name or the declared type: PDF, DOCX
  (a ZIP whose directory is inspected before any inflation — entry count, inflated size, ratio,
  unsafe names, and no `vbaProject.bin`), PNG, JPEG, WebP, GIF. SVG is refused: it can carry
  script. The stored name is cleaned of control, bidirectional and zero-width characters, and its
  extension follows the detected type.
- The write follows ALF-DEC-054's `pending → ready` with quota reservation, in two transactions
  around the byte write, because a write to another system is never part of a PostgreSQL
  transaction (Revision 86). Both run under the owner row lock the skills quota already uses. A
  `pending` content row **is** the reservation and stops counting when it expires; the quota is a
  `SUM`, never a counter, so a point-in-time restore needs no reconciliation. A client `uploadId`
  makes a retry answer the first result.
- Quota (Revision 86): 5 MiB per file and 25 MiB per owner, configurable, counting **original
  bytes only**; derived text and reduced images are capped separately. `GET /api/files/quota`
  exposes used, reserved and limit.

### Extraction

- A queue in PostgreSQL (`api_artifact_extractions`), claimed with `FOR UPDATE SKIP LOCKED` and a
  lease exactly as executions are, off the request path: an upload answers as soon as the bytes
  are stored (ALF-DEC-054 "extraction cannot block AG-UI"). Replicas that share the queue must
  share the store; a worker that cannot see a file's bytes retries instead of condemning it.
- Parsing runs in a short-lived `worker_thread` with a heap limit and a deadline (ALF-DEC-010
  "isolated workers"): `unpdf` with script evaluation and XFA off, a page and character cap;
  `mammoth` for DOCX; `sharp` for images, which refuses a pixel bomb, keeps the first frame of an
  animation, and re-encodes to a reduced JPEG without EXIF or GPS. A parser's own message never
  leaves the worker: only an outcome (`no_readable_text`, `parser_error`, `timeout`, `too_large`).
- Publication is fenced by the lease owner and by the file still existing, so a late worker never
  republishes content for a deleted file (Revision 86).

### Attachments and the runtime

- A message names library files with `attachmentIds`. They are bound inside the transaction that
  creates the user turn (`api_message_attachments`, pinned to the exact revision, ALF-DEC-002 §7):
  all attach or none does; each must be the sender's, not deleted and `ready`; at most 8 files and
  4 images. A message may be attachments only. The submission hash includes the attachments.
- A file is delivered **once**, with the turn that attached it, as LangChain multi-part content the
  orchestrator already accepts; the runtime thread keeps its history. Document text is framed as
  evidence (`<attached_document>`, reserved tags neutralized, a preamble that says not to follow
  instructions found inside) and bounded by ALF-DEC-010: 10,000 tokens per document and 30,000 per
  Execution, allocated in attachment order, the remainder marked truncated. An image is the reduced
  copy as a `data:` URL, never the original. What each file became (`text`, `image`,
  `unavailable`, truncated) is recorded on the attachment row and shown in the transcript.
- The executions module imports a slim `FileAttachmentsModule` — no route, guard or worker.

### Deletion

- `DELETE /api/files/:id` is the owner's explicit purge (ALF-DEC-028 §1), refused while an answer
  is using the file. The catalog row becomes a tombstone, the extracted text is erased, the
  contents turn `purging` and the quota is free at commit; a collector removes the bytes with an
  idempotent delete. Attachment rows are never deleted: a message keeps naming what it carried
  (`available: false`, « fichier supprimé »). There is no trash.

### Browser

- The right-panel tab « Fichiers » is the library, newest first, with search, filters, quota and
  click-to-attach; the full explorer is the route `/app/files`, not a modal, because below 1200 px
  the panel is itself a dialog. Both, and the composer paperclip, disappear when `fileUploads` is
  off, and the API hides every route. Bytes travel through the authenticated HTTP client, since
  the access token lives in memory: a download or a preview is a `blob:` URL
  ([ADR 0029](0029-content-security-policy-blob-images.md)).

## Consequences

- **Deviations for the decision owner.** (1) ALF-DEC-002 §8 and ALF-DEC-013 make a composer upload
  a _project-owned_ artifact; here it is personal, by the owner's decision. (2) Revision 86's brief
  retention is not applied (ADR 0027). (3) ALF-DEC-010 says the remainder of a truncated document
  "remains tool-readable": no `ArtifactBackend` reaches the runtime yet, so a truncation is final
  until a read tool exists. (4) ALF-DEC-054 §7: there is no `ArtifactSearchProvider`; the search
  bar matches names and descriptions, not document content.
- A reduced image sent to a multimodal model stays in the LangGraph checkpoint of the thread,
  because the runtime rewrites the turn only for a text-only planner. It is a bounded, metadata-free
  copy, and checkpoint retention belongs to ALF-DEC-019/051; extracted text that was sent likewise
  survives the file's deletion inside the conversation, which the deletion dialog says.
- The runtime's prompt-injection guard screens the human turn, so a legitimate document that quotes
  an injection attempt may get its turn refused. Delivering evidence in a dedicated message type is
  a runtime change to discuss with its owner.
- In-app preview or editing of PDF and DOCX is not built (ALF-DEC-021/023 `to-decide`); scanned
  PDFs need OCR and are reported as `no_readable_text`.
- User deletion has no route today; when it exists it must purge the library first, since the
  content foreign key restricts.

## Alternatives Considered

- **Project-owned composer uploads, as the register words it.** Contradicts the catalog the owner
  asked for; see Ownership.
- **Folders as S3 key prefixes.** S3 has no rename: moving a folder is a copy and a delete per
  object, non-atomic, and puts user-authored names in keys, provider logs and consoles.
- **A conversation-level placement table.** Deferred: "attached to this conversation" is derived
  from messages, and a chip lives in the composer until the message is sent.
- **Base64 JSON uploads, as skills do.** A 5 MiB file would be a 6.7 MiB JSON body above the JSON
  body limit; multipart is the right transport.
- **An external queue.** PostgreSQL leases already serve executions across replicas.

## Revision 2026-09-20: review corrections — races, durable deletion, bounds and the capability gate

Two implementation reviews of the uncommitted feature, then three read-only reviewers with
disjoint angles, reported defects that were reproduced or confirmed by reading, then corrected
without changing the public contract beyond two error codes. The register records are unchanged
(ALF-DEC-054, ALF-DEC-029, ALF-DEC-010, Revision 86). A fifth deviation for the decision owner
belongs to ADR 0027: production requires an S3-compatible bucket.

**A row is the only record of stored bytes (ALF-DEC-029: the store has no listing), so it must
never be missing while bytes may exist.**

- A content is recorded before its bytes exist, reduced images included: the extraction worker
  inserts the derivative as a `pending` row with a deadline, writes the object, then publishes it
  in the lease-fenced transaction (`ready`, or `purging` when the lease was lost or the file
  deleted).
- An expired reservation leaves in two steps: the collector first turns it into `failed`, and
  removes the bytes and the row ten minutes later. Every store call is bounded far below that, so
  no write can land under a row that is already gone.
- Bytes written under a content that was then not published are never deleted on the spot, where
  a failing delete would lose them for good. One statement (`content-tombstone.ts`) leaves a
  durable `purging` row — inserted when the row is gone, flipped back when a late write landed
  under a `purged` content — and the collector retries the deletion at every sweep. The object is
  deleted directly only if PostgreSQL refuses that row; both failing is logged with the identity.
- The collector skips, for the rest of a sweep, a content the store refuses to delete, instead of
  stopping at it for ever.

**Upload.**

- Two requests carrying one `uploadId` share one content: the second publication answers the file
  its twin published. The upload's duplicate purge and its abandonment only touch a content no
  revision references, and an abandonment is fenced by the deadline that request wrote, so it
  spares a twin that took the reservation over. A replayed identity is read `FOR UPDATE`, since
  the collector may be removing it; it is admitted against the quota again once its reservation
  failed or expired, and a replay whose first answer was a deduplication gets the same file.
  Publication requires a reservation that has not expired.
- An upload slot is taken before the multipart body is read (`UploadSlots`), two per account at
  most (`FILE_MAX_CONCURRENT_UPLOADS_PER_USER`, which the web queue also uses), refused with
  `503 upload_busy`. The body has a deadline sized from the file limit (64 KiB/s, thirty seconds
  at least). Startup validation bounds `FILE_UPLOAD_MAX_BYTES × FILE_UPLOAD_MAX_CONCURRENT` to
  128 MiB; the per-file limit is capped by `FILE_MAX_BYTES_CEILING` (25 MiB), from which the web
  proxy limit of the upload route is sized (26 MiB, body streamed, a test ties the two).
- A request its browser abandoned publishes nothing. Listening starts in the interceptor, before
  the body is read — a listener attached by the handler would miss a connection closed between
  the end of parsing and the handler — and the signal is checked before the write, after it and
  as the last statement of the publishing transaction (`499 upload_cancelled`; a parser error
  caused by the client leaving is that answer too, not a 500). The web reads the library again
  after removing an upload in flight.

**Messages and dispatch.**

- The capability is checked where attachments are handled: `MessageAttachmentsService` refuses to
  bind, list or deliver while `fileUploads` is off (fail closed without the flag registry), and
  the executions service asks before it opens its transaction.
- `@ValidateIf` was switching off every validator of `message` — type and maximum length
  included — as soon as a file was attached; "non-empty unless a file is attached" is now a
  constraint of its own.
- Attaching holds the file rows `FOR SHARE`, which serializes with a deletion's `FOR UPDATE`:
  either the file is not found, or the deletion answers `file_in_use`. The extraction worker locks
  the catalog row before the extraction row, as a deletion does, so the two cannot deadlock.
- Dispatch reads a turn's reduced images together, under one 15 s budget and the execution's own
  signal. A failure of that local read proves no run was requested: the client reports
  `runtime_not_dispatched` and the processor puts the invocation back to `pending`, instead of
  inspecting until its deadline a run that was never created. Any other dispatch failure stays
  uncertain and is never dispatched again (ADR 0023 unchanged).
- An observer reads a turn's attachments once, at attach, not at every 500 ms poll; the delivery
  outcome recorded at dispatch therefore reaches the browser with the message list.
- A publication failure in the extraction worker is an attempt like any other, bounded by the
  three attempts, instead of a job re-claimed at every lease expiry.
- `sharp` is pinned to 0.35.4 (two high-severity advisories on 0.34.4).

Residual, accepted: a request abandoned while its twin of the same `uploadId` writes under a
deadline it wrote itself makes the twin answer `409 file_upload_conflict`, and the retry succeeds;
deliveries are recorded before the runtime accepts the run; dispatch image memory has no startup
envelope (bounded at the defaults); `worker_threads` does not bound the native memory of the
parsers; downloads and previews load the whole object in memory; no CI job runs the suites
against a real S3-compatible server.
