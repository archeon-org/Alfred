import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo } from 'react';

import type { LiveTurn } from '@/contexts/chat-session/chat-session-context';
import { useChatSession } from '@/hooks/conversations/use-chat-session';
import { useWorkspaceAccount } from '@/hooks/workspace/use-workspace-account';
import { messageKeys } from '@/hooks/workspace/workspace-keys';
import { listMessages, type Message } from '@/services/executions/executions.service';

export type {
  LiveTurn,
  RuntimeEventView,
  TurnFailure,
} from '@/contexts/chat-session/chat-session-context';

/** Stored transcript of one chat plus its live turn from the workspace-wide chat session. */
export function useConversationChat(conversationId: string) {
  const { client, userId } = useWorkspaceAccount();
  const session = useChatSession();
  const history = useQuery({
    queryFn: () => listMessages(client, conversationId),
    queryKey: messageKeys.list(userId, conversationId),
    retry: false,
  });
  const sessions = useMemo(
    () => session.sessions.filter((item) => item.conversationId === conversationId),
    [conversationId, session.sessions],
  );
  const live = sessions.at(-1)?.turn ?? null;
  const { reconcile } = session;
  // A later successful reload must also retire turns kept after a failed handover.
  useEffect(() => {
    if (history.isSuccess) reconcile(conversationId, history.data);
  }, [conversationId, history.data, history.isSuccess, reconcile, sessions]);
  const messages = useMemo(
    () =>
      sessions.reduceRight(
        (rows, item) => withoutLiveTurn(rows, item.turn),
        history.data ?? ([] as readonly Message[]),
      ),
    [history.data, sessions],
  );
  const send = useCallback(
    (text: string) => session.send(conversationId, text),
    [conversationId, session],
  );

  return {
    /** Another chat is still being answered: a send would be refused. */
    busyElsewhere:
      session.live !== null &&
      session.live.conversationId !== conversationId &&
      session.live.turn.status === 'streaming',
    error: history.isError ? history.error : null,
    failure: session.failures.get(conversationId) ?? null,
    isStreaming: live?.status === 'streaming',
    live,
    sessions,
    messages,
    reload: () => void history.refetch(),
    send,
    status: history.isPending
      ? ('loading' as const)
      : history.isError
        ? ('error' as const)
        : ('ready' as const),
    stop: session.stop,
  };
}

/**
 * The API stores the user turn before streaming, so a transcript fetched meanwhile already holds
 * it. While the live turn is displayed, its stored rows are hidden to avoid showing them twice.
 */
export function withoutLiveTurn(
  stored: readonly Message[],
  live: LiveTurn | null,
): readonly Message[] {
  const executionId = live?.execution?.id;
  // Repeated prompts are distinct turns. Only an execution id establishes which rows belong here.
  return executionId === undefined
    ? stored
    : stored.filter((message) => message.executionId !== executionId);
}
