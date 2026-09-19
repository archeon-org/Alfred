import type { AlfredRunState, Execution, WorkStepStatus } from '@alfred/contracts';
import { verifyEvents } from '@ag-ui/client';
import { from, lastValueFrom, toArray } from 'rxjs';

import { toConversationDto } from '@api/modules/conversations/domain/conversation';
import type {
  ObservedMessage,
  ObservedStep,
  ObservedView,
} from '@api/modules/stream/application/ag-ui-translation';
import { conversationRow } from './project-fixtures';

/** Hand-built observed views and steps for AG-UI translation specs. */
export const executionId = 'f9dfb431-2928-42c1-980d-97383a4016bd';
export const conversation = toConversationDto(conversationRow(), 'named');

export function execution(
  status: Execution['status'] = 'running',
  error: string | null = null,
): Execution {
  return {
    id: executionId,
    conversationId: conversation.id,
    status,
    error,
    errorCode: error,
    createdAt: '2026-09-15T10:00:00.000Z',
    startedAt: null,
    finishedAt: null,
  };
}

export function view(
  overrides: Partial<ObservedView> & { readonly status?: Execution['status'] } = {},
) {
  const { status, ...rest } = overrides;
  const state: AlfredRunState = {
    execution: execution(status),
    conversation,
    userMessage: 'Hello?',
  };
  return {
    state,
    answer: null,
    steps: [],
    omittedSteps: 0,
    settled: false,
    ...rest,
  } satisfies ObservedView;
}

export const answer = (id: string, text: string, finishedAt = 2_000): ObservedMessage => ({
  id,
  text,
  startedAt: 1_000,
  finishedAt,
});
export const ended = (status: WorkStepStatus) => (status === 'running' ? null : 1_500);
export const tool = (
  id: string,
  status: WorkStepStatus = 'running',
  extra: Partial<ObservedStep> = {},
): ObservedStep => ({
  id,
  kind: 'tool',
  label: 'read_file',
  status,
  startedAt: 1_000,
  finishedAt: ended(status),
  messageId: 'message-a',
  ...extra,
});
export const nested = (
  id: string,
  parentId: string,
  status: WorkStepStatus = 'running',
): ObservedStep => ({
  id,
  kind: 'tool',
  label: 'execute_raw',
  status,
  startedAt: 1_100,
  finishedAt: ended(status),
  parentId,
});
export const delegation = (
  id: string,
  status: WorkStepStatus = 'running',
  subagentStatus?: WorkStepStatus,
): ObservedStep => ({
  id,
  kind: 'delegation',
  label: 'task',
  status,
  startedAt: 1_000,
  finishedAt: ended(status),
  messageId: 'message-a',
  specialist: 'topology_agent',
  ...(subagentStatus === undefined ? {} : { subagentStatus }),
});
export const marker = (id: string, status: WorkStepStatus = 'running'): ObservedStep => ({
  id,
  kind: 'reasoning',
  label: '',
  status,
  startedAt: 900,
  finishedAt: ended(status),
  messageId: 'message-a',
});
export const narration = (id: string, text: string): ObservedStep => ({
  id,
  kind: 'message',
  label: '',
  status: 'completed',
  startedAt: 500,
  finishedAt: 800,
  text,
});

export const names = (events: readonly { type: string }[]) => events.map((event) => event.type);
export const verified = (events: readonly { type: string }[]) =>
  lastValueFrom(from(events as never[]).pipe(verifyEvents(), toArray()));
