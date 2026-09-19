import type { Execution, ExecutionSnapshot, ExecutionStreamEvent } from '@alfred/contracts';

import { CONVERSATION_ID } from './workspace-api';

export const EXECUTION_ID = '22222222-2222-4222-8222-222222222222';
export const SUBMISSION_ID = '99999999-9999-4999-8999-999999999999';

export function execution(
  status: Execution['status'] = 'running',
  error: string | null = null,
): Execution {
  return {
    conversationId: CONVERSATION_ID,
    createdAt: '2026-09-11T09:00:00.000Z',
    error,
    finishedAt: null,
    id: EXECUTION_ID,
    startedAt: null,
    status,
  };
}

export function snapshot(overrides: Partial<ExecutionSnapshot> = {}): ExecutionSnapshot {
  return {
    execution: execution(),
    conversation: {
      archivedAt: null,
      createdAt: '2026-09-11T09:00:00.000Z',
      id: CONVERSATION_ID,
      lastActivityAt: '2026-09-11T09:00:01.000Z',
      pinnedAt: null,
      projectId: '44444444-4444-4444-8444-444444444444',
      projectKind: 'implicit',
      title: 'Salut',
      titleSource: 'auto',
      updatedAt: '2026-09-11T09:00:01.000Z',
    },
    userMessage: 'Salut',
    assistantText: '',
    activities: [],
    cursor: 'cursor:0',
    revision: 0,
    ...overrides,
  };
}

export function snapshotEvent(overrides: Partial<ExecutionSnapshot> = {}): ExecutionStreamEvent {
  const data = snapshot(overrides);
  return { event: 'snapshot', data, ...(data.cursor === null ? {} : { id: data.cursor }) };
}
