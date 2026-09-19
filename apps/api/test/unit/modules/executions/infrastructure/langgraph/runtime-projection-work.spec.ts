import { describe, expect, it } from 'vitest';

import {
  normalizeProjection,
  projectRuntimeEvent,
  projectionText,
} from '@api/modules/executions/infrastructure/langgraph/runtime-projection';
import {
  OMITTED_MEMO_LIMIT,
  omitStep,
} from '@api/modules/executions/infrastructure/langgraph/runtime-projection-steps';
import {
  projectionMessages,
  projectionWork,
} from '@api/modules/executions/infrastructure/langgraph/runtime-projection-work';
import {
  invocation,
  chunk,
  event,
  at,
  reduce,
  work,
} from '../../../../../support/projection-script';

describe('work log of the runtime projection', () => {
  it('times steps from native positions and falls back to the caller clock', () => {
    const timed = reduce([
      event(at(1_789_557_456_418), 'messages', [chunk('m1', 'Je vais'), {}]),
      event(at(1_789_557_456_900), 'messages', [chunk('m1', ' explorer'), {}]),
    ]);
    const [message] = projectionMessages(timed);
    expect(typeof message?.id).toBe('string');
    expect(message).toMatchObject({
      text: 'Je vais explorer',
      startedAt: 1_789_557_456_418,
      finishedAt: 1_789_557_456_900,
    });
    const untimed = reduce([event('source-1', 'messages', [chunk('m1', 'Hi'), {}])]);
    expect(projectionMessages(untimed)[0]).toMatchObject({ startedAt: 42, finishedAt: 42 });
  });

  it('keeps earlier visible messages as narration steps and the latest as the answer', () => {
    const state = reduce([
      event(at(1_000), 'messages', [chunk('m1', 'Je regarde.'), {}]),
      event(at(2_000), 'messages', [chunk('m2', 'Voici la réponse.'), {}]),
    ]);
    expect(projectionText(state)).toBe('Voici la réponse.');
    const { steps } = work(state);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({
      kind: 'message',
      label: '',
      status: 'completed',
      startedAt: 1_000,
      finishedAt: 1_000,
      text: 'Je regarde.',
    });
    expect(steps[0]).not.toHaveProperty('messageId');
    expect(
      projectionWork(state, { settled: false, endedAt: null, textLimit: 5 }).steps[0]?.text,
    ).toBe('Je r…');
  });

  it('reports running steps of a settled execution as interrupted at its end', () => {
    const state = reduce([
      event(at(1_000), 'messages', [
        chunk('m1', 'Un instant', { tool_calls: [{ id: 'call-1', name: 'search' }] }),
        {},
      ]),
    ]);
    expect(work(state).steps[0]).toMatchObject({
      kind: 'tool',
      status: 'running',
      finishedAt: null,
    });
    expect(work(state, true, 9_000).steps[0]).toMatchObject({
      status: 'interrupted',
      finishedAt: 9_000,
    });
  });

  it('counts steps beyond the bound instead of failing the execution', () => {
    const tools = Array.from({ length: 1_025 }, (_, index) => ({
      id: `t${index}`,
      name: 'search',
    }));
    const state = reduce([
      event(at(1_000), 'messages', [chunk('m1', '', { tool_calls: tools }), {}]),
    ]);
    // The message that issued the calls holds the first step; two calls do not fit.
    expect(state.order).toHaveLength(1_024);
    expect(state.omittedSteps).toBe(2);
    expect(Object.keys(state.activities)).toHaveLength(1_023);
    const late = reduce(
      [event(at(2_000), 'messages', [{ type: 'tool', tool_call_id: 't1024', content: 'x' }, {}])],
      state,
    );
    expect(late.omittedSteps).toBe(2);
    expect(work(late).omittedSteps).toBe(2);
    // The complete message repeating the omitted calls, and more chunks of them, count nothing.
    const repeated = reduce(
      [
        event(at(2_100), 'messages', [chunk('m1', '', { tool_calls: tools.slice(1_023) }), {}]),
        event(at(2_200), 'messages', [
          {
            type: 'ai',
            id: 'm1',
            content: '',
            tool_calls: tools.slice(1_023).map((tool) => ({ ...tool, args: {} })),
          },
          {},
        ]),
      ],
      late,
    );
    expect(repeated.omittedSteps).toBe(2);
    // A new round trip beyond the bound omits two steps, its message and its reasoning, however
    // many reasoning deltas it streams.
    const thinking = reduce(
      Array.from({ length: 5 }, (_, index) =>
        event(at(3_000 + index), 'messages', [
          chunk('m9', '', { additional_kwargs: { reasoning_content: `pensée ${index}` } }),
          {},
        ]),
      ),
      repeated,
    );
    expect(thinking.omittedSteps).toBe(4);
    expect(work(thinking).omittedSteps).toBe(4);
  });

  it('counts an omitted step once only while its digest fits the bounded memory', () => {
    let state = reduce([]);
    for (let index = 0; index < OMITTED_MEMO_LIMIT; index += 1)
      state = omitStep(state, `s${index}`);
    expect(omitStep(state, 's0')).toBe(state);
    // Past the memory, a new omission is counted but not remembered: its repeat counts again.
    const beyond = omitStep(state, 'overflow');
    expect(beyond.omittedSteps).toBe(OMITTED_MEMO_LIMIT + 1);
    expect(omitStep(beyond, 'overflow').omittedSteps).toBe(OMITTED_MEMO_LIMIT + 2);
    expect(beyond.omittedIds).toHaveLength(OMITTED_MEMO_LIMIT);
  });

  it('drops the steps of a message excluded after the fact and keeps the rest', () => {
    const state = reduce([
      event(at(1_000), 'messages/partial', [
        chunk('guard', '', {
          additional_kwargs: { reasoning_content: 'x' },
          tool_calls: [{ id: 'g1', name: 'PromptInjectionDecision' }],
        }),
      ]),
      event(at(1_100), 'messages', [
        chunk('m1', 'Réponse', { tool_calls: [{ id: 'k1', name: 'search' }] }),
        {},
      ]),
      event(at(1_200), 'messages/metadata', { guard: { metadata: { tags: ['guard'] } } }),
    ]);
    expect(state.order).toHaveLength(2);
    expect(Object.keys(state.reasoning)).toHaveLength(0);
    expect(work(state).steps.map((s) => s.label)).toEqual(['search']);
  });

  it('reports an empty model round trip as a generation timed from the moment it was asked', () => {
    const state = reduce([
      event(at(1_000), 'messages', [chunk('m1', 'Bonjour'), {}]),
      event(at(3_500), 'messages', [
        chunk('m2', '', { response_metadata: { finish_reason: 'stop' } }),
        {},
      ]),
      event(at(6_000), 'messages', [chunk('m3', 'Voici.'), {}]),
    ]);
    expect(work(state).steps.map((s) => [s.kind, s.startedAt, s.finishedAt])).toEqual([
      ['message', 1_000, 1_000],
      ['generation', 1_000, 3_500],
    ]);
    expect(projectionText(state)).toBe('Voici.');
    // A round trip that only issued tool calls is not a generation.
    const tools = reduce([
      event(at(1_000), 'messages', [
        chunk('m1', '', { tool_calls: [{ id: 't', name: 'search' }] }),
        {},
      ]),
    ]);
    expect(work(tools).steps.map((s) => s.kind)).toEqual(['tool']);
  });

  it('normalizes a version 1 reducer into the current shape without inventing timings', () => {
    // A stored row of the previous shape: the same hashes, no timings, no steps.
    const seed = reduce([
      event(at(1_000), 'messages', [
        chunk('m1', 'Saved', {
          tool_calls: [
            { id: 't1', name: 'task' },
            { id: 't2', name: 'search' },
          ],
        }),
        {},
      ]),
    ]);
    const [messageId] = seed.messageOrder;
    const activityId = (label: string) =>
      Object.values(seed.activities).find((activity) => activity.label === label)!.id;
    const taskId = activityId('task');
    const searchId = activityId('search');
    const v1 = {
      version: 1,
      sequence: seed.sequence,
      sourceId: seed.sourceId,
      lastId: seed.lastId,
      lastEventDigest: seed.lastEventDigest,
      invocationId: invocation,
      texts: seed.texts,
      excluded: [],
      activities: Object.fromEntries(
        Object.values(seed.activities).map(({ id, label, status, messageId: owner }) => [
          id,
          { id, label, status, messageId: owner },
        ]),
      ),
      visibility: seed.visibility,
      modes: seed.modes,
      messageOrder: seed.messageOrder,
    };
    const normalized = normalizeProjection(v1);
    expect(normalized).toMatchObject({
      version: 2,
      order: [messageId, taskId, searchId],
      omittedSteps: 0,
    });
    expect(normalized?.activities[taskId]).toMatchObject({ kind: 'delegation', startedAt: 0 });
    expect(normalized?.activities[searchId]).toMatchObject({ kind: 'tool', startedAt: 0 });
    expect(work(normalized!).steps.map((s) => [s.kind, s.startedAt])).toEqual([
      ['delegation', 0],
      ['tool', 0],
    ]);
    const next = projectRuntimeEvent(
      normalized!,
      event('s3', 'messages', [chunk('m1', '!'), {}]),
      invocation,
    );
    expect(projectionText(next)).toBe('Saved!');
    expect(normalizeProjection({ version: 3 })).toBeNull();
    expect(normalizeProjection({})).toBeNull();
  });
});
