import { EXECUTION_OUTPUT_MAX_LENGTH } from '@alfred/contracts';
import { describe, expect, it } from 'vitest';

import {
  emptyProjection,
  projectRuntimeEvent,
  projectionActivities,
  projectionText,
  type ProjectionState,
} from '@api/modules/executions/infrastructure/langgraph/runtime-projection';

const invocation = 'invocation-one';
const message = (content: unknown, id = 'message-one') => ({ content, id, type: 'ai' });
const event = (id: string, event: string, data: unknown) => ({ data, event, id });
const project = (state: ProjectionState, id: string, name: string, data: unknown) =>
  projectRuntimeEvent(state, event(id, name, data), invocation);
const metadata = (id = 'message-one') => ({ [id]: { metadata: { langgraph_node: 'model' } } });

describe('private runtime projection', () => {
  it('holds cumulative content until metadata classifies it and supports replacements', () => {
    const initial = emptyProjection();
    const pending = project(initial, '1', 'messages/partial', [message('Bon')]);
    expect(projectionText(pending)).toBe('');
    const allowed = project(pending, '2', 'messages/metadata', metadata());
    expect(projectionText(allowed)).toBe('Bon');
    const complete = project(allowed, '3', 'messages/complete', [message('Bonjour')]);
    expect(projectionText(complete)).toBe('Bonjour');
    const corrected = project(complete, '4', 'values', { messages: [message('Salut')] });
    expect(projectionText(corrected)).toBe('Salut');
    expect(projectionText(initial)).toBe('');
    expect(projectionText(allowed)).toBe('Bon');
  });

  it('restores JSON snapshots and suppresses a duplicate native delta', () => {
    const first = project(emptyProjection(), '1', 'messages', [message('A'), {}]);
    const restored = JSON.parse(JSON.stringify(first)) as ProjectionState;
    expect(project(restored, '1', 'messages', [message('A'), {}])).toBe(restored);
    const second = project(restored, '2', 'messages', [message('B'), {}]);
    expect(projectionText(second)).toBe('AB');
    expect(second.lastId).toBe('2');
    expect(second.sourceId).toBe('2');
    expect(second.sequence).toBe(2);
    expect(second.invocationId).toBe(invocation);
    expect(projectionText(first)).toBe('A');
  });

  it('suppresses replay with the same event name and canonical payload after restoration', () => {
    const first = project(emptyProjection(), '1', 'messages', [
      { content: 'A', id: 'message-one', type: 'ai' },
      { langgraph_node: 'model', tags: [] },
    ]);
    const restored = JSON.parse(JSON.stringify(first)) as ProjectionState;
    expect(restored.lastEventDigest).toMatch(/^[a-f0-9]{64}$/u);
    const replay = project(restored, '1', 'messages', [
      { type: 'ai', id: 'message-one', content: 'A' },
      { tags: [], langgraph_node: 'model' },
    ]);
    expect(replay).toBe(restored);
    expect(projectionText(replay)).toBe('A');
    expect(replay.sequence).toBe(1);
  });

  it('rejects a reused source ID with conflicting content or event name without changing the snapshot', () => {
    const first = project(emptyProjection(), '1', 'messages', [message('A'), {}]);
    const previous = JSON.stringify(first);
    expect(() => project(first, '1', 'messages', [message('PRIVATE CONFLICT'), {}])).toThrow(
      'runtime_event_invalid',
    );
    expect(() => project(first, '1', 'messages/partial', [message('A')])).toThrow(
      'runtime_event_invalid',
    );
    expect(() =>
      project(first, '1', 'messages', [message('A'), { secret: 'PRIVATE CONFLICT' }]),
    ).toThrow('runtime_event_invalid');
    expect(JSON.stringify(first)).toBe(previous);
    expect(projectionText(first)).toBe('A');
    expect(first.sequence).toBe(1);
  });

  it('does not duplicate output when tuple and cumulative modes coexist', () => {
    const tuple = project(emptyProjection(), '1', 'messages', [message('A'), {}]);
    const snapshot = project(tuple, '2', 'messages/partial', [message('AB')]);
    const duplicate = project(snapshot, '3', 'messages', [message('B'), {}]);
    expect(projectionText(duplicate)).toBe('AB');
    const complete = project(duplicate, '4', 'messages/complete', [message('ABC')]);
    expect(projectionText(complete)).toBe('ABC');
  });

  it('withholds nested-graph message text, keeps its tool activity and flags the hidden text', () => {
    const nested =
      'messages|specialist:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa|model:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const first = project(emptyProjection(), '1', nested, [
      {
        ...message('Nested '),
        type: 'AIMessageChunk',
        tool_calls: [{ id: 'tool-1', name: 'search', args: { q: 'PRIVATE' } }],
      },
      { langgraph_node: 'model' },
    ]);
    const second = project(first, '2', nested, [
      { ...message('answer'), type: 'AIMessageChunk' },
      { langgraph_node: 'model' },
    ]);
    expect(projectionText(second)).toBe('');
    expect(second.hiddenText).toBe(true);
    const [activity, ...others] = projectionActivities(second);
    expect(others).toHaveLength(0);
    expect(activity).toMatchObject({ label: 'search', status: 'running' });
    expect(typeof activity?.id).toBe('string');
    expect(JSON.stringify(second)).not.toContain('Nested');
    expect(JSON.stringify(second)).not.toContain('PRIVATE');
    const root = project(second, '3', 'messages', [message('Root answer', 'root'), {}]);
    expect(projectionText(root)).toBe('Root answer');
    expect(root.hiddenText).toBe(true);
    expect(() =>
      project(second, '2', 'messages|other:cccccccc-cccc-4ccc-8ccc-cccccccccccc', [
        { ...message('answer'), type: 'AIMessageChunk' },
        { langgraph_node: 'model' },
      ]),
    ).toThrow('runtime_event_invalid');
  });

  it.each([
    ['error|child:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', { reason: 'PRIVATE' }, 'runtime_failed'],
    [
      'interrupt|child:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      { reason: 'PRIVATE' },
      'runtime_interrupted',
    ],
    [
      'updates|child:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      { __interrupt__: [{ value: 'PRIVATE' }] },
      'runtime_interrupted',
    ],
    [
      'values|child:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      { __interrupt__: [{ value: 'PRIVATE' }] },
      'runtime_interrupted',
    ],
  ])('handles namespaced %s without treating it as a diagnostic', (name, data, code) => {
    expect(() => project(emptyProjection(), '1', name, data)).toThrow(code);
  });

  it('requires replay IDs and valid namespace components for nested semantic frames', () => {
    expect(() => project(emptyProjection(), '', 'messages|child:id', [message('A'), {}])).toThrow(
      'runtime_source_id_missing',
    );
    expect(() => project(emptyProjection(), '1', 'messages|', [message('A'), {}])).toThrow(
      'runtime_event_invalid',
    );
    expect(() => project(emptyProjection(), '1', 'updates||child:id', {})).toThrow(
      'runtime_event_invalid',
    );
  });

  it('replays native 0.14 nested tuples without exposing child text or parent update history', () => {
    // Shape captured from the isolated native fixture: one tuple, child update, parent update.
    const namespace = 'specialist:03477786-f2da-044c-2c6b-6f6841ea87a2';
    const answer = { ...message('CHILD_TEXT'), tool_calls: [] };
    const frames = [
      event('10-0', `messages|${namespace}`, [
        answer,
        {
          langgraph_node: 'quiet_work',
          langgraph_checkpoint_ns: 'PRIVATE_NAMESPACE',
        },
      ]),
      event('10-1', `updates|${namespace}`, { quiet_work: { messages: [answer] } }),
      event('10-2', 'updates', {
        specialist: {
          messages: [{ type: 'human', id: 'previous-human', content: 'PRIVATE_HISTORY' }, answer],
        },
      }),
    ];
    const initial = projectRuntimeEvent(emptyProjection(), frames[0]!, invocation);
    const restored = JSON.parse(JSON.stringify(initial)) as ProjectionState;
    const recovered = frames.reduce(
      (state, frame) => projectRuntimeEvent(state, frame, invocation),
      restored,
    );
    expect(projectionText(recovered)).toBe('');
    expect(recovered.hiddenText).toBe(true);
    expect(Object.keys(recovered.texts)).toHaveLength(0);
    expect(recovered.sequence).toBe(3);
    expect(JSON.stringify(recovered)).not.toContain('CHILD_TEXT');
    expect(JSON.stringify(recovered)).not.toContain('PRIVATE_HISTORY');
    expect(JSON.stringify(recovered)).not.toContain('PRIVATE_NAMESPACE');
  });

  it.each(['non-generation', 'non_generation', 'guard'])('never exposes late %s content', (tag) => {
    const first = project(emptyProjection(), '1', 'messages', [message('Answer'), {}]);
    const pending = project(first, '2', 'messages/partial', [
      message('SYNTHETIC_PRIVATE_VALUE', 'guard'),
    ]);
    expect(projectionText(pending)).toBe('Answer');
    const excluded = project(pending, '3', 'messages/metadata', {
      guard: { metadata: { tags: [tag] } },
    });
    expect(projectionText(excluded)).toBe('Answer');
    expect(JSON.stringify(excluded)).not.toContain('SYNTHETIC_PRIVATE_VALUE');
    const replay = project(excluded, '4', 'messages', [message('still private', 'guard'), {}]);
    expect(projectionText(replay)).toBe('Answer');
  });

  it('excludes middleware nodes before text and does not retain metadata', () => {
    const classified = project(emptyProjection(), '1', 'messages/metadata', {
      private: { metadata: { langgraph_node: 'GuardMiddleware.before_agent', secret: 'PRIVATE' } },
    });
    const projected = project(classified, '2', 'messages/partial', [message('PRIVATE', 'private')]);
    expect(projectionText(projected)).toBe('');
    expect(JSON.stringify(projected)).not.toContain('PRIVATE');
    expect(JSON.stringify(projected)).not.toContain('GuardMiddleware');
  });

  it('only projects text blocks and strips transport control characters', () => {
    const state = project(emptyProjection(), '1', 'messages', [
      message([
        { type: 'text', text: 'Hello\u0000' },
        { type: 'reasoning', text: 'PRIVATE' },
        ' world\n',
      ]),
      {},
    ]);
    expect(projectionText(state)).toBe('Hello world\n');
    expect(JSON.stringify(state)).not.toContain('PRIVATE');
  });

  it('tracks the most recently touched allowed message across interleaved nodes', () => {
    const first = project(emptyProjection(), '1', 'messages', [message('First'), {}]);
    const second = project(first, '2', 'messages', [message('Second', 'two'), {}]);
    const latest = project(second, '3', 'messages', [message(' update'), {}]);
    expect(projectionText(latest)).toBe('First update');
  });

  it('keeps diagnostic, custom, checkpoint and graph state payloads private', () => {
    const names = ['metadata', 'custom', 'debug', 'checkpoints', 'tasks', 'updates', 'unknown'];
    const state = names.reduce(
      (state, name, index) =>
        project(state, String(index), name, {
          secret: 'SYNTHETIC_PRIVATE_VALUE',
        }),
      emptyProjection(),
    );
    expect(projectionText(state)).toBe('');
    expect(JSON.stringify(state)).not.toContain('SYNTHETIC_PRIVATE_VALUE');
  });

  it('projects bounded tool lifecycle without arguments, results or raw runtime IDs', () => {
    const first = project(emptyProjection(), '1', 'messages', [
      {
        ...message(''),
        tool_calls: [{ id: 'runtime-tool-id', name: 'search', args: { secret: 'PRIVATE' } }],
      },
      {},
    ]);
    const activity = projectionActivities(first)[0];
    expect(activity?.id).toMatch(/^[a-f0-9]{64}$/u);
    expect(activity).toMatchObject({ label: 'search', status: 'running' });
    expect(activity?.id).not.toContain('runtime-tool-id');
    expect(JSON.stringify(first)).not.toContain('PRIVATE');
    const complete = project(first, '2', 'values', {
      messages: [
        {
          type: 'tool',
          tool_call_id: 'runtime-tool-id',
          content: 'PRIVATE RESULT',
          status: 'success',
        },
      ],
    });
    expect(projectionActivities(complete)).toEqual([{ ...activity, status: 'completed' }]);
    expect(JSON.stringify(complete)).not.toContain('PRIVATE RESULT');
    const other = projectRuntimeEvent(
      emptyProjection(),
      event('1', 'messages', [
        {
          ...message(''),
          tool_calls: [{ id: 'runtime-tool-id', name: 'search' }],
        },
        {},
      ]),
      'another-invocation',
    );
    expect(projectionActivities(other)[0]?.id).not.toBe(activity?.id);
  });

  it('keeps tool activity private while its containing message is unclassified', () => {
    const pending = project(emptyProjection(), '1', 'messages/partial', [
      {
        ...message(''),
        tool_calls: [{ id: 'tool-id', name: 'search' }],
      },
    ]);
    expect(projectionActivities(pending)).toEqual([]);
    const allowed = project(pending, '2', 'messages/metadata', metadata());
    expect(projectionActivities(allowed)).toHaveLength(1);
  });

  it('preserves the visible answer during an empty tool call and handles tool failure safely', () => {
    const answer = project(emptyProjection(), '1', 'messages', [message('Answer'), {}]);
    const tool = project(answer, '2', 'messages', [
      {
        ...message('', 'tool-message'),
        tool_calls: [{ id: 'tool', name: '<unsafe>' }],
      },
      {},
    ]);
    expect(projectionText(tool)).toBe('Answer');
    expect(projectionActivities(tool)[0]?.label).toBe('Tool');
    const failed = project(tool, '3', 'values', {
      messages: [
        {
          type: 'tool',
          tool_call_id: 'tool',
          content: 'PRIVATE FAILURE',
          status: 'error',
        },
      ],
    });
    expect(projectionActivities(failed)[0]?.status).toBe('failed');
    expect(JSON.stringify(failed)).not.toContain('PRIVATE FAILURE');
  });

  it('does not replace a completed tool with a replayed cumulative call snapshot', () => {
    const call = { ...message(''), tool_calls: [{ id: 'tool', name: 'search' }] };
    const running = project(emptyProjection(), '1', 'messages', [call, {}]);
    const completed = project(running, '2', 'values', {
      messages: [
        {
          type: 'tool',
          tool_call_id: 'tool',
          content: 'result',
        },
      ],
    });
    const replayed = project(completed, '3', 'messages/complete', [call]);
    expect(projectionActivities(replayed)[0]?.status).toBe('completed');
  });

  it('ignores incomplete tool call chunks until a complete call ID is available', () => {
    const chunk = project(emptyProjection(), '1', 'messages', [
      {
        content: '',
        id: 'message-one',
        type: 'AIMessageChunk',
        tool_calls: [{ id: null, name: null, args: {} }],
      },
      {},
    ]);
    expect(projectionActivities(chunk)).toEqual([]);
    const complete = project(chunk, '2', 'messages/complete', [
      {
        ...message(''),
        tool_calls: [{ id: 'tool', name: 'search' }],
      },
    ]);
    expect(projectionActivities(complete)[0]?.status).toBe('running');
  });

  it('rejects cross-invocation and malformed restored states with stable errors', () => {
    const saved = project(emptyProjection(), '1', 'messages', [message('A'), {}]);
    expect(() => projectRuntimeEvent(saved, event('2', 'metadata', {}), 'different')).toThrow(
      'runtime_event_invalid',
    );
    expect(() => project({ ...saved, sequence: -1 }, '2', 'metadata', {})).toThrow(
      'runtime_event_invalid',
    );
    expect(() => project({ ...saved, sourceId: 'mismatch' }, '2', 'metadata', {})).toThrow(
      'runtime_event_invalid',
    );
  });

  it('bounds message classifications and activity accumulation across events', () => {
    const tooMany = Object.fromEntries(
      Array.from({ length: 513 }, (_, index) => [String(index), {}]),
    );
    expect(() => project(emptyProjection(), '1', 'messages/metadata', tooMany)).toThrow(
      'runtime_projection_limit',
    );
    const tools = Array.from({ length: 129 }, (_, index) => ({
      id: String(index),
      name: 'search',
    }));
    expect(() =>
      project(emptyProjection(), '1', 'messages', [{ ...message(''), tool_calls: tools }, {}]),
    ).toThrow('runtime_projection_limit');
  });

  it.each([
    ['error', { message: 'PRIVATE' }, 'runtime_failed'],
    ['interrupt', { reason: 'PRIVATE' }, 'runtime_interrupted'],
    ['updates', { node: { __interrupt__: [{ value: 'PRIVATE' }] } }, 'runtime_interrupted'],
    ['values', { __interrupt__: [{ value: 'PRIVATE' }] }, 'runtime_interrupted'],
  ])('rejects %s with a fixed safe error', (name, data, code) => {
    expect(() => project(emptyProjection(), '1', name, data)).toThrow(code);
    expect(() => project(emptyProjection(), '1', name, data)).not.toThrow('PRIVATE');
  });

  it('rejects malformed semantic events and absent resumable source IDs', () => {
    expect(() => project(emptyProjection(), '', 'messages', [message('x'), {}])).toThrow(
      'runtime_source_id_missing',
    );
    expect(() => project(emptyProjection(), '1', 'messages/partial', 'no')).toThrow(
      'runtime_event_invalid',
    );
    expect(() =>
      project(emptyProjection(), '1', 'messages', [{ content: 'x', type: 'ai' }, {}]),
    ).toThrow('runtime_event_invalid');
    expect(() => project(emptyProjection(), '1', 'values', null)).toThrow('runtime_event_invalid');
    expect(project(emptyProjection(), '', 'metadata', {})).toEqual(emptyProjection());
  });

  it('rejects excessive events and serializable state without echoing data', () => {
    expect(() =>
      project(emptyProjection(), '1', 'messages', [message('x'.repeat(600_000)), {}]),
    ).toThrow('runtime_projection_limit');
    const many = Array.from({ length: 513 }, (_, index) => message('x', String(index)));
    expect(() => project(emptyProjection(), '1', 'messages/partial', many)).toThrow(
      'runtime_projection_limit',
    );
    const tooDeep = { value: {} };
    let deepest = tooDeep;
    for (let index = 0; index < 30; index += 1) {
      const next = { value: {} };
      deepest.value = next;
      deepest = next;
    }
    expect(() => project(emptyProjection(), '1', 'updates', tooDeep)).toThrow(
      'runtime_projection_limit',
    );
  });

  it('accepts the shared output boundary and rejects one additional ASCII byte', () => {
    const text = 'a'.repeat(EXECUTION_OUTPUT_MAX_LENGTH);
    const boundary = project(emptyProjection(), '1', 'messages', [message(text), {}]);
    expect(projectionText(boundary)).toBe(text);
    expect(() => project(boundary, '2', 'messages', [message('a'), {}])).toThrow(
      'runtime_projection_limit',
    );
    expect(() => project(emptyProjection(), '1', 'messages', [message(`${text}a`), {}])).toThrow(
      'runtime_projection_limit',
    );
    expect(projectionText(boundary)).toBe(text);
  });

  it('enforces the shared bound conservatively in UTF-8 bytes for Unicode output', () => {
    const text = 'é'.repeat(EXECUTION_OUTPUT_MAX_LENGTH / 2);
    const boundary = project(emptyProjection(), '1', 'messages', [message(text), {}]);
    expect(Buffer.byteLength(projectionText(boundary), 'utf8')).toBe(EXECUTION_OUTPUT_MAX_LENGTH);
    expect(() => project(boundary, '2', 'messages', [message('a'), {}])).toThrow(
      'runtime_projection_limit',
    );
    expect(() => project(emptyProjection(), '1', 'messages', [message(`${text}a`), {}])).toThrow(
      'runtime_projection_limit',
    );
  });

  it('rejects a contradictory exclusion after disclosure instead of silently retracting', () => {
    const visible = project(emptyProjection(), '1', 'messages', [message('answer'), {}]);
    expect(() =>
      project(visible, '2', 'messages/metadata', { 'message-one': { tags: ['guard'] } }),
    ).toThrow('runtime_event_invalid');
  });
});
