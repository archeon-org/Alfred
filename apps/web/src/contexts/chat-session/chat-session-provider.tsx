import type { ExecutionSnapshot, Message } from '@alfred/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useReducer, type ReactNode } from 'react';

import {
  ChatSessionContext,
  type ChatSessionContextValue,
} from '@/contexts/chat-session/chat-session-context';
import { chatSessionReducer } from '@/contexts/chat-session/chat-session-state';
import {
  createExecutionObserver,
  isSettledExecution,
} from '@/contexts/chat-session/execution-observer';
import { useWorkspaceAccount } from '@/hooks/workspace/use-workspace-account';
import type { HttpClient } from '@/services/http/http-client';

type Observer = ReturnType<typeof createExecutionObserver>;

export function ChatSessionProvider({ children }: { readonly children: ReactNode }) {
  const { client, userId } = useWorkspaceAccount();
  const queryClient = useQueryClient();
  const [{ sessions, failures }, dispatch] = useReducer(chatSessionReducer, {
    sessions: [],
    failures: new Map(),
  });
  const observers = useRef(new Map<number, Observer>());
  const sequence = useRef(0);
  const currentClient = useRef(client);
  const previousUser = useRef(userId);
  useEffect(() => {
    currentClient.current = client;
  }, [client]);
  const freshClient = useMemo<HttpClient>(
    () => ({ request: (path, init) => currentClient.current.request(path, init) }),
    [],
  );

  useEffect(() => {
    const active = observers.current;
    if (previousUser.current !== userId) {
      previousUser.current = userId;
      dispatch({ type: 'reset' });
    }
    return () => {
      // Logout/unmount detaches observation; it never sends the Stop command.
      for (const observer of active.values()) observer.controller.abort();
      active.clear();
    };
  }, [userId]);

  const reconcile = useCallback((conversationId: string, messages: readonly Message[]) => {
    dispatch({ type: 'reconcile', conversationId, messages });
  }, []);
  const launch = useCallback(
    (conversationId: string, text: string, snapshot?: ExecutionSnapshot) => {
      const id = sequence.current++;
      const observer = createExecutionObserver({
        client: freshClient,
        controller: new AbortController(),
        conversationId,
        id,
        queryClient,
        dispatch,
        text,
        userId,
        ...(snapshot ? { snapshot } : {}),
        onClose: () => observers.current.delete(id),
      });
      observers.current.set(id, observer);
      observer.start();
    },
    [freshClient, queryClient, userId],
  );
  const send = useCallback(
    (conversationId: string, text: string): boolean => {
      // A parked or stalled answer never blocks the next message: the API supersedes it and the
      // old observer settles on its final snapshot.
      if (
        [...observers.current.values()].some(
          (observer) => observer.conversationId === conversationId && observer.blocksComposer(),
        )
      )
        return false;
      launch(conversationId, text);
      return true;
    },
    [launch],
  );
  const recover = useCallback(
    (snapshot: ExecutionSnapshot) => {
      if (
        [...observers.current.values()].some(
          (observer) =>
            observer.executionId() === snapshot.execution.id ||
            (observer.conversationId === snapshot.execution.conversationId && observer.isActive()),
        )
      )
        return;
      if (isSettledExecution(snapshot.execution)) return;
      launch(snapshot.execution.conversationId, snapshot.userMessage, snapshot);
    },
    [launch],
  );
  const reconnect = useCallback((conversationId: string) => {
    for (const observer of observers.current.values()) {
      if (observer.conversationId === conversationId && observer.isActive()) observer.start();
    }
  }, []);
  const stop = useCallback((conversationId: string) => {
    for (const observer of observers.current.values()) {
      if (observer.conversationId === conversationId && observer.isActive()) observer.stop();
    }
  }, []);
  const value = useMemo<ChatSessionContextValue>(
    () => ({ failures, sessions, reconcile, send, stop, recover, reconnect }),
    [failures, sessions, reconcile, send, stop, recover, reconnect],
  );
  return <ChatSessionContext.Provider value={value}>{children}</ChatSessionContext.Provider>;
}
