import type { Execution, Message } from '@alfred/contracts';
import { createContext } from 'react';

/** One native runtime event kept for the visibility panel. */
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
  readonly events: readonly RuntimeEventView[];
  readonly execution: Execution | null;
  readonly status: 'streaming' | 'done' | 'error';
  readonly error: string | null;
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
 * Workspace-wide chat session: the single answer being streamed. It outlives the chat screen, so
 * creating a conversation, navigating to it and streaming its answer never interrupt each other.
 */
export interface ChatSessionContextValue {
  readonly live: LiveSession | null;
  /** Local turns retained until their persisted rows have been recovered. */
  readonly sessions: readonly LiveSession[];
  readonly reconcile: (conversationId: string, messages: readonly Message[]) => void;
  /** Last failed turn per conversation id, shown under its stored rows until the next send. */
  readonly failures: ReadonlyMap<string, TurnFailure>;
  /** Starts streaming an answer; returns false while another answer is still being produced. */
  readonly send: (conversationId: string, text: string) => boolean;
  /** Stops listening and asks the API to cancel the runtime run; the execution ends `cancelled`. */
  readonly stop: () => void;
}

export const ChatSessionContext = createContext<ChatSessionContextValue | null>(null);
