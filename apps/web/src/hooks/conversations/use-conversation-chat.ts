import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';

import type { LiveTurn } from '@/contexts/chat-session/chat-session-context';
import { isBusyExecution } from '@/contexts/chat-session/execution-observer';
import { useChatSession } from '@/hooks/conversations/use-chat-session';
import { useWorkspaceAccount } from '@/hooks/workspace/use-workspace-account';
import {
  getRuntimeEventDebugSnapshot,
  subscribeRuntimeEventDebug,
} from '@/lib/workspace/runtime-event-debug';
import { messageKeys } from '@/hooks/workspace/workspace-keys';
import type { AttachmentView } from '@/lib/files/composer-attachments';
import {
  getActiveExecution,
  listMessages,
  type Message,
} from '@/services/executions/executions.service';

export type {
  LiveTurn,
  RuntimeEventView,
  TurnFailure,
} from '@/contexts/chat-session/chat-session-context';

/** Stored transcript of one chat plus its live turn from the workspace-wide chat session. */
export function useConversationChat(conversationId: string, observeEnabled = true) {
  const { client, userId } = useWorkspaceAccount();
  const session = useChatSession();
  const debug = useSyncExternalStore(subscribeRuntimeEventDebug, () =>
    getRuntimeEventDebugSnapshot(userId, conversationId),
  );
  const active = useQuery({
    queryFn: ({ signal }) => getActiveExecution(client, conversationId, signal),
    queryKey: ['active-execution', userId, conversationId],
    enabled: observeEnabled,
    staleTime: 0,
    retry: false,
  });
  const discoverySettled = active.isSuccess && !active.isFetching;
  const isDiscovering = observeEnabled && (active.isPending || active.isFetching);
  const { recover, reconnect } = session;
  useEffect(() => {
    // A cached active snapshot can outlive an execution that finished in the background. Wait
    // for the current discovery request before attaching; existing observers continue meanwhile.
    if (discoverySettled && active.data) recover(active.data);
  }, [active.data, discoverySettled, recover]);
  const history = useQuery({
    queryFn: ({ signal }) => listMessages(client, conversationId, signal),
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
    (text: string, attachments: readonly AttachmentView[] = []) =>
      discoverySettled && session.send(conversationId, text, attachments),
    [discoverySettled, conversationId, session],
  );

  return {
    debug,
    error: active.isError ? active.error : history.isError ? history.error : null,
    isDiscovering,
    discoveryFailed: active.isError,
    failure: session.failures.get(conversationId) ?? null,
    // A parked answer stays visible with its status text but no longer holds the composer.
    isStreaming: live?.status === 'streaming' && isBusyExecution(live.execution),
    live,
    sessions,
    messages,
    reload: () => {
      void history.refetch();
      void active.refetch();
      reconnect(conversationId);
    },
    send,
    status:
      history.isPending || isDiscovering
        ? ('loading' as const)
        : history.isError || active.isError
          ? ('error' as const)
          : ('ready' as const),
    stop: () => session.stop(conversationId),
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
