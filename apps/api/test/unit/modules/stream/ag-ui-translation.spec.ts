import type { AlfredRunState, Execution } from '@alfred/contracts';
import { verifyEvents } from '@ag-ui/client';
import { EventType } from '@ag-ui/core';
import { from, lastValueFrom, toArray } from 'rxjs';
import { describe, expect, it } from 'vitest';

import {
  AgUiTranslationGap,
  translateObservedView,
  type ObservedToolCall,
  type ObservedView,
} from '@api/modules/stream/application/ag-ui-translation';
import { toConversationDto } from '@api/modules/conversations/domain/conversation';
import { conversationRow } from '../../../support/project-fixtures';

const executionId = 'f9dfb431-2928-42c1-980d-97383a4016bd';
const conversation = toConversationDto(conversationRow(), 'named');

function execution(
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

function view(overrides: Partial<ObservedView> & { readonly status?: Execution['status'] } = {}) {
  const { status, ...rest } = overrides;
  const state: AlfredRunState = {
    execution: execution(status),
    conversation,
    userMessage: 'Hello?',
  };
  return { state, message: null, toolCalls: [], settled: false, ...rest } satisfies ObservedView;
}

const tool = (id: string, status: ObservedToolCall['status'] = 'running'): ObservedToolCall => ({
  id,
  label: 'read_file',
  status,
  messageId: 'message-a',
});

const names = (events: readonly { type: string }[]) => events.map((event) => event.type);
const verified = (events: readonly { type: string }[]) =>
  lastValueFrom(from(events as never[]).pipe(verifyEvents(), toArray()));

describe('AG-UI translation of the observed projection', () => {
  it('opens the run with product identities and the state, nothing else, while dispatch is pending', async () => {
    const events = translateObservedView(null, view({ status: 'pending' }));
    expect(events).toEqual([
      { type: EventType.RUN_STARTED, threadId: conversation.id, runId: executionId },
      { type: EventType.STATE_SNAPSHOT, snapshot: view({ status: 'pending' }).state },
    ]);
    await expect(verified(events)).resolves.toHaveLength(2);
  });

  it('replays visible tool calls and the open answer on attach and closes everything on completion', async () => {
    const attached = view({
      message: { id: 'message-a', text: 'Hello world' },
      toolCalls: [tool('tool-1', 'completed'), tool('tool-2')],
    });
    const attach = translateObservedView(null, attached);
    expect(names(attach)).toEqual([
      'RUN_STARTED',
      'STATE_SNAPSHOT',
      'TOOL_CALL_START',
      'TOOL_CALL_END',
      'TOOL_CALL_RESULT',
      'TOOL_CALL_START',
      'TOOL_CALL_END',
      'TEXT_MESSAGE_START',
      'TEXT_MESSAGE_CONTENT',
    ]);
    expect(attach[2]).toEqual({
      type: EventType.TOOL_CALL_START,
      toolCallId: 'tool-1',
      toolCallName: 'read_file',
      parentMessageId: 'message-a',
    });
    expect(attach[4]).toEqual({
      type: EventType.TOOL_CALL_RESULT,
      messageId: 'tool-1:result',
      toolCallId: 'tool-1',
      content: 'completed',
      role: 'tool',
    });
    expect(attach.at(-1)).toEqual({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'message-a',
      delta: 'Hello world',
    });
    const done = view({
      status: 'completed',
      message: { id: 'message-a', text: 'Hello world!' },
      toolCalls: [tool('tool-1', 'completed'), tool('tool-2', 'failed')],
      settled: true,
    });
    const finish = translateObservedView(attached, done);
    expect(names(finish)).toEqual([
      'STATE_SNAPSHOT',
      'TOOL_CALL_RESULT',
      'TEXT_MESSAGE_CONTENT',
      'TEXT_MESSAGE_END',
      'RUN_FINISHED',
    ]);
    expect(finish[1]).toMatchObject({ toolCallId: 'tool-2', content: 'failed' });
    expect(finish[2]).toMatchObject({ delta: '!' });
    expect(finish.at(-1)).toEqual({
      type: EventType.RUN_FINISHED,
      threadId: conversation.id,
      runId: executionId,
      outcome: { type: 'success' },
    });
    await expect(verified([...attach, ...finish])).resolves.toHaveLength(14);
  });

  it('sends nothing for an identical view and only the state when the product state changes', () => {
    const before = view({ message: { id: 'message-a', text: 'Hi' } });
    expect(
      translateObservedView(before, view({ message: { id: 'message-a', text: 'Hi' } })),
    ).toEqual([]);
    const retitled = view({
      message: { id: 'message-a', text: 'Hi' },
      state: { ...before.state, conversation: { ...conversation, title: 'Renamed' } },
    });
    expect(names(translateObservedView(before, retitled))).toEqual(['STATE_SNAPSHOT']);
  });

  it('opens the answer late, appends only new text and switches messages by closing the previous one', async () => {
    const empty = view();
    const opened = view({ message: { id: 'message-a', text: '' } });
    const late = translateObservedView(empty, opened);
    expect(late).toEqual([
      { type: EventType.TEXT_MESSAGE_START, messageId: 'message-a', role: 'assistant' },
    ]);
    const grown = view({ message: { id: 'message-a', text: 'Bonjour' } });
    expect(translateObservedView(opened, grown)).toEqual([
      { type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'message-a', delta: 'Bonjour' },
    ]);
    const switched = view({
      message: { id: 'message-b', text: 'Final' },
      status: 'completed',
      settled: true,
    });
    const events = translateObservedView(grown, switched);
    expect(names(events)).toEqual([
      'STATE_SNAPSHOT',
      'TEXT_MESSAGE_END',
      'TEXT_MESSAGE_START',
      'TEXT_MESSAGE_CONTENT',
      'TEXT_MESSAGE_END',
      'RUN_FINISHED',
    ]);
    expect(events[1]).toEqual({ type: EventType.TEXT_MESSAGE_END, messageId: 'message-a' });
    await expect(
      verified([
        ...translateObservedView(null, empty),
        ...late,
        ...translateObservedView(opened, grown),
        ...events,
      ]),
    ).resolves.toHaveLength(10);
  });

  it.each([
    [
      'replaced text',
      view({ message: { id: 'message-a', text: 'Hello' } }),
      view({ message: { id: 'message-a', text: 'Hola' } }),
    ],
    ['a vanished answer', view({ message: { id: 'message-a', text: 'Hello' } }), view()],
    ['a withdrawn tool call', view({ toolCalls: [tool('tool-1')] }), view()],
    [
      'a reopened tool call',
      view({ toolCalls: [tool('tool-1', 'completed')] }),
      view({ toolCalls: [tool('tool-1')] }),
    ],
  ])('refuses to continue after %s so the browser re-attaches', (_name, previous, next) => {
    expect(() => translateObservedView(previous, next)).toThrow(AgUiTranslationGap);
  });

  it.each([
    ['failed', 'runtime_failed', 'RUN_ERROR'],
    ['timed_out', 'execution_deadline_exceeded', 'RUN_ERROR'],
    ['recovery_required', 'runtime_recovery_gap', 'RUN_ERROR'],
    ['cancelled', null, 'RUN_FINISHED'],
  ] as const)('ends a settled %s execution with %s', async (status, code, expected) => {
    const settled = view({
      status,
      message: { id: 'message-a', text: 'Partial' },
      settled: true,
    });
    const withError = {
      ...settled,
      state: {
        ...settled.state,
        execution: {
          ...settled.state.execution,
          error: code === null ? null : 'Public text.',
          errorCode: code,
        },
      },
    };
    const events = translateObservedView(null, withError);
    expect(names(events)).toEqual([
      'RUN_STARTED',
      'STATE_SNAPSHOT',
      'TEXT_MESSAGE_START',
      'TEXT_MESSAGE_CONTENT',
      'TEXT_MESSAGE_END',
      expected,
    ]);
    expect(events.at(-1)).toEqual(
      expected === 'RUN_ERROR'
        ? { type: EventType.RUN_ERROR, message: 'Public text.', code }
        : { type: EventType.RUN_FINISHED, threadId: conversation.id, runId: executionId },
    );
    await expect(verified(events)).resolves.toHaveLength(6);
  });

  it('keeps a parked interrupted execution open without a lifecycle end', () => {
    const parked = view({ status: 'interrupted', message: { id: 'message-a', text: 'Partial' } });
    expect(names(translateObservedView(null, parked))).toEqual([
      'RUN_STARTED',
      'STATE_SNAPSHOT',
      'TEXT_MESSAGE_START',
      'TEXT_MESSAGE_CONTENT',
    ]);
  });
});
