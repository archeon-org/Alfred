import { describe, expect, it } from 'vitest';

import { projectionText } from '@api/modules/executions/infrastructure/langgraph/runtime-projection';
import {
  NS_A,
  chunk,
  event,
  at,
  reduce,
  reduceMarkers,
  work,
} from '../../../../../support/projection-script';

describe('reasoning and specialist content in the runtime projection work log', () => {
  it('marks hidden reasoning by presence and timing only when content is not exposed', () => {
    const state = reduceMarkers([
      event(at(1_000), 'messages', [
        chunk('m1', '', { additional_kwargs: { reasoning_content: 'PRIVATE THOUGHT' } }),
        {},
      ]),
      event(at(1_400), 'messages', [
        chunk('m1', '', { content: [{ type: 'reasoning', text: 'PRIVATE AGAIN' }] }),
        {},
      ]),
      event(at(2_000), 'messages', [chunk('m1', 'Réponse.'), {}]),
    ]);
    expect(JSON.stringify(state)).not.toContain('PRIVATE');
    const marker = Object.values(state.reasoning)[0];
    expect(marker).toMatchObject({ startedAt: 1_000, finishedAt: 1_400, chunks: 2 });
    const { steps } = work(state);
    expect(steps).toEqual([
      expect.objectContaining({
        kind: 'reasoning',
        status: 'completed',
        startedAt: 1_000,
        finishedAt: 1_400,
      }),
    ]);
    // A marker still last in the log is open until the execution settles.
    const thinking = reduce([
      event(at(1_000), 'messages', [
        chunk('m1', '', { additional_kwargs: { reasoning_content: 'x' } }),
        {},
      ]),
    ]);
    expect(work(thinking).steps[0]).toMatchObject({ status: 'running', finishedAt: null });
    expect(work(thinking, true, 5_000).steps[0]).toMatchObject({
      status: 'completed',
      finishedAt: 1_000,
    });
  });

  it('records the reasoning text as it streams and closes it when the next step begins', () => {
    const state = reduce([
      event(at(1_000), 'messages', [
        chunk('m1', '', { additional_kwargs: { reasoning_content: 'Je dois ' } }),
        {},
      ]),
      event(at(1_200), 'messages', [
        chunk('m1', '', { additional_kwargs: { reasoning_content: 'vérifier.' } }),
        {},
      ]),
    ]);
    const [marker] = work(state).steps;
    expect(marker).toMatchObject({
      kind: 'reasoning',
      status: 'running',
      text: 'Je dois vérifier.',
      startedAt: 1_000,
      finishedAt: null,
    });
    const answered = reduce([event(at(2_000), 'messages', [chunk('m1', 'Réponse.'), {}])], state);
    expect(work(answered).steps).toEqual([
      expect.objectContaining({ kind: 'reasoning', status: 'completed', finishedAt: 1_200 }),
    ]);
    expect(projectionText(answered)).toBe('Réponse.');
    expect(work(answered).steps[0]).not.toHaveProperty('parentId');
  });

  it('keeps a specialist message and its reasoning under the delegation, open while it grows', () => {
    const state = reduce([
      event(at(1_000), 'messages', [
        chunk('m1', '', {
          tool_calls: [
            { id: 'call-task', name: 'task', args: { subagent_type: 'incident_agent' } },
          ],
        }),
        {},
      ]),
      event(at(1_100), `messages|${NS_A}`, [
        chunk('n1', '', { additional_kwargs: { reasoning_content: 'Chercher les logs.' } }),
        { lc_agent_name: 'incident_agent' },
      ]),
      event(at(1_200), `messages|${NS_A}`, [
        chunk('n1', 'Je regarde ', { additional_kwargs: {} }),
        { lc_agent_name: 'incident_agent' },
      ]),
      event(at(1_300), `messages|${NS_A}`, [
        chunk('n1', 'les journaux.'),
        { lc_agent_name: 'incident_agent' },
      ]),
    ]);
    const delegationId = Object.values(state.activities)[0]!.id;
    const steps = work(state).steps;
    expect(steps.map((s) => [s.kind, s.status, s.parentId ?? null, s.text ?? null])).toEqual([
      ['delegation', 'running', null, null],
      ['reasoning', 'completed', delegationId, 'Chercher les logs.'],
      ['message', 'running', delegationId, 'Je regarde les journaux.'],
    ]);
    expect(state.hiddenText).toBe(true);
    expect(projectionText(state)).toBe('');
    const finished = reduce(
      [
        event(at(2_000), 'messages', [
          {
            type: 'tool',
            tool_call_id: 'call-task',
            name: 'task',
            content: 'REPORT',
            status: 'success',
          },
          { langgraph_checkpoint_ns: NS_A },
        ]),
      ],
      state,
    );
    expect(work(finished).steps[2]).toMatchObject({ status: 'completed', finishedAt: 1_300 });
    expect(JSON.stringify(finished)).not.toContain('REPORT');
  });

  it('marks presence only and withholds specialist text when content is not exposed', () => {
    const state = reduceMarkers([
      event(at(1_000), 'messages', [
        chunk('m1', '', { additional_kwargs: { reasoning_content: 'PRIVATE THOUGHT' } }),
        {},
      ]),
      event(at(1_100), `messages|${NS_A}`, [
        chunk('n1', 'CHILD TEXT', { additional_kwargs: { reasoning_content: 'CHILD THOUGHT' } }),
        { lc_agent_name: 'incident_agent' },
      ]),
    ]);
    const serialized = JSON.stringify(state);
    for (const word of ['PRIVATE', 'CHILD TEXT', 'CHILD THOUGHT']) {
      expect(serialized).not.toContain(word);
    }
    expect(state.childMessages).toEqual({});
    expect(Object.values(state.reasoning).map((m) => [m.text, m.chunks])).toEqual([
      ['', 1],
      ['', 1],
    ]);
    expect(state.contentBytes).toBe(0);
  });

  it('bounds reasoning and specialist text and marks what was cut', () => {
    const long = 'x'.repeat(40_000);
    const state = reduce([
      event(at(1_000), 'messages', [
        chunk('m1', '', { additional_kwargs: { reasoning_content: long } }),
        {},
      ]),
      event(at(1_100), `messages|${NS_A}`, [
        chunk('n1', 'y'.repeat(9_000)),
        { lc_agent_name: 'incident_agent' },
      ]),
    ]);
    const [marker] = Object.values(state.reasoning);
    expect(marker?.text).toHaveLength(32_768);
    expect(marker?.truncated).toBe(true);
    const [child] = Object.values(state.childMessages);
    expect(child?.text).toHaveLength(8_000);
    expect(child?.truncated).toBe(true);
    expect(state.contentBytes).toBe(32_768 + 8_000);
    // The JSON profile bounds narration and reasoning further.
    expect(work(state).steps[0]?.text).toHaveLength(4_000);
  });

  it('truncates multi-byte text against the byte budget instead of failing the projection', () => {
    const wide = '界'.repeat(32_768);
    const state = reduce(
      ['m1', 'm2', 'm3'].map((id, index) =>
        event(at(1_000 + index * 100), 'messages', [
          chunk(id, '', { additional_kwargs: { reasoning_content: wide } }),
          {},
        ]),
      ),
    );
    expect(state.contentBytes).toBeLessThanOrEqual(256 * 1024);
    const markers = Object.values(state.reasoning);
    expect(markers.map((marker) => marker.text.length)).toEqual([32_768, 32_768, 21_845]);
    expect(markers[2]?.truncated).toBe(true);
    expect(state.contentBytes).toBe(3 * (32_768 + 32_768 + 21_845));
  });

  it('bounds the JavaScript length of astral text without splitting a code point', () => {
    const state = reduce([
      event(at(1_000), 'messages', [
        chunk('m1', '', { additional_kwargs: { reasoning_content: '😀'.repeat(20_000) } }),
        {},
      ]),
      event(at(1_100), `messages|${NS_A}`, [
        chunk('n1', `a${'😀'.repeat(5_000)}`),
        { lc_agent_name: 'incident_agent' },
      ]),
    ]);
    const [marker] = Object.values(state.reasoning);
    expect(marker?.text).toHaveLength(32_768);
    expect(marker?.text.endsWith('😀')).toBe(true);
    expect(marker?.truncated).toBe(true);
    const [child] = Object.values(state.childMessages);
    expect(child?.text).toHaveLength(7_999);
    expect(child?.truncated).toBe(true);
    expect(state.contentBytes).toBe(Buffer.byteLength(marker!.text + child!.text, 'utf8'));
    const narration = work(state).steps.find((step) => step.kind === 'reasoning')?.text ?? '';
    expect(narration.length).toBeLessThanOrEqual(4_000);
    expect(narration).not.toMatch(/[\uD800-\uDBFF]…$/);
  });

  it('keeps continuations with their message when it is excluded and when content is off', () => {
    const frames = [
      event(at(1_000), 'messages/partial', [
        chunk('m1', '', { additional_kwargs: { reasoning_content: 'a' } }),
      ]),
      event(at(1_100), 'messages/partial', [chunk('m1', 'Texte')]),
      event(at(1_200), 'messages/partial', [
        chunk('m1', 'Texte', { additional_kwargs: { reasoning_content: 'b' } }),
      ]),
    ];
    const split = reduce(frames);
    expect(Object.values(split.reasoning).map((m) => [m.text, m.segment ?? 0])).toEqual([
      ['a', 0],
      ['b', 1],
    ]);
    const excluded = reduce(
      [event(at(1_300), 'messages/metadata', { m1: { metadata: { tags: ['guard'] } } })],
      split,
    );
    expect([excluded.order, excluded.reasoning]).toEqual([[], {}]);
    // Presence only: further chunks update the marker, never open continuations.
    const markers = reduceMarkers(frames);
    expect(Object.values(markers.reasoning).map((m) => [m.chunks, m.segment ?? 0])).toEqual([
      [2, 0],
    ]);
  });
});
