import { EventType } from '@ag-ui/core';
import { describe, expect, it } from 'vitest';

import {
  translateObservedView,
  type ObservedStep,
} from '@api/modules/stream/application/ag-ui-translation';
import {
  executionId,
  conversation,
  view,
  answer,
  tool,
  nested,
  delegation,
  narration,
  names,
  verified,
} from '../../../support/ag-ui-translation-views';

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
      answer: answer('message-a', 'Hello world'),
      steps: [tool('tool-1', 'completed'), tool('tool-2')],
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
      timestamp: 1_000,
    });
    expect(attach[4]).toEqual({
      type: EventType.TOOL_CALL_RESULT,
      messageId: 'tool-1:result',
      toolCallId: 'tool-1',
      content: 'completed',
      role: 'tool',
      timestamp: 1_500,
    });
    expect(attach.at(-1)).toEqual({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'message-a',
      delta: 'Hello world',
      timestamp: 2_000,
    });
    const done = view({
      status: 'completed',
      answer: answer('message-a', 'Hello world!', 2_500),
      steps: [tool('tool-1', 'completed'), tool('tool-2', 'failed')],
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
    expect(finish[2]).toMatchObject({ delta: '!', timestamp: 2_500 });
    expect(finish.at(-1)).toEqual({
      type: EventType.RUN_FINISHED,
      threadId: conversation.id,
      runId: executionId,
      outcome: { type: 'success' },
      timestamp: 2_500,
    });
    await expect(verified([...attach, ...finish])).resolves.toHaveLength(14);
  });

  it('sends nothing for an identical view and only the state when the product state changes', () => {
    const before = view({ answer: answer('message-a', 'Hi') });
    expect(translateObservedView(before, view({ answer: answer('message-a', 'Hi') }))).toEqual([]);
    const retitled = view({
      answer: answer('message-a', 'Hi'),
      state: { ...before.state, conversation: { ...conversation, title: 'Renamed' } },
    });
    expect(names(translateObservedView(before, retitled))).toEqual(['STATE_SNAPSHOT']);
  });

  it('opens the answer late, appends only new text and turns a replaced answer into narration', async () => {
    const empty = view();
    const opened = view({ answer: answer('message-a', '') });
    const late = translateObservedView(empty, opened);
    expect(late).toEqual([
      {
        type: EventType.TEXT_MESSAGE_START,
        messageId: 'message-a',
        role: 'assistant',
        timestamp: 1_000,
      },
    ]);
    const grown = view({ answer: answer('message-a', 'Bonjour') });
    expect(translateObservedView(opened, grown)).toEqual([
      {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: 'message-a',
        delta: 'Bonjour',
        timestamp: 2_000,
      },
    ]);
    // The former answer keeps growing in the same commit that replaces it: its tail then closes.
    const switched = view({
      steps: [narration('message-a', 'Bonjour !')],
      answer: answer('message-b', 'Final'),
      status: 'completed',
      settled: true,
    });
    const events = translateObservedView(grown, switched);
    expect(names(events)).toEqual([
      'STATE_SNAPSHOT',
      'TEXT_MESSAGE_CONTENT',
      'TEXT_MESSAGE_END',
      'TEXT_MESSAGE_START',
      'TEXT_MESSAGE_CONTENT',
      'TEXT_MESSAGE_END',
      'RUN_FINISHED',
    ]);
    expect(events[1]).toMatchObject({ messageId: 'message-a', delta: ' !' });
    expect(events[2]).toEqual({
      type: EventType.TEXT_MESSAGE_END,
      messageId: 'message-a',
      timestamp: 800,
    });
    await expect(
      verified([
        ...translateObservedView(null, empty),
        ...late,
        ...translateObservedView(opened, grown),
        ...events,
      ]),
    ).resolves.toHaveLength(11);
  });

  it.each([
    [
      'replaced text',
      view({ answer: answer('message-a', 'Hello') }),
      view({ answer: answer('message-a', 'Hola') }),
      'answer_not_prefix',
      'answer',
    ],
    [
      'a vanished answer',
      view({ answer: answer('message-a', 'Hello') }),
      view(),
      'answer_withdrawn',
      'answer',
    ],
    ['a withdrawn tool call', view({ steps: [tool('tool-1')] }), view(), 'withdrawn', 'tool'],
    [
      'a reopened tool call',
      view({ steps: [tool('tool-1', 'completed')] }),
      view({ steps: [tool('tool-1')] }),
      'regressed',
      'tool',
    ],
    [
      'a changed outcome',
      view({ steps: [tool('tool-1', 'completed')] }),
      view({ steps: [tool('tool-1', 'failed')] }),
      'regressed',
      'tool',
    ],
    [
      'a re-parented nested tool',
      view({
        steps: [
          delegation('task-1', 'running', 'running'),
          delegation('task-2', 'running', 'running'),
          nested('call-1', 'task-1'),
        ],
      }),
      view({
        steps: [
          delegation('task-1', 'running', 'running'),
          delegation('task-2', 'running', 'running'),
          nested('call-1', 'task-2'),
        ],
      }),
      'reshaped',
      'tool',
    ],
    [
      'a replaced answer that left no narration behind',
      view({ answer: answer('message-a', 'Hello') }),
      view({ answer: answer('message-b', 'Other') }),
      'answer_replaced',
      'answer',
    ],
    [
      'a narration that became the answer again',
      view({ steps: [narration('message-a', 'Hello')], answer: answer('message-b', 'Other') }),
      view({ steps: [narration('message-b', 'Other')], answer: answer('message-a', 'Hello!') }),
      'answer_reopened',
      'message',
    ],
    [
      'a specialist that vanished from its delegation',
      view({ steps: [delegation('task-1', 'running', 'running')] }),
      view({ steps: [delegation('task-1', 'running')] }),
      'subagent_withdrawn',
      'delegation',
    ],
    [
      'a specialist that reopened',
      view({ steps: [delegation('task-1', 'running', 'completed')] }),
      view({ steps: [delegation('task-1', 'running', 'running')] }),
      'subagent_regressed',
      'delegation',
    ],
    [
      'a narration rewritten',
      view({ steps: [narration('message-a', 'Hello')] }),
      view({ steps: [narration('message-a', 'Hola')] }),
      'text_not_prefix',
      'message',
    ],
  ] as const)(
    'refuses to continue after %s so the browser re-attaches',
    (_name, previous, next, rule, stepKind) => {
      expect(() => translateObservedView(previous, next)).toThrow(
        expect.objectContaining({ name: 'AgUiTranslationGap', rule, stepKind }),
      );
    },
  );

  it.each([
    ['failed', 'runtime_failed', 'RUN_ERROR'],
    ['timed_out', 'execution_deadline_exceeded', 'RUN_ERROR'],
    ['recovery_required', 'runtime_recovery_gap', 'RUN_ERROR'],
    ['cancelled', null, 'RUN_FINISHED'],
  ] as const)('ends a settled %s execution with %s', async (status, code, expected) => {
    const settled = view({
      status,
      answer: answer('message-a', 'Partial'),
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
        ? { type: EventType.RUN_ERROR, message: 'Public text.', code, timestamp: 2_000 }
        : {
            type: EventType.RUN_FINISHED,
            threadId: conversation.id,
            runId: executionId,
            timestamp: 2_000,
          },
    );
    await expect(verified(events)).resolves.toHaveLength(6);
  });

  it('keeps a parked interrupted execution open without a lifecycle end', () => {
    const parked = view({ status: 'interrupted', answer: answer('message-a', 'Partial') });
    expect(names(translateObservedView(null, parked))).toEqual([
      'RUN_STARTED',
      'STATE_SNAPSHOT',
      'TEXT_MESSAGE_START',
      'TEXT_MESSAGE_CONTENT',
    ]);
  });

  it('reports an empty model round trip as a finished step and ignores activity timestamps', async () => {
    const generation: ObservedStep = {
      id: 'g1',
      kind: 'generation',
      label: '',
      status: 'completed',
      startedAt: 1_000,
      finishedAt: 3_500,
    };
    const events = translateObservedView(null, view({ steps: [generation] }));
    expect(names(events)).toEqual([
      'RUN_STARTED',
      'STATE_SNAPSHOT',
      'STEP_STARTED',
      'STEP_FINISHED',
    ]);
    expect(events[2]).toEqual({ type: EventType.STEP_STARTED, stepName: 'g1', timestamp: 1_000 });
    await expect(verified(events)).resolves.toHaveLength(4);
    const before = view({ answer: answer('message-a', 'Hi') });
    const touched = view({
      answer: answer('message-a', 'Hi'),
      state: {
        ...before.state,
        conversation: {
          ...conversation,
          lastActivityAt: '2026-09-16T12:53:45.546Z',
          updatedAt: '2026-09-16T12:53:45.547Z',
        },
      },
    });
    expect(translateObservedView(before, touched)).toEqual([]);
  });

  it('omits timestamps for legacy rows whose moments are unknown', () => {
    const legacy = view({
      answer: { id: 'legacy:answer', text: 'Saved', startedAt: 0, finishedAt: 0 },
    });
    const events = translateObservedView(null, legacy);
    expect(events.every((event) => !('timestamp' in event))).toBe(true);
  });
});
