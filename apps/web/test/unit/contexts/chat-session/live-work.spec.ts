import { EXECUTION_WORK_MAX_STEPS, EXECUTION_WORK_TEXT_MAX_LENGTH } from '@alfred/contracts';
import { describe, expect, it } from 'vitest';

import { LiveWork } from '@/contexts/chat-session/live-work';
import { snapshot } from '../../../support/executions-api';

describe('live work log', () => {
  it('turns a replaced message into narration and keeps the open one as the answer', () => {
    const work = new LiveWork();
    work.messageStart('m1', 1_000, '');
    work.messageDelta('m1', 1_400);
    expect(work.view.steps).toEqual([]);
    work.messageStart('m2', 2_000, 'Je regarde la topologie.');
    expect(work.view.steps).toEqual([
      {
        id: 'm1',
        kind: 'message',
        label: '',
        status: 'completed',
        startedAt: 1_000,
        finishedAt: 1_400,
        text: 'Je regarde la topologie.',
      },
    ]);
    work.messageStart('m3', undefined, 'x'.repeat(EXECUTION_WORK_TEXT_MAX_LENGTH + 10));
    expect(work.view.steps[1]?.text).toHaveLength(EXECUTION_WORK_TEXT_MAX_LENGTH);
    expect(work.view.steps[1]).toMatchObject({ startedAt: 2_000, finishedAt: 2_000 });
  });

  it('keeps narration before the steps that followed it and ends it with its last content', () => {
    const work = new LiveWork();
    work.messageStart('m1', 1_000, '');
    work.messageDelta('m1', 1_400);
    work.messageEnd('m1', 1_400);
    expect(work.toolStart('t1', 'search', 1_500, undefined)).toBe(true);
    work.toolResult('t1', 'completed', 5_000);
    work.messageStart('m2', 5_100, 'Je cherche.');
    expect(work.view.steps.map((step) => [step.id, step.startedAt, step.finishedAt])).toEqual([
      ['m1', 1_000, 1_400],
      ['t1', 1_500, 5_000],
    ]);
    // The open answer holds its place without showing, also after a JSON read.
    work.read(snapshot({ work: work.view }));
    work.toolStart('t2', 'read', 5_200, undefined);
    work.messageStart('m3', 6_000, 'Je lis.');
    expect(work.view.steps.map((step) => step.id)).toEqual(['m1', 't1', 'm2', 't2']);
  });

  it('records reasoning markers, tools and their outcomes with server moments', () => {
    const work = new LiveWork();
    work.reasoningStart('r1', 900, undefined);
    expect(work.toolStart('t1', 'search', 1_000, undefined)).toBe(true);
    expect(work.toolStart('t1', 'search', 1_000, undefined)).toBe(false);
    work.reasoningEnd('r1', 950);
    work.toolResult('t1', 'failed', 1_500);
    work.toolResult('t1', 'completed', 1_600);
    expect(work.view.steps).toEqual([
      {
        id: 'r1',
        kind: 'reasoning',
        label: '',
        status: 'completed',
        startedAt: 900,
        finishedAt: 950,
      },
      {
        id: 't1',
        kind: 'tool',
        label: 'search',
        status: 'failed',
        startedAt: 1_000,
        finishedAt: 1_500,
      },
    ]);
    work.toolStart('t2', 'read', undefined, undefined);
    work.toolResult('t2', 'interrupted', undefined);
    expect(work.view.steps[2]).toMatchObject({
      status: 'interrupted',
      startedAt: 0,
      finishedAt: null,
    });
  });

  it('nests a specialist under its delegation and closes it with its outcome', () => {
    const work = new LiveWork();
    work.toolStart('task-1', 'task', 1_000, undefined);
    work.subagentStarted('task-1', 'topology_agent', 1_050, 'task-1');
    work.toolStart('call-1', 'execute_raw', 1_100, 'task-1');
    work.toolResult('call-1', 'completed', 1_200);
    work.subagentFinished('task-1', 1_400);
    work.toolResult('task-1', 'completed', 1_500);
    expect(work.view.steps).toEqual([
      {
        id: 'task-1',
        kind: 'delegation',
        label: 'task',
        status: 'completed',
        startedAt: 1_000,
        finishedAt: 1_500,
        specialist: 'topology_agent',
        subagentStatus: 'completed',
      },
      {
        id: 'call-1',
        kind: 'tool',
        label: 'execute_raw',
        status: 'completed',
        startedAt: 1_100,
        finishedAt: 1_200,
        parentId: 'task-1',
      },
    ]);
  });

  it('keeps a specialist seen before its delegation as its own step and marks its errors', () => {
    const work = new LiveWork();
    work.subagentStarted('s1', 'knowledge_agent', 1_000, undefined);
    work.subagentStarted('s1', 'knowledge_agent', 1_000, undefined);
    work.subagentError('s1', 'interrupted', 1_300);
    work.subagentError('s1', 'failed', 1_400);
    expect(work.view.steps).toEqual([
      {
        id: 's1',
        kind: 'subagent',
        label: 'subagent',
        status: 'interrupted',
        startedAt: 1_000,
        finishedAt: 1_300,
        specialist: 'knowledge_agent',
        subagentStatus: 'interrupted',
      },
    ]);
  });

  it('takes the work of a JSON read, derives untimed tools from an older API and resets', () => {
    const work = new LiveWork();
    work.toolStart('stream-tool', 'search', 1_000, undefined);
    work.read(
      snapshot({
        work: {
          steps: [
            {
              id: 'a',
              kind: 'tool',
              label: 'grep',
              status: 'completed',
              startedAt: 1,
              finishedAt: 2,
            },
          ],
          omittedSteps: 3,
        },
      }),
    );
    expect(work.view).toEqual({
      steps: [
        { id: 'a', kind: 'tool', label: 'grep', status: 'completed', startedAt: 1, finishedAt: 2 },
      ],
      omittedSteps: 3,
    });
    work.read(
      snapshot({
        activities: [{ id: 'b', label: 'read', status: 'running' }],
        execution: { ...snapshot().execution, startedAt: '2026-09-11T09:00:00.000Z' },
      }),
    );
    expect(work.view.steps).toEqual([
      {
        id: 'b',
        kind: 'tool',
        label: 'read',
        status: 'running',
        startedAt: Date.parse('2026-09-11T09:00:00.000Z'),
        finishedAt: null,
      },
    ]);
    work.reset();
    expect(work.view).toEqual({ steps: [], omittedSteps: 0 });
  });

  it("streams reasoning text, a specialist's message and empty generations into the log", () => {
    const work = new LiveWork();
    work.generationStarted('g1', 500);
    work.generationFinished('g1', 900);
    work.reasoningStart('r1', 1_000, undefined);
    work.reasoningDelta('r1', 'Je dois ', 1_100);
    work.reasoningDelta('r1', 'vérifier.', 1_200);
    work.toolStart('task-1', 'task', 2_000, undefined);
    work.subagentStarted('task-1', 'incident_agent', 2_050, 'task-1');
    work.childMessageStart('n1', 2_100, 'task-1');
    work.childMessageDelta('n1', 'Je regarde ', 2_200);
    work.reasoningEnd('r1', 1_200);
    expect(
      work.view.steps.map((s) => [s.kind, s.status, s.text ?? null, s.parentId ?? null]),
    ).toEqual([
      ['generation', 'completed', null, null],
      ['reasoning', 'completed', 'Je dois vérifier.', null],
      ['delegation', 'running', null, null],
      ['message', 'running', 'Je regarde ', 'task-1'],
    ]);
    work.childMessageDelta('n1', 'les journaux.', 2_300);
    work.childMessageEnd('n1', 2_400);
    expect(work.view.steps[3]).toMatchObject({
      status: 'completed',
      text: 'Je regarde les journaux.',
      finishedAt: 2_400,
    });
    // Text never grows past its bound or after its step closed.
    work.childMessageDelta('n1', 'trop tard', 2_500);
    expect(work.view.steps[3]?.text).toBe('Je regarde les journaux.');
    work.reasoningStart('r2', 3_000, 'task-1');
    work.reasoningDelta('r2', 'x'.repeat(40_000), 3_100);
    expect(work.view.steps[4]?.text).toHaveLength(32_768);
    expect(work.view.steps[4]).toMatchObject({ parentId: 'task-1', status: 'running' });
  });

  it("takes the stream's omitted step count without lowering a known one", () => {
    const work = new LiveWork();
    work.omittedFrom(4);
    expect(work.view.omittedSteps).toBe(4);
    work.omittedFrom(2);
    expect(work.view.omittedSteps).toBe(4);
    work.reset();
    expect(work.view.omittedSteps).toBe(0);
  });

  it('counts steps beyond the bound instead of growing without limit', () => {
    const work = new LiveWork();
    for (let index = 0; index <= EXECUTION_WORK_MAX_STEPS; index += 1)
      work.toolStart(`t${index}`, 'search', 1_000, undefined);
    expect(work.view.steps).toHaveLength(EXECUTION_WORK_MAX_STEPS);
    expect(work.view.omittedSteps).toBe(1);
  });
});
