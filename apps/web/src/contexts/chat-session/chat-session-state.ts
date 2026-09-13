import type { Message } from '@alfred/contracts';

import type { LiveSession, LiveTurn, TurnFailure } from './chat-session-context';

export interface ChatSessionState {
  readonly sessions: readonly LiveSession[];
  readonly failures: ReadonlyMap<string, TurnFailure>;
}

export type ChatSessionAction =
  | { readonly type: 'start'; readonly session: LiveSession }
  | { readonly type: 'update'; readonly id: number; readonly turn: LiveTurn }
  | {
      readonly type: 'reconcile';
      readonly conversationId: string;
      readonly messages: readonly Message[];
    };

export function chatSessionReducer(
  state: ChatSessionState,
  action: ChatSessionAction,
): ChatSessionState {
  if (action.type === 'start') {
    const failures = new Map(state.failures);
    failures.delete(action.session.conversationId);
    return { failures, sessions: [...state.sessions, action.session] };
  }
  if (action.type === 'reconcile') {
    const sessions = state.sessions.filter(
      (session) =>
        session.conversationId !== action.conversationId ||
        !transcriptHoldsTurn(action.messages, session.turn),
    );
    return sessions.length === state.sessions.length ? state : { ...state, sessions };
  }
  const session = state.sessions.find((item) => item.id === action.id);
  // A late title event must never recreate a turn already handed over to history.
  if (session === undefined) return state;
  const { turn } = action;
  const latest = state.sessions.findLast((item) => item.conversationId === session.conversationId);
  const failures =
    latest?.id === session.id &&
    session.turn.status === 'streaming' &&
    turn.status === 'error' &&
    turn.error !== null &&
    turn.execution !== null
      ? new Map(state.failures).set(session.conversationId, {
          error: turn.error,
          executionId: turn.execution.id,
        })
      : state.failures;
  return {
    failures,
    sessions: state.sessions.map((item) => (item.id === action.id ? { ...item, turn } : item)),
  };
}

/** A user row alone must not replace an answer that is still streaming or awaiting persistence. */
export function transcriptHoldsTurn(messages: readonly Message[], turn: LiveTurn): boolean {
  if (turn.status === 'streaming' || turn.execution === null) return false;
  const rows = messages.filter((message) => message.executionId === turn.execution?.id);
  return (
    rows.some((message) => message.role === 'user') &&
    (turn.assistantText.length === 0 || rows.some((message) => message.role === 'assistant'))
  );
}
