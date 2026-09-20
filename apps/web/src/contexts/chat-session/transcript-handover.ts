import type { Message } from '@alfred/contracts';
import type { QueryClient } from '@tanstack/react-query';
import type { Dispatch } from 'react';

import type { LiveTurn } from '@/contexts/chat-session/chat-session-context';
import {
  transcriptHoldsTurn,
  type ChatSessionAction,
} from '@/contexts/chat-session/chat-session-state';
import { conversationKeys, messageKeys } from '@/hooks/workspace/workspace-keys';
import { listMessages } from '@/services/executions/executions.service';
import type { HttpClient } from '@/services/http/http-client';

export interface HandoverContext {
  readonly client: HttpClient;
  readonly conversationId: string;
  readonly queryClient: QueryClient;
  readonly dispatch: Dispatch<ChatSessionAction>;
  readonly userId: string;
  readonly controller: AbortController;
}

/** Retain the local answer until the product transcript actually contains it. */
export async function handOver(run: HandoverContext, turn: LiveTurn): Promise<void> {
  if (run.controller.signal.aborted) return;
  await run.queryClient.invalidateQueries({ queryKey: conversationKeys.all(run.userId) });
  await run.queryClient.invalidateQueries({
    queryKey: ['active-execution', run.userId, run.conversationId],
  });
  if (turn.execution === null) return;
  const messages = await fetchTranscript(run, turn);
  if (messages !== null && !run.controller.signal.aborted) {
    run.dispatch({ type: 'reconcile', conversationId: run.conversationId, messages });
  }
}

async function fetchTranscript(
  run: HandoverContext,
  turn: LiveTurn,
): Promise<readonly Message[] | null> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 500));
    if (run.controller.signal.aborted) return null;
    try {
      const messages = await run.queryClient.fetchQuery({
        queryFn: ({ signal }) =>
          listMessages(
            run.client,
            run.conversationId,
            AbortSignal.any([signal, run.controller.signal]),
          ),
        queryKey: messageKeys.list(run.userId, run.conversationId),
        staleTime: 0,
      });
      if (transcriptHoldsTurn(messages, turn)) return messages;
    } catch {
      return null;
    }
  }
  return null;
}
