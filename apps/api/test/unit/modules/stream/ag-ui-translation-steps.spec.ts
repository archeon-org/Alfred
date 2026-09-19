import { EventType } from '@ag-ui/core';
import { describe, expect, it } from 'vitest';

import {
  AgUiTranslationGap,
  translateObservedView,
  type ObservedStep,
} from '@api/modules/stream/application/ag-ui-translation';
import {
  view,
  answer,
  nested,
  delegation,
  marker,
  narration,
  names,
  verified,
} from '../../../support/ag-ui-translation-views';

describe('AG-UI translation of the observed work steps', () => {
  it('replays narration, reasoning markers and a delegation with its specialist and nested tools', async () => {
    const attached = view({
      steps: [
        narration('message-0', 'Je vais explorer la topologie.'),
        marker('reasoning-a', 'completed'),
        delegation('task-1', 'running', 'running'),
        nested('call-1', 'task-1', 'completed'),
        nested('call-2', 'task-1'),
        marker('reasoning-b'),
      ],
      answer: answer('message-a', ''),
    });
    const attach = translateObservedView(null, attached);
    expect(names(attach)).toEqual([
      'RUN_STARTED',
      'STATE_SNAPSHOT',
      'TEXT_MESSAGE_START',
      'TEXT_MESSAGE_CONTENT',
      'TEXT_MESSAGE_END',
      'REASONING_START',
      'REASONING_END',
      'TOOL_CALL_START',
      'TOOL_CALL_END',
      'SUBAGENT_STARTED',
      'TOOL_CALL_START',
      'TOOL_CALL_END',
      'TOOL_CALL_RESULT',
      'TOOL_CALL_START',
      'TOOL_CALL_END',
      'REASONING_START',
      'TEXT_MESSAGE_START',
    ]);
    expect(attach[9]).toEqual({
      type: EventType.SUBAGENT_STARTED,
      subagentRunId: 'task-1',
      name: 'topology_agent',
      parentToolCallId: 'task-1',
      parentMessageId: 'message-a',
      timestamp: 1_000,
    });
    expect(attach[10]).toEqual({
      type: EventType.TOOL_CALL_START,
      toolCallId: 'call-1',
      toolCallName: 'execute_raw',
      subagentRunId: 'task-1',
      timestamp: 1_100,
    });
    expect(attach[12]).toMatchObject({ toolCallId: 'call-1', subagentRunId: 'task-1' });
    expect(JSON.stringify(attach)).not.toContain('description');
    // The specialist ends after its tools, then the delegation reports, then the reasoning ends.
    const progressed = view({
      steps: [
        narration('message-0', 'Je vais explorer la topologie.'),
        marker('reasoning-a', 'completed'),
        delegation('task-1', 'completed', 'completed'),
        nested('call-1', 'task-1', 'completed'),
        nested('call-2', 'task-1', 'failed'),
        marker('reasoning-b', 'completed'),
      ],
      answer: answer('message-a', 'Voici'),
    });
    const progress = translateObservedView(attached, progressed);
    expect(names(progress)).toEqual([
      'TOOL_CALL_RESULT',
      'REASONING_END',
      'TEXT_MESSAGE_CONTENT',
      'SUBAGENT_FINISHED',
      'TOOL_CALL_RESULT',
    ]);
    expect(progress[0]).toMatchObject({ toolCallId: 'call-2', content: 'failed' });
    expect(progress[3]).toEqual({
      type: EventType.SUBAGENT_FINISHED,
      subagentRunId: 'task-1',
      outcome: { type: 'success' },
      timestamp: 1_500,
    });
    expect(progress[4]).toMatchObject({ toolCallId: 'task-1', content: 'completed' });
    const done = view({
      steps: progressed.steps,
      answer: progressed.answer,
      status: 'completed',
      settled: true,
    });
    const finish = translateObservedView(progressed, done);
    expect(names(finish)).toEqual(['STATE_SNAPSHOT', 'TEXT_MESSAGE_END', 'RUN_FINISHED']);
    await expect(verified([...attach, ...progress, ...finish])).resolves.toHaveLength(25);
  });

  it('closes a specialist as interrupted before the lifecycle end of a stopped execution', async () => {
    const running = view({
      steps: [delegation('task-1', 'running', 'running'), nested('call-1', 'task-1')],
      answer: answer('message-a', 'Partial'),
    });
    const stopped = view({
      status: 'cancelled',
      settled: true,
      steps: [
        delegation('task-1', 'interrupted', 'interrupted'),
        nested('call-1', 'task-1', 'interrupted'),
      ],
      answer: answer('message-a', 'Partial'),
    });
    const attach = translateObservedView(null, running);
    const events = translateObservedView(running, stopped);
    expect(names(events)).toEqual([
      'STATE_SNAPSHOT',
      'TOOL_CALL_RESULT',
      'SUBAGENT_ERROR',
      'TOOL_CALL_RESULT',
      'TEXT_MESSAGE_END',
      'RUN_FINISHED',
    ]);
    expect(events[1]).toMatchObject({ toolCallId: 'call-1', content: 'interrupted' });
    expect(events[2]).toEqual({
      type: EventType.SUBAGENT_ERROR,
      subagentRunId: 'task-1',
      message: 'The specialist was interrupted.',
      code: 'interrupted',
      timestamp: 1_500,
    });
    await expect(verified([...attach, ...events])).resolves.toHaveLength(15);
  });

  it('opens a specialist seen at work before its delegation is known and closes it as failed', async () => {
    const step: ObservedStep = {
      id: 'subagent-1',
      kind: 'subagent',
      label: 'subagent',
      status: 'running',
      startedAt: 1_000,
      finishedAt: null,
      specialist: 'knowledge_agent',
      subagentStatus: 'running',
    };
    const attach = translateObservedView(
      null,
      view({ steps: [step, nested('call-1', 'subagent-1')] }),
    );
    expect(names(attach)).toEqual([
      'RUN_STARTED',
      'STATE_SNAPSHOT',
      'SUBAGENT_STARTED',
      'TOOL_CALL_START',
      'TOOL_CALL_END',
    ]);
    expect(attach[2]).toEqual({
      type: EventType.SUBAGENT_STARTED,
      subagentRunId: 'subagent-1',
      name: 'knowledge_agent',
      timestamp: 1_000,
    });
    const failed = translateObservedView(
      view({ steps: [step, nested('call-1', 'subagent-1')] }),
      view({
        steps: [
          { ...step, status: 'failed', subagentStatus: 'failed', finishedAt: 1_500 },
          nested('call-1', 'subagent-1', 'failed'),
        ],
      }),
    );
    expect(names(failed)).toEqual(['TOOL_CALL_RESULT', 'SUBAGENT_ERROR']);
    expect(failed[1]).toMatchObject({ code: 'failed' });
    await expect(verified([...attach, ...failed])).resolves.toHaveLength(7);
  });

  it('never sends reasoning after its end: text growing on a closed marker is a gap', async () => {
    const closed = view({ steps: [{ ...marker('r1', 'completed'), text: 'Je dois ' }] });
    const attach = translateObservedView(null, closed);
    expect(names(attach)).toEqual([
      'RUN_STARTED',
      'STATE_SNAPSHOT',
      'REASONING_START',
      'REASONING_MESSAGE_START',
      'REASONING_MESSAGE_CONTENT',
      'REASONING_MESSAGE_END',
      'REASONING_END',
    ]);
    await expect(verified(attach)).resolves.toHaveLength(7);
    const grown = view({ steps: [{ ...marker('r1', 'completed'), text: 'Je dois vérifier.' }] });
    let gap: unknown;
    try {
      translateObservedView(closed, grown);
    } catch (error) {
      gap = error;
    }
    expect(gap).toBeInstanceOf(AgUiTranslationGap);
    expect(gap).toMatchObject({ rule: 'text_after_close', stepKind: 'reasoning' });
    expect(String((gap as Error).message)).not.toContain('vérifier');
    // A closed marker whose first text arrives late would open a message after its end: a gap too.
    expect(() =>
      translateObservedView(
        view({ steps: [marker('r2', 'completed')] }),
        view({ steps: [{ ...marker('r2', 'completed'), text: 'Tard' }] }),
      ),
    ).toThrow(expect.objectContaining({ rule: 'text_after_close' }));
    // A closed step whose text did not change continues silently.
    expect(translateObservedView(closed, closed)).toEqual([]);
  });

  it('streams reasoning text as a reasoning message and closes it with the marker', async () => {
    const thinking = view({ steps: [{ ...marker('r1'), text: 'Je dois ' }] });
    const attach = translateObservedView(null, thinking);
    expect(names(attach)).toEqual([
      'RUN_STARTED',
      'STATE_SNAPSHOT',
      'REASONING_START',
      'REASONING_MESSAGE_START',
      'REASONING_MESSAGE_CONTENT',
    ]);
    expect(attach[3]).toEqual({
      type: EventType.REASONING_MESSAGE_START,
      messageId: 'r1',
      role: 'reasoning',
      timestamp: 900,
    });
    const grown = view({ steps: [{ ...marker('r1'), text: 'Je dois vérifier.' }] });
    const progress = translateObservedView(thinking, grown);
    expect(progress).toEqual([
      {
        type: EventType.REASONING_MESSAGE_CONTENT,
        messageId: 'r1',
        delta: 'vérifier.',
        timestamp: 900,
      },
    ]);
    const closed = view({
      steps: [{ ...marker('r1', 'completed'), text: 'Je dois vérifier.' }],
      answer: answer('message-a', ''),
    });
    const close = translateObservedView(grown, closed);
    expect(names(close)).toEqual(['REASONING_MESSAGE_END', 'REASONING_END', 'TEXT_MESSAGE_START']);
    await expect(verified([...attach, ...progress, ...close])).resolves.toHaveLength(9);
    // A marker without text (content not exposed) opens no reasoning message at all.
    const silent = translateObservedView(null, view({ steps: [marker('r2', 'completed')] }));
    expect(names(silent)).toEqual([
      'RUN_STARTED',
      'STATE_SNAPSHOT',
      'REASONING_START',
      'REASONING_END',
    ]);
    // A reasoning that first shows text later opens its message then.
    const late = translateObservedView(
      view({ steps: [marker('r3')] }),
      view({ steps: [{ ...marker('r3'), text: 'Hm' }] }),
    );
    expect(names(late)).toEqual(['REASONING_MESSAGE_START', 'REASONING_MESSAGE_CONTENT']);
  });

  it("streams a specialist's message under its invocation and closes it before the specialist ends", async () => {
    const speaking: ObservedStep = {
      id: 'n1',
      kind: 'message',
      label: '',
      status: 'running',
      startedAt: 1_200,
      finishedAt: null,
      text: 'Je regarde ',
      parentId: 'task-1',
    };
    const working = view({ steps: [delegation('task-1', 'running', 'running'), speaking] });
    const attach = translateObservedView(null, working);
    expect(names(attach)).toEqual([
      'RUN_STARTED',
      'STATE_SNAPSHOT',
      'TOOL_CALL_START',
      'TOOL_CALL_END',
      'SUBAGENT_STARTED',
      'TEXT_MESSAGE_START',
      'TEXT_MESSAGE_CONTENT',
    ]);
    expect(attach[5]).toEqual({
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'n1',
      role: 'assistant',
      subagentRunId: 'task-1',
      timestamp: 1_200,
    });
    const done = view({
      steps: [
        delegation('task-1', 'completed', 'completed'),
        { ...speaking, status: 'completed', finishedAt: 1_400, text: 'Je regarde les journaux.' },
      ],
    });
    const progress = translateObservedView(working, done);
    expect(names(progress)).toEqual([
      'TEXT_MESSAGE_CONTENT',
      'TEXT_MESSAGE_END',
      'SUBAGENT_FINISHED',
      'TOOL_CALL_RESULT',
    ]);
    expect(progress[0]).toMatchObject({ delta: 'les journaux.', subagentRunId: 'task-1' });
    await expect(verified([...attach, ...progress])).resolves.toHaveLength(11);
    expect(() =>
      translateObservedView(
        done,
        view({
          steps: [
            delegation('task-1', 'completed', 'completed'),
            { ...speaking, status: 'completed', text: 'Autre chose' },
          ],
        }),
      ),
    ).toThrow(AgUiTranslationGap);
  });

  it('sends the omitted step count on attach and whenever it alone changes', async () => {
    const quiet = view({ steps: [marker('reasoning-a', 'completed')] });
    expect(names(translateObservedView(null, quiet))).not.toContain('CUSTOM');
    const bounded = view({ steps: [marker('reasoning-a', 'completed')], omittedSteps: 3 });
    const attach = translateObservedView(null, bounded);
    expect(attach.find((event) => event.type === EventType.CUSTOM)).toEqual({
      type: EventType.CUSTOM,
      name: 'alfred.work.omitted',
      value: { omittedSteps: 3 },
    });
    expect(translateObservedView(bounded, bounded)).toEqual([]);
    const more = translateObservedView(bounded, { ...bounded, omittedSteps: 5 });
    expect(more).toEqual([
      { type: EventType.CUSTOM, name: 'alfred.work.omitted', value: { omittedSteps: 5 } },
    ]);
    await expect(verified([...attach, ...more])).resolves.toHaveLength(attach.length + 1);
  });
});
