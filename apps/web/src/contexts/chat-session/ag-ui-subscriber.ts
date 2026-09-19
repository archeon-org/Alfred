import type { AgentSubscriber } from '@ag-ui/client';
import type { AlfredRunState } from '@alfred/contracts';

import type { AlfredExecutionAgent } from '@/services/executions/ag-ui-agent';
import { InvalidStreamError } from '@/services/executions/sse';

/** What the observer does with each AG-UI event; a thrown error invalidates the stream. */
export interface AgUiHandlers {
  readonly runStarted: (threadId: string) => void;
  readonly state: (state: AlfredRunState) => void;
  readonly messageStart: (messageId: string) => void;
  readonly messageDelta: (messageId: string, delta: string) => void;
  readonly toolStart: (toolCallId: string, toolCallName: string) => void;
  readonly toolResult: (toolCallId: string, content: string) => void;
  readonly runFinished: () => void;
  readonly runError: (message: string) => void;
  readonly event: (event: { readonly type: string }) => Promise<void>;
}

/**
 * Adapts the AG-UI subscriber callbacks to the observer. The AG-UI client logs and swallows
 * exceptions thrown by subscribers, so an invalid frame is recorded here and the transport is
 * ended; the observer then fails closed without a retry.
 */
export function createAgUiSubscriber(
  agent: AlfredExecutionAgent,
  handlers: AgUiHandlers,
  signal: AbortSignal,
): AgentSubscriber & { readonly invalid: () => Error | null } {
  let invalid: Error | null = null;
  const guarded =
    <T>(handle: (event: T) => void | Promise<void>) =>
    async ({ event }: { readonly event: T }) => {
      if (invalid !== null || signal.aborted) return;
      try {
        await handle(event);
      } catch (error) {
        invalid = error instanceof Error ? error : new InvalidStreamError();
        agent.abort();
      }
    };
  return {
    invalid: () => invalid,
    onRunStartedEvent: guarded((event: { readonly threadId: string }) =>
      handlers.runStarted(event.threadId),
    ),
    onStateSnapshotEvent: guarded((event: { readonly snapshot?: unknown }) =>
      handlers.state(event.snapshot as AlfredRunState),
    ),
    onTextMessageStartEvent: guarded((event: { readonly messageId: string }) =>
      handlers.messageStart(event.messageId),
    ),
    onTextMessageContentEvent: guarded(
      (event: { readonly messageId: string; readonly delta: string }) =>
        handlers.messageDelta(event.messageId, event.delta),
    ),
    onToolCallStartEvent: guarded(
      (event: { readonly toolCallId: string; readonly toolCallName: string }) =>
        handlers.toolStart(event.toolCallId, event.toolCallName),
    ),
    onToolCallResultEvent: guarded(
      (event: { readonly toolCallId: string; readonly content: string }) =>
        handlers.toolResult(event.toolCallId, event.content),
    ),
    onRunFinishedEvent: guarded(() => handlers.runFinished()),
    onRunErrorEvent: guarded((event: { readonly message: string }) =>
      handlers.runError(event.message),
    ),
    onEvent: guarded((event: { readonly type: string }) => handlers.event(event)),
  };
}
