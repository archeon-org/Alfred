import type { Execution, ExecutionActivity, ExecutionSnapshot, Message } from '@alfred/contracts';
import { createContext } from 'react';

/** One validated public event kept for the visibility panel. */
export interface RuntimeEventView {
  readonly id: number;
  readonly event: string;
  readonly data: unknown;
}

/**
 * The turn being answered right now. Its status follows the terminal `execution` event of the API,
 * not the closing of the transport: a stream that ends without one is an interrupted answer.
 */
export interface LiveTurn {
  readonly userMessage: string;
  readonly assistantText: string;
  /** Tool calls of this turn as AG-UI reported them: safe label and status only. */
  readonly activities: readonly ExecutionActivity[];
  readonly events: readonly RuntimeEventView[];
  readonly execution: Execution | null;
  readonly status: 'streaming' | 'done' | 'error';
  readonly error: string | null;
  readonly connection?: 'connecting' | 'connected' | 'recovering' | 'disconnected';
  readonly stopPending?: boolean;
}

export interface LiveSession {
  /** Identity of the stream run that owns this turn; later runs never touch it. */
  readonly id: number;
  readonly conversationId: string;
  readonly createdAt: string;
  readonly turn: LiveTurn;
}

/** A turn that ended in error once its rows had reached the stored transcript. */
export interface TurnFailure {
  readonly executionId: string;
  readonly error: string;
}

/**
 * Workspace-wide observations, isolated by conversation. They outlive the chat screen so
 * navigating between conversations never interrupts their independent answers.
 */
export interface ChatSessionContextValue {
  /** Local turns retained until their persisted rows have been recovered. */
  readonly sessions: readonly LiveSession[];
  readonly reconcile: (conversationId: string, messages: readonly Message[]) => void;
  /** Last failed turn per conversation id, shown under its stored rows until the next send. */
  readonly failures: ReadonlyMap<string, TurnFailure>;
  /** Starts an answer unless this conversation already has unresolved work. */
  readonly send: (conversationId: string, text: string) => boolean;
  /** Attach to work discovered after reload; never resubmit the prompt. */
  readonly recover: (snapshot: ExecutionSnapshot) => void;
  readonly reconnect: (conversationId: string) => void;
  /** Requests cancellation; a server terminal snapshot is required to settle the turn. */
  readonly stop: (conversationId: string) => void;
}

export const ChatSessionContext = createContext<ChatSessionContextValue | null>(null);
