# ADR 0022: Runtime chat bridge over native LangGraph streaming

- Status: Accepted first slice; runtime authentication and AG-UI translation deferred
- Date: 2026-09-11
- Relates to: `ALF-DEC-003/004/006/007/008/032/033/050`

## Context

The product needed an end-to-end path from the browser composer to the private LangGraph server
(`langgraph-agent-repo`, container alias `agents-api`, port 8000) so that real executions can be
observed and later decisions can be taken on evidence. `ALF-DEC-003/004` require the browser to
talk only to the product API, which authorizes every command before creating an Execution.
`ALF-DEC-032/033` require one active runtime thread binding per conversation and one product
Execution per submitted chat request. `ALF-DEC-006/007` require a single live SSE transport relayed
by the product and a product-owned visible transcript.

`ALF-DEC-050` (service key towards the Agent Server) and `ALF-DEC-008` (public AG-UI event
schema) are intentionally not implemented in this slice: the runtime `auth.py` is still a stub and
the owner asked for the native LangGraph events first. Both remain follow-ups, not deviations
accepted for production.

## Decision

- `apps/api/src/modules/executions` owns the bridge with the `api` / `application` / `domain` /
  `infrastructure` split. `application/runtime-client.port.ts` is the only surface application code
  sees; `infrastructure/langgraph/langgraph-runtime.client.ts` wraps `@langchain/langgraph-sdk`
  (`threads.create`, `runs.stream`) and is replaceable.
- Three `api_`-prefixed tables (migration `CreateRuntimeExecutions1789310000000`):
  `api_runtime_threads` (conversation primary key, `runtime` + `thread_id` unique), `api_executions`
  (status `pending|running|completed|failed|cancelled`, private `runtime_thread_id`/`runtime_run_id`,
  bounded `error`) and `api_messages` (`user|assistant` turns, optional execution link, ordered
  index). Runtime identifiers never enter public DTOs or the browser.
- `POST /api/conversations/:id/executions` (`{ message }`, flag `agentRuntime`) authorizes through
  the conversation's project owner scope, refuses archived chats and a second active execution
  (`thread_busy`), stores the user turn, sets an automatic title on first use, then answers
  `text/event-stream`: one `execution` lifecycle event per status change and every native LangGraph
  event (`metadata`, `messages/partial`, `updates`, …) relayed unchanged, with a 25 s comment
  heartbeat. Authorization errors are raised before any header, so they stay JSON envelopes.
- The assistant turn stored at the end is derived by `createAssistantReply` in
  `packages/contracts`, the same reducer the browser uses to render the live answer, so both sides
  agree on what the reply is. The reducer reads `messages/metadata` and ignores AI messages of
  non-generation model calls (tags `non-generation` / `guard`, middleware hook nodes such as
  `PromptInjectionGuardMiddleware.before_agent`): only the agent's `model` output is the reply.
- `GET /api/conversations/:id/messages` returns the stored transcript (oldest first, bounded).
- Configuration: `AGENT_RUNTIME_URL` (default `http://localhost:8000`, `http://agents-api:8000` in
  Compose), `AGENT_RUNTIME_ASSISTANT_ID` (`orchestrator`) and `AGENT_RUNTIME_STREAM_MODES`
  (validated list, default `messages,updates`).
- Web: `services/executions` (fetch-based SSE parser, bearer header, POST body),
  `hooks/conversations/use-conversation-chat.ts`, a transcript with the live answer and a native
  event log, and a composer enabled only when the `agentRuntime` flag is on.

## Revision 2026-09-11 — composer-first creation and runtime title agent

- A conversation is created by its first message, never through a title dialog. The browser calls
  `POST /api/conversations` without a title (`titleSource: 'none'`) from `/app/conversations/new`
  (optionally `?projectId=`), the home starters or the project composer, then opens the chat with
  the message in router state; the chat screen sends it when the `agentRuntime` flag is on and
  keeps it as a draft otherwise.
- `ExecutionsService.start` names an untitled chat provisionally from the first line of that
  message (`titleSource: 'auto'`). `stream` pushes the public Conversation DTO on the SSE stream as
  `event: conversation` (contract constant `CONVERSATION_SSE_EVENT`): once at the start, and once
  more when the runtime title graph answers.
- The title graph is `title_agent` of the sibling runtime, called through the runtime port as a
  stateless `runs.wait` run (`AGENT_RUNTIME_TITLE_ASSISTANT_ID`, empty disables it, 12 s budget)
  in parallel with the execution. Its answer is sanitized (`sanitizeGeneratedTitle`) and stored
  only where `title_source <> 'user'`, so a rename by the user always wins; its neutral fallback
  (`language` null) and every failure keep the provisional title. This is an auxiliary runtime
  invocation, not part of the Execution's bound team (ALF-DEC-024); it creates no thread.
- The browser applies `conversation` events to the detail cache and invalidates the sidebar lists;
  the sidebar title element is keyed by title so the generated title fades in over the provisional
  one (`title-appear`).
- The in-flight stream is owned by a workspace-wide `ChatSessionProvider`, not by the chat screen:
  creating a chat, navigating to `/app/conversations/:id` and streaming its answer never interrupt
  each other (React StrictMode double-mounting had cancelled a screen-owned stream). One chat
  screen serves `/app`, `/app/conversations/new` and `/app/conversations/:id`.

## Revision 2026-09-11 (evening) — settled answers and no lost drafts

A review of the first slice listed states the bridge could get wrong. The corrections keep the
architecture and the native event transport; they change how an execution settles:

- `finish` writes the assistant turn, the conversation activity and the terminal execution state
  in one transaction and runs exactly once per execution; a store failure leaves nothing written,
  logs, and still ends the stream with a `failed` state. `start` closes executions left
  `pending`/`running` for more than 15 minutes (`EXECUTION_ABANDON_AFTER_MS`) as `failed` before
  its busy check, so a process that died mid-stream never leaves a chat answering forever.
- Stopping is a cancellation, not a disconnect: the adapter sends `onDisconnect: 'cancel'` (the
  runtime's default for streamed runs is `continue`) and the service calls the port's `cancel`
  (`runs.cancel`, interrupt) when the client leaves, before recording `cancelled`.
- The terminal `execution` event is sent before the title graph is awaited; the generated title
  still arrives on the same stream as a later `conversation` event.
- `GET …/messages` returns the most recent 500 turns, oldest first, instead of the first 500.
- Browser: the turn's status follows the terminal `execution` event, and a stream that closes
  without one is shown as interrupted. The send slot is released on that event, so a new message
  can go while the title is still streaming. The live turn is cleared only once the refetched
  transcript holds its rows (by `executionId`, with a short retry after a stop); a failed turn
  hands over too and leaves its error under its stored rows. The composer clears a message only
  when the send was accepted, and explains when another chat is still being answered.

## Consequences

- Executions and the transcript are durable product data; a page reload shows stored turns.
- No stream resumption, opaque cursor, projection or reauthorization yet (`ALF-DEC-006` follow-up);
  a client disconnect cancels the runtime run and records the execution as `cancelled` with the
  partial answer.
- No credential reaches the runtime; the runtime accepts unauthenticated calls in this local
  profile. `ALF-DEC-050`'s service key must be added before any shared deployment.
- Native event names are the browser contract for now; `ALF-DEC-008` will replace them with a
  translated schema inside the same adapter boundary.
