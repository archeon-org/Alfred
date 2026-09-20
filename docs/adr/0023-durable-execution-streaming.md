# ADR 0023: Durable execution and resumable observation

- Status: Accepted corrected implementation scope; deployment conformance remains separate
- Date: 2026-09-14
- Supersedes: ADR 0022's disconnect cancellation and native browser payload
- Implements: `ALF-DEC-006` (`accepted-with-risk`), `ALF-DEC-007/032/033` (`accepted`)
- Scope correction: changes belong to Alfred; the existing LangGraph platform remains unchanged

## Context and scope correction

[ADR 0022](0022-runtime-chat-bridge.md) connected the first browser/API/runtime chat slice.
Its request-owned execution cancelled work when the observer disconnected, had no replay cursor,
and could mistake a clean stream EOF for successful execution. A heartbeat alone cannot establish
safe multi-minute execution.

The initial hardening implementation added a dedicated runtime ingress, authentication, callback,
dispatch ledger and deployment profile in the sibling repository. That exceeded the intended
streaming scope and introduced startup requirements incompatible with the existing Alfred Docker
configuration. The corrected scope removes those additions and hardens only Alfred's two
connections: browser to Product API, and Product API to the existing native LangGraph service.

The [decision register](../creative_phase_2026-07-29_post_poc_decision_workshop.md), especially
DEC-006 and Revision 83, requires native resumable SSE plus an independently durable Product
projection. DEC-007 owns visible history in Product; DEC-032/033 separate Conversation, binding,
Execution and invocation identities. Product/BFF maps to NestJS and the browser to React/Vite.
The existing framework/session reconciliation items in
[decisions.md](../memory-bank/decisions.md) remain unchanged.

DEC-050 and Revisions 65/68 remain `accepted-with-risk` target constraints for service
authentication and trusted Execution resolution. Their implementation is explicitly excluded from
this correction. Retaining the platform's existing authentication is not a claim of DEC-050
conformance, and this ADR does not amend that register decision.

## Decision

### Commands, native integration and durable ownership

`executions` owns submission, persistence, the native runtime adapter and recovery. `stream` owns
public observation, authorization renewal and SSE framing. The browser consumes shared Product
schemas. No new runtime service, agent profile, authentication hook or native storage component is
introduced outside Alfred.

`POST /api/conversations/:id/executions` accepts a bounded message and UUID `submissionId`.
The same authorized submission and response profile return the original Execution; different
input with that identity fails with `idempotency_conflict`. One transaction persists the user
turn, immutable owner/tenant/project scope, invocation UUID, binding generation, runtime-thread
UUID, dispatch intent and absolute deadline. Active-Conversation uniqueness and admission checks
bound concurrent work. Conversation identity remains separate from its native thread.

A Product worker scans durable intents independently of subscribers. PostgreSQL leases carry an
owner, version and expiry; every projection write checks that fence, invocation, generation and
current resource authority. API shutdown detaches processing; a successor resumes committed state.

The Alfred adapter calls the existing native thread/run/status/join/cancel APIs directly and
requests their supported resumability and continuation options. Runtime identifiers and stream
positions remain private. It uses native metadata to reconcile the same invocation after a lost
creation acknowledgement. Once a run-creation request may have been accepted, an empty search or
transport timeout never authorizes a second POST. An unknown outcome stays unresolved and retains
the Conversation reservation. This deliberately favors no duplicate work over speculative retry;
it does not claim exactly-once external tool effects.

### Projection, replay and completion

For each accepted native event, one Product transaction commits the serializable reducer, source
watermark, canonical event digest, projection revision, visible text and transcript row. Repeating
the last committed source ID is a no-op only for identical content; conflicting reuse enters
`recovery_required`. There is no second token-event journal or Product replay broker. Heartbeats
do not advance semantic cursors or become saved activity.

Only the Product worker consumes native replay. `GET /api/executions/:id/events` observes its
durable projection: one coherent persisted snapshot, followed by changed cumulative snapshots
over SSE. Backend reads are serialized at a 500 ms interval and bounded; the frontend does not
poll HTTP. Browser reconnection therefore does not depend on the native event-retention window
while Product projection continues. Intermediate snapshot revisions can be coalesced; this
contract preserves the bounded cumulative text/activity state, not an archive of every native
event or transient revision.

Encrypted, authenticated cursors expire and bind the Execution, invocation, generation and
schema/projection versions. Authorization precedes cursor validation; possession grants no access.
A cursor ahead of persistence cannot skip the worker's missing native source. Stable revisions
and message/activity identities deduplicate public snapshots. If the worker loses native evidence
before projecting it, the gap stays explicit instead of silently joining the live tail or rerunning
work. Long browser disconnection and long API-worker outage are different recovery cases.

Native creation and join select matching retained message/update modes. Known native namespace
suffixes are parsed inside bounded limits while the full event name stays in the private digest.
Public reduction excludes raw tool bodies, private metadata and previous conversation history
from the current answer. Supported shapes require adapter-specific conformance evidence.

Completion requires native success and a drained, durably projected source. EOF alone establishes
neither. Native errors, interruption, timeout, pending Stop and missing replay remain distinct.
`interrupted` and `recovery_required` retain the active Conversation reservation; elapsed age does
not invent a completed outcome or permit replacement work.

`POST /api/executions/:id/stop` persists intent and requests native cancellation. Its outcome is
settled through native status; HTTP acknowledgement and browser detachment do not prove a tool
stopped. Deletion and transfer refuse resources with unresolved active work under parent locks.
This increment adds no HITL resume, queue/Push or automatic thread reconstruction.

### Browser contract, authorization and bounded connections

The JSON profile is `application/vnd.alfred.execution+json;version=1`. Creation, read and Stop
return `{ snapshot }` in the usual success envelope; active discovery returns a nullable snapshot.
SSE `snapshot` events contain cumulative public state and an opaque cursor as `id`.
`ExecutionSnapshot` is a bounded Product profile, not full AG-UI readiness. Shared contracts cap
input at 16,384 characters, output at 262,144 characters and activities at 256, alongside finite
transport byte limits. Errors use safe `errorCode` values; native identifiers and exceptions are
not the browser contract.

Reload discovers active work and reconnect uses bounded backoff plus existing session refresh.
Disconnect or navigation only detaches observation. Transcript handover uses Execution identity
and persisted rows; rejected submissions keep drafts. Opt-in v2 diagnostics validate and retain
only public Conversation-bound snapshots. Legacy v1 records remain unread and untouched; disabled
diagnostics do not access storage.

Public commands and observation retain current Product ownership and session checks. Observers
close at verified access-token expiry and recheck resource/user/session state periodically, with
a configured maximum interval of 25 seconds. Required-check failure closes the stream. Browser
credentials are not forwarded to LangGraph.

The existing runtime URL and deployment profile remain usable without new mandatory runtime or
callback credentials. Cursor protection uses a purpose-separated derivation from the already
required JWT secret when no dedicated cursor key is supplied; key changes invalidate corresponding
cursors and clients recover from authorized Product state. This is an Alfred-only cryptographic
boundary, not new platform authentication. Private environment files are not rewritten.

The persisted Product execution deadline defaults to 600 seconds. Worker concurrency defaults to
four per API instance; admission defaults to four active Executions per user and 64 globally.
These configurable values are starting limits, not measured capacity or availability guarantees.
Alfred does not change the platform's runtime timeout, replay retention or native ID generation.
Expired or unsupported native replay must produce an explicit recovery limit.

The writer serializes writes, respects backpressure, bounds frames/queues and drain waits, and
detaches slow clients independently from the worker. The 25-second comment heartbeat stays below
the declared 60-second silence constraint; Alfred's Nginx disables buffering/cache. Native HTTP
and parser limits remain finite. Upstream reconnection is independent from downstream keepalives
and never turns observer disconnect into native cancellation.

## Migration and verification

Migration `DurableRuntimeExecutions1789400000000` adds durable state/indexes. Legacy ambiguous
rows become `recovery_required` and retain their reservation; duplicate historical active rows
require explicit reconciliation. Rollback refuses unresolved work. Coordinate Alfred API/browser
versions and drain old API writers before a live migration; this does not require a new LangGraph
deployment. No live migration follows merely from this ADR.

Required evidence covers submission retries, uncertain native creation, disposable PostgreSQL
leases/fencing/projection, coherent snapshot attachment, cursor expiry, session revocation,
slow clients, malformed input, browser reload/reconnect/Stop and quiet 120/240-second wire tests
through Alfred's proxy. The [correction session](../memory-bank/sessions/2026-09-14-sse-scope-correction.md)
records the passing direct-adapter fixture and existing Docker compatibility checks, distinguishing
them from real-provider, native-restart and production qualification still requiring evidence.

The [initial session](../memory-bank/sessions/2026-09-14-sse-hardening.md) is historical evidence.
Its dedicated-ingress and modified development-fixture tests do not qualify the corrected direct
adapter, the unchanged platform or a production deployment. That prior native fixture correction
must not be reintroduced into LangGraph to make Alfred's current tests pass.

## Revision 2026-09-14 (evening): completion truth, reservations, authority and titles

An adversarial review of the corrected scope found that completion was still inferred from a
clean stream end, that parked rows reserved their conversation forever and that titles were never
applied. This revision corrects those behaviors without changing the public contract:

- **Completion requires a drained source.** After native `success`, the worker rejoins from the
  committed watermark up to three times; only a rejoin that yields no new source event turns the
  row into `completed`. A stream that keeps delivering leaves the row `recovering` for the next
  claim. EOF alone never completes.
- **Settled parked rows release the reservation.** `recovery_required` rows whose native end is
  confirmed (`finished_at` set) no longer count toward `thread_busy`, admission quotas, deletion
  or transfer guards, active discovery, or the partial unique index
  `uq_executions_active_conversation`. Their saved text and status remain readable. Parked rows
  without a confirmed end (`interrupted`, unresolved `recovery_required`) keep the reservation as
  decided above; automatic expiry or an explicit "abandon" action remains a decision-owner item.
- **Lost authority ends the row.** When the owner is disabled or the project, conversation or
  binding is gone, the worker cancels the native run on a best-effort basis and marks the row
  `cancelled` with `execution_authority_lost` under the lease fence alone, instead of re-claiming
  it after every lease expiry. A lease taken over by a successor writes nothing.
- **Claims back off.** A released claim retries after `min(2 s × 2^(claims − 1), 60 s)` using the
  lease version as the attempt count. No attempt cap invents a native outcome.
- **Titles outlive the execution.** The title request runs on its own timeout and is applied to
  the conversation (never over a user rename) without the execution fence, so a title arriving
  after completion is still stored. A missing answer keeps the request pending; an unusable one
  settles it without touching the provisional title.
- **Observation of settled parked rows.** The API sends one snapshot and closes; the browser
  treats such a snapshot as a failed turn with its saved text, records the public error and frees
  the composer. Unsettled parked rows stay observed with heartbeats and Stop remains available.
- `AGENT_RUNTIME_STREAM_MODES` is retired: the adapter selects native stream modes itself.

Still open from the same review: per-token projection commits and full cumulative snapshots
(needs a plan under DEC-006), and whether namespaced sub-graph text is answer or activity
(DEC-037).

## Revision 2026-09-15: supersede, bounded commits, delta frames and sub-graph text

Decided with the product owner on 2026-09-15 (plan in the session record). Implements
ALF-DEC-006 §5/§6 (durable watermark, no silent gap), ALF-DEC-033 §4/§6 (replacement reconciles
runtime ownership before incompatible work starts) and ALF-DEC-037 (internal child messages stay
out of the product record). This revision supersedes the reservation rule stated above for parked
and stalled rows.

- **A conversation is busy only while its execution advances.** `pending`, `running` and
  `stopping` within their deadline, or `recovering` for at most 30 s, keep the thread. Any other
  active row (`interrupted`, `recovery_required`, stalled `recovering`, or past its deadline) is
  **superseded** by the next message: within the submission transaction it becomes `cancelled`
  with `superseded` and `finished_at`, then the replacement is created. Native run creation now
  uses `multitask_strategy: 'interrupt'`, so the Agent Server interrupts any lingering run on the
  thread atomically before the new one starts; Product never guesses whether the old run existed.
  The same busy predicate guards deletion and transfer. A stale worker's writes fail its fence.
- **The deadline is terminal in every state.** The worker claims expired rows regardless of status,
  cancels best-effort and ends them as `timed_out`. Nothing reserves a conversation beyond
  `EXECUTION_DEADLINE_MS`.
- **Progress is committed in windows, never per token.** The worker reduces every native event in
  memory and commits the projection at most once per `EXECUTION_COMMIT_WINDOW_MS` (default
  500 ms) or per 4 KB of new text, and immediately when the visible activity set changes. Progress
  commits update only the execution row under the lease fence (one row lock, no transcript row);
  the conversation's activity timestamp is refreshed at most every 5 s. The transcript row and the
  parent locks are written on the terminal commit. Parent authority (tenant, owner, project,
  conversation, binding) is re-verified without locks every 5 s by the lease check and on the
  terminal commit; loss aborts the stream and abandons the row. Bounded loss on a worker crash is
  one window, recoverable from native replay. The reducer's size check is linear in the text
  instead of serialising the whole state twice per event.
- **Public observation sends deltas.** The first frame after attach and every settled state are
  full `snapshot` frames; each change in between is a `delta` (`assistantAppend` or a full
  `assistantText` replacement, plus only the changed activities, execution or conversation) applied
  by the browser on top of the frame it holds at `baseRevision`. A gap reconnects and receives a
  full snapshot. Diagnostics record the reconstructed snapshot, never the wire delta.
- **Sub-graph text is withheld.** Message text from namespaced native events never becomes the
  assistant answer or the transcript row; its tool activity is kept and the projection records that
  hidden text was seen. A successful run whose only text was withheld ends `recovery_required`
  with `runtime_output_incomplete` rather than a blank success. AG-UI activity for specialists
  remains DEC-008 work.
- The browser lets the user write while an answer is parked; the parked turn stays visible with its
  status until the superseding snapshot settles it.

Verification for this revision is recorded in
[the session record](../memory-bank/sessions/2026-09-15-streaming-supersede-and-coalescing.md).
The opt-in probe `projection-cost.postgres.spec.ts` (`ALFRED_PROJECTION_BENCH=1`) reports
milliseconds per token, durable commits and WAL amplification and fails if commits approach one
per token again.

## Revision 2026-09-15 (evening): AG-UI observation profile

Decided with the product owner on 2026-09-15 (plan in the session record). Implements
ALF-DEC-001 (AG-UI as the live interaction seam, product persistence separate), ALF-DEC-006 §5
("stable identifiers deduplicate translated AG-UI output, including one-to-many adapter
transformations") and §6 (projection independent of subscribers), ALF-DEC-032 §5 (private
runtime identifiers), ALF-DEC-033 (one Execution per submitted request) and ALF-DEC-037 (safe
tool labels, no internal child messages). It changes only the wire shape of the public
observation; commands, projection, cursor, heartbeat, authorization and limits above are kept.

- **The observation route speaks AG-UI.** `GET /api/executions/:id/events` writes unnamed SSE
  `data:` frames whose payloads are AG-UI protocol events (`@ag-ui/core` 0.0.59 schemas); the
  opaque cursor rides as `id:` on the last frame of each batch, comment heartbeats are unchanged
  and the transport-only `error {code}` frame keeps its name. The AG-UI `threadId` is the
  Conversation id and the `runId` the Execution id. The `snapshot`/`delta` frames of the previous
  revision and their contracts are removed.
- **Events are synthesized from the committed projection, never journaled.** Every attach
  (first or reconnect) re-synthesizes the run from durable state: `RUN_STARTED`,
  `STATE_SNAPSHOT { execution, conversation, userMessage }`, the visible tool calls
  (`TOOL_CALL_START`/`END`, `TOOL_CALL_RESULT` with the bounded status word `completed` or
  `failed` as content, never a tool body) and the open answer (`TEXT_MESSAGE_START` plus one
  `TEXT_MESSAGE_CONTENT` with the text so far). Each later committed change becomes the smallest
  continuing sequence: text appends, new tool calls or results, a `STATE_SNAPSHOT` when a product
  DTO changed. A change AG-UI cannot express as a continuation (replaced text, withdrawn tool
  call, reopened result) closes the observation with the transport error so the browser
  re-attaches; DEC-006 Option B (a Product event journal) stays deferred. Message and tool
  identifiers are the existing opaque projection hashes.
- **Lifecycle follows product status.** A settled `completed` run closes its open message and ends
  with `RUN_FINISHED { outcome: success }`; `cancelled` ends with `RUN_FINISHED` without outcome;
  `failed`, `timed_out` and a parked row with a confirmed end (`recovery_required`) end with
  `RUN_ERROR { message: public error, code: errorCode }`. A parked `interrupted` row stays an open
  stream with heartbeats and no lifecycle end (DEC-009 remains open). The official
  `verifyEvents` of `@ag-ui/client` is the test oracle for every emitted sequence.
- **The browser consumes it with the official client.** An `AbstractAgent` subclass whose
  transport is the existing authenticated, resumable fetch-SSE reader runs one AG-UI run per
  attach; its input is ignored because observation never submits work. The browser validates each
  frame with the AG-UI schemas, keeps only the events of this contract with their known fields,
  binds run identity, the terminal event and state to the observed execution and conversation
  (the terminal event must also name the thread of the run it closes), keeps only a `success`
  outcome on `RUN_FINISHED`, accepts `assistant` messages only, refuses tool
  arguments and any tool result outside `completed`/`failed`, bounds one delta and the accumulated
  answer by the 262,144-character limit of the JSON profile, accumulates the answer from message
  deltas, renders tool calls as label plus status, and settles the turn on
  `RUN_FINISHED`/`RUN_ERROR` after the settled state. Invalid frames and AG-UI protocol
  violations reported by the official verifier fail closed without a reconnect; only transport
  faults retry. The AG-UI client module loads on demand so it stays out of the initial bundle. Product statuses only move forward, so a
  frame carrying an earlier stage than the Stop acknowledgement is a stale delivery. JSON commands
  keep the `ExecutionSnapshot` profile; a non-settled read only replaces streamed text when it
  extends it. Diagnostics record the validated AG-UI events under a new storage version.
- **Not decided here.** Tool arguments and result bodies, specialist attribution
  (`SUBAGENT_*`/`STEP_*`/`ACTIVITY_*`), HITL interrupt outcomes and resume, `@ag-ui/langgraph`
  (which creates runs itself and cannot join from a cursor) and CopilotKit remain outside this
  revision; the reserved `agUiStreaming` capability flag is untouched because the AG-UI frames are
  the only observation profile and ride on `agentRuntime`.

Verification for this revision is recorded in
[the session record](../memory-bank/sessions/2026-09-15-ag-ui-observation-profile.md).

## Revision 2026-09-16: development trace links

[ADR 0024](0024-development-trace-links.md) adds one bounded exception to the browser contract
above: while the `traceLinks` capability is enabled (development only, refused in production),
`GET /api/executions/:id/trace-link` returns the LangSmith console address of the execution's
runtime run. Execution DTOs, `AlfredRunState` and the AG-UI identities are unchanged.

## Revision 2026-09-16 (later): the work log of an execution

Decided with the product owner on 2026-09-16 (plan in
`tmp/plan-journal-activite-execution-2026-09-16.md`, validated with its recommended options).
Implements ALF-DEC-006 §6 (sanitized specialist call/result pairs persisted by server-side work),
ALF-DEC-037 (durable sanitized delegation history: specialist identity, safe timestamps and
status, bounded labels; no prompt, child message, reasoning or tool payload) and ALF-DEC-036 (one
level of delegation). ALF-DEC-008 stays in discussion: only that accepted slice is exposed.

- **The projection records the work, not only the answer.** Reducer version 2 keeps, in
  first-seen order, every visible root message with the moments it started and last grew, a
  hidden-reasoning marker per message (presence, timing and chunk count, never content), every
  tool call with its start and end moments, and every specialist invocation identified by the
  opaque id of its private namespace. The runtime's delegation tool (`task`) reads as a
  delegation carrying the specialist it requested; the invocation seen through that namespace is
  linked to the earliest waiting delegation of the same specialist, then confirmed by the
  namespace the delegation's own result names; a confirmed link displaces an inferred one. When a
  delegation ends, its invocation ends and its unfinished tools read as interrupted. Moments come
  from the native stream position (`<milliseconds>-<sequence>`, the server clock) and otherwise
  from the worker clock. Version 1 rows are read through a normalizer: their tool calls keep
  their order without moments. The step bound (1 024) is no longer a projection error: further
  steps are counted as omitted and the execution goes on.
- **The observation stays standard AG-UI.** Every event carries `timestamp` when the moment is
  known. Narration (a root message replaced by a later one) is replayed as a closed
  `TEXT_MESSAGE`; the latest visible message remains the open answer. Reasoning markers are
  `REASONING_START`/`REASONING_END` without any reasoning message. A delegation is its
  `TOOL_CALL_START`/`END` plus `SUBAGENT_STARTED` (`subagentRunId` = the delegation's tool call
  id, `name` = the specialist, `parentToolCallId`) once the specialist is named or finished; the
  specialist's tools are `TOOL_CALL_*` events owned through `subagentRunId`;
  `SUBAGENT_FINISHED { outcome: success }` or `SUBAGENT_ERROR { code: failed | interrupted }`
  follows the specialist's own tool results, then the delegation's `TOOL_CALL_RESULT`. A
  specialist seen at work before its delegation could be identified is a `SUBAGENT_STARTED`
  without parent. `TOOL_CALL_RESULT` content adds `interrupted`. A settled execution closes every
  running step (`interrupted`) and every open specialist before its lifecycle end; a re-parented
  step, a withdrawn one or a reopened outcome closes the observation so the browser re-attaches.
  The official verifier remains the oracle.
- **The JSON profile carries the same log.** `ExecutionSnapshot.work` lists the steps
  (`message`, `reasoning`, `tool`, `delegation`, `subagent`; narration text bounded to 4 000
  characters) and the count of omitted steps; `GET /conversations/:id/messages` gives each
  assistant row a `work` account (status, duration, counts) computed inside PostgreSQL from the
  reducer JSON, which never leaves the database for a listing. Both fields are optional so an
  older API stays readable.
- **The browser renders a collapsible account of the work** above the answer: open and clocked
  while the answer streams, folded once it settles, reopened at will; narration as page text,
  markers, tools and specialists with their nested tools, outcomes and durations. The browser
  refuses specialist prompts (`description`), reports (`result`), nested specialists
  (`parentSubagentRunId`), child reasoning and reasoning messages, and keeps only a `success`
  outcome. A stored answer shows its account and loads its steps on demand.

Verification for this revision is recorded in
[the session record](../memory-bank/sessions/2026-09-16-execution-work-log.md).

## Revision 2026-09-16 (evening): reasoning text, specialist messages and empty generations

Decided with the product owner on 2026-09-16 after the first delivery: the work log must show
what the orchestrator and its specialists think and say, not only that they thought. This departs
from the content exclusion of ALF-DEC-037 (reasoning and child messages) on the owner's explicit
instruction; the register owner is asked to amend the record (see `docs/memory-bank/decisions.md`).
ALF-DEC-006 §6 and ALF-DEC-036 are unchanged; prompts, reports, tool arguments and tool results
stay out of the projection and off the wire.

- **Content is a deployment setting.** `EXECUTION_WORK_LOG_CONTENT_ENABLED` (validated boolean,
  default `true`) lets the worker record the reasoning text of every visible message and the
  text of a specialist's own messages next to the markers. `false` restores the marker-only
  record of the previous revision without any other change. Content is bounded per item
  (32 768 characters of reasoning, 8 000 of a specialist's message, cut with a mark) and by a
  shared budget of 256 KiB per execution, after which further text is dropped and the steps
  keep their markers; the `reducer_state` row therefore stays within its byte bound.
- **The events stay ratified AG-UI.** Reasoning text travels as
  `REASONING_MESSAGE_START/CONTENT/END` inside its `REASONING_START/END` marker, owned through
  `subagentRunId` when a specialist reasons. A specialist's message is a `TEXT_MESSAGE_*`
  sequence owned through `subagentRunId`; the orchestrator's open message remains the only
  unowned text. A model round trip that produced neither text, nor tool call, nor reasoning is
  `STEP_STARTED`/`STEP_FINISHED` (`stepName` = the message id): the captured "hello" run spent
  14 seconds on three empty attempts of the planner model before the fallback answered, and the
  log now says so instead of showing nothing. Both profiles carry the same steps, not the same
  bounds: the AG-UI profile streams the text the reducer kept (up to 32 768 characters of
  reasoning, 8 000 of a specialist's message), while the JSON profile's `WorkStep.text` bounds
  every step text, reasoning included, to 4 000 characters (`EXECUTION_WORK_TEXT_MAX_LENGTH`). The
  bounds are JavaScript string lengths (UTF-16 code units, what the contract and the browser
  check), never splitting a code point; the shared budget counts UTF-8 bytes; the two are enforced
  separately. `WorkStep` gains `text` and the `generation` kind.
- **State frames only when the product state changes.** The translator compares states without
  their activity timestamps, so a run no longer re-sends `STATE_SNAPSHOT` at every commit; the
  dozens of identical snapshots seen in the exported diagnostics were that comparison, not a
  change of state.
- **The browser reads like a terminal agent.** The log sits inline in the transcript (no frame,
  no background): a folding header "Travail en cours · 12 s" that becomes "Travail effectué ·
  6 min 34 s · 12 outils · 3 spécialistes" and folds itself once the answer is settled; the
  waiting line disappears as soon as a step exists. Reasoning streams as muted prose under a
  "Réflexion" heading, a specialist's messages under its delegation, consecutive calls of the same
  tool by the same owner fold into one row (`execute_raw` ×7) that unfolds into its calls, and an
  empty generation is a clocked "Génération sans réponse" row. The browser still refuses
  specialist prompts (`description`), reports (`result`), nested specialists
  (`parentSubagentRunId`) and any owner on a `STEP_*` event.

### Review corrections (2026-09-16, same revision)

An independent review of the uncommitted revision found defects fixed before delivery; they
refine, not change, the decisions above (ALF-DEC-006 §5/§6, ALF-DEC-036, ALF-DEC-037 as amended
by the owner; ALF-DEC-008 stays in discussion).

- **Delegation links are inferred only when they cannot be wrong.** This supersedes "linked to
  the earliest waiting delegation" of the previous revision: an invocation is linked by inference
  only when exactly one unresolved delegation of its specialist could own it and that delegation
  could own no other invocation. Parallel delegations to the same specialist stay unlinked, and
  their invocations and steps are withheld from the log, until a result names its namespace
  (`link: exact`); each confirmed pair may make the remaining ones unambiguous. This restraint is
  what keeps the observation a continuation instead of a re-attach. Lookups scan the unresolved
  delegations only and stop at the second candidate; observers of one instance share the work log
  of a committed revision (`ObservedWorkCache`).
- **Omitted steps are counted once within a bounded memory, and observed live.** The reducer
  remembers a digest of each omitted step, so its later chunks, deltas or complete message never
  count it again. The memory holds 2 048 digests (`OMITTED_MEMO_LIMIT`): past that many distinct
  omissions, a step's later events may count it again (2 049 distinct omissions followed by a
  repeat read as 2 050), so the count is exact up to that point and an upper bound beyond it. The step count travels on the AG-UI stream as the profile's only `CUSTOM` event,
  `alfred.work.omitted` with `{ omittedSteps }`, on attach when non-zero and whenever it changes;
  the browser refuses any other custom event. Its name is `EXECUTION_WORK_OMITTED_EVENT` in the
  contracts. This is an application contract addition proposed under ALF-DEC-008, which stays
  in discussion: recording it here does not accept it, and the register owner may replace or
  remove it.
- **Commits never lose the head.** The committer keeps the latest accepted projection as the
  reduction base until its commit completes, so an event consumed during an in-flight write is
  reduced against it rather than against the older durable row.
- **The browser's live log matches the stored one.** An orchestrator message keeps its place
  from its start, so narration reads before the steps that followed it, and ends with its last
  content (the `TEXT_MESSAGE_END` moment) rather than when the next message began. A re-attach
  progresses when it brings any step, text growth or transition never shown, element by element;
  a total size could shrink when a long intermediate answer became bounded narration.

## Revision 2026-09-16 (night): observations that explain their end and never give up on a live run

With the runtime switched to GLM-5.3-Flash, a six-minute topology run was observed six times in
fifty seconds (attaches of 2.6 to 14.5 s) before the browser showed "Connexion interrompue"
while the execution kept running. The captured native stream replayed through the real reducer,
commit rule and translator with 20 ms database writes reproduced it: 192 attaches, each ended by
a `text_not_prefix` gap on reasoning, because events consumed during an in-flight window commit
were reduced against the older durable row (fixed by the review correction above: the committer
keeps its head until the write completes). With that fix the same replay needs a single attach.
ALF-DEC-006 §5 and ALF-DEC-033 are unchanged; ALF-DEC-008 stays in discussion.

- **Every observation logs why it ended.** One structured line per attach, event
  `execution_observation_ended`, with the execution id, reason, gap rule and step kind when a
  translation gap ended it, error class name, duration, events and bytes written, whether it
  resumed from a cursor and whether headers were sent. Reasons: `terminal`, `legacy_snapshot`,
  `client_disconnected`, `token_expired` (info); `translation_gap`, `slow_consumer`,
  `frame_too_large`, `invalid_frame`, `transport_error`, `reauthorization_failed`,
  `load_timeout`, `revision_regressed`, `error` (warn). No text, prompt or payload is logged.
- **Unavailability is not an authentication refusal.** A projection or authority read that
  exceeds its 5 s bound before headers now answers 503 `execution_stream_unavailable`
  (retryable) instead of 401. A settled row read below the revision already sent ends the attach
  (`revision_regressed`) instead of waiting for token expiry.
- **The browser never abandons a progressing run.** An attach that brought any step, text growth
  or transition never shown resets the recovery budget and re-attaches after 100 to 300 ms; only
  six consecutive attempts that bring nothing back off and exhaust it (`RecoveryBudget`). A
  handler exception is a browser bug, never progress. While a re-attach replays the run, the
  content already on screen stays untouched until the rebuilt content catches up (at most 3 s),
  and stream deltas publish at most once per animation frame (`createTurnPublisher`), so rows
  keep their DOM nodes and a folded or unfolded row keeps its state.

## Revision 2026-09-17: a work-log cache with a memory budget, and recovery reads that count

An implementation review on 2026-09-17 found two reliability defects in the revisions above. Both
were reproduced on the committed code, then fixed without changing a contract. They refine, not
change, ALF-DEC-006 §5 and ALF-DEC-033; ALF-DEC-008 stays in discussion.

- **The shared work-log cache has a byte budget.** This supersedes "observers of one instance
  share the work log of a committed revision" (review corrections of 2026-09-16). The cache kept
  the logs of the last 256 revisions read, whatever their execution, and each log holds the text
  of its own freshly parsed row. One run within the reducer bounds therefore retained 259 MiB of
  heap: four intermediate messages of 200 000 characters, eight reasoning texts of 32 768, then
  256 answer deltas, each revision reduced, serialized, parsed again and read through the cache,
  heap measured after a forced collection. The cache now keeps only the latest revision of each
  execution; a read that raced behind a newer commit gets its log without replacing the newer
  one. Each entry costs 1 024 bytes, plus two bytes per UTF-16 code unit of its keys and of its
  step strings, plus 128 bytes per step. This is an upper bound of its heap: 774 bytes were
  measured for a log without steps (keys included) and about 121 per step. All logs stay within
  16 MiB (`WORK_CACHE_MAX_BYTES`) and 1 024 executions (`WORK_CACHE_MAX_ENTRIES`), the least
  recently read leaving first. A second review the same day found that a first version counted a
  log without steps as zero bytes, so 100 000 of them kept about 74 MiB with no eviction; the
  entry cost and the entry cap close that gap. The cache never keeps a log larger than the
  budget, and drops a log nobody read for 30 s (`WORK_CACHE_IDLE_MS`, longer than the longest
  reconnect backoff, checked at the next access). The long-run measurement now retains 1.2 MiB,
  one revision. Each observer still keeps the view it last sent, to translate the next revision.
- **A recovery read that progresses keeps the browser following the run.** This corrects "the
  browser never abandons a progressing run" (revision 2026-09-16 night), which held only for
  progress an attach delivered. With every attach refused (503 before headers) and each JSON read
  showing a longer answer, the browser still gave up after six attaches. The read before a
  re-attach now counts as progress when it shows an element never shown or a later stage, using
  the same element-by-element record as the attaches, even when the attach after it fails. Such
  an attempt keeps the budget whole but still backs off (up to 8 s) because the stream delivered
  nothing. A replay, an identical or older snapshot and a handler exception are never progress.
  Six attempts in a row in which neither the read nor the attach progressed still end with the
  reconnect affordance.

## Remaining decisions

DEC-008/009/016/019/038/051 retain their open event/HITL, continuation, operations, capability and
privacy details: reasoning content, a bounded excerpt of a specialist's report, tool arguments and
an exact live delegation link through the native `tasks` stream mode remain decisions for the
register owner. DEC-050 service-authentication work remains outside this delivery. Queue/Push, fork
reconstruction, multi-invocation HITL, retention/erasure, production SLOs, native restart durability
and arbitrary-runtime portability require separate work and evidence.
