import { describe, expect, it } from 'vitest';

import {
  emptyProjection,
  projectRuntimeEvent,
} from '@api/modules/executions/infrastructure/langgraph/runtime-projection';
import { projectionWork } from '@api/modules/executions/infrastructure/langgraph/runtime-projection-work';
import {
  AgUiTranslationGap,
  translateObservedView,
} from '@api/modules/stream/application/ag-ui-translation';
import {
  ai,
  continuityInvocation as invocation,
  expectContinuous,
  namespaceOf,
  nativeScript,
  nestedSteps as nested,
  replayFrames,
  result,
  task,
  thinking,
  tool,
  type NativeFrame,
} from '../../../support/observation-continuity';

const NS_A = namespaceOf('a');
const NS_B = namespaceOf('b');
const NS_K = namespaceOf('c');
const { frame, root, child, delegationResult, specialists, now } = nativeScript();
const replay = (frames: readonly NativeFrame[]) => replayFrames(frames, now());

describe('observation continuity over native sequences', () => {
  it('withholds parallel invocations of one specialist until their results name them', async () => {
    const { states, views } = replay([
      root(ai('m1', '', { tool_calls: [task('d1'), task('d2'), task('d3')] })),
      specialists({ d1: 'topology_agent', d2: 'topology_agent', d3: 'knowledge_agent' }),
      frame(`updates|${NS_K}`, { 'Middleware.before_agent': null }),
      child(NS_A, 'topology_agent', thinking('a1', 'Lire la topologie.')),
      child(NS_B, 'topology_agent', thinking('b1', 'Chercher les liens.')),
      child(
        NS_K,
        'knowledge_agent',
        ai('k1', 'Je consulte la base.', { tool_calls: [tool('k-t')] }),
      ),
      child(NS_A, 'topology_agent', ai('a1', 'Requête.', { tool_calls: [tool('a-t')] })),
      child(NS_B, 'topology_agent', ai('b1', '', { tool_calls: [tool('b-t')] })),
      frame(`messages|${NS_K}`, [result('k-t'), { lc_agent_name: 'knowledge_agent' }]),
      delegationResult('d3', NS_K),
      frame(`messages|${NS_A}`, [result('a-t'), { lc_agent_name: 'topology_agent' }]),
      child(NS_B, 'topology_agent', ai('b2', 'Rien trouvé.')),
      // Results arrive crossed: the first delegation ran in the second namespace.
      delegationResult('d1', NS_B),
      delegationResult('d2', NS_A),
      root(ai('m2', 'Voici la topologie.')),
    ]);
    await expectContinuous(views);
    const last = states.at(-1)!;
    const [d1, d2, d3] = last.order.filter((id) => last.activities[id]?.kind === 'delegation');
    // Before any result, the unique knowledge specialist nests live; the topology pair waits.
    expect(nested(views[8]!)).toEqual([
      ['message', d3],
      ['tool', d3],
    ]);
    const settled = views.at(-1)!;
    expect(settled.steps.filter((step) => step.kind === 'subagent')).toEqual([]);
    expect(nested(settled)).toEqual([
      ['reasoning', d2],
      ['reasoning', d1],
      ['message', d3],
      ['tool', d3],
      ['message', d2],
      ['tool', d2],
      ['tool', d1],
      ['message', d1],
    ]);
  });

  it('nests the last waiting invocation live once the others are confirmed', () => {
    const { views } = replay([
      root(ai('m1', '', { tool_calls: [task('d1'), task('d2')] })),
      specialists({ d1: 'topology_agent', d2: 'topology_agent' }),
      child(NS_A, 'topology_agent', ai('a1', '', { tool_calls: [tool('a-t')] })),
      child(NS_B, 'topology_agent', ai('b1', '', { tool_calls: [tool('b-t')] })),
      frame(`messages|${NS_A}`, [result('a-t'), { lc_agent_name: 'topology_agent' }]),
      delegationResult('d2', NS_A),
    ]);
    expect(nested(views[3]!)).toEqual([]);
    const [, , , , , confirmed] = views;
    expect(confirmed!.steps.map((step) => [step.kind, step.status])).toEqual([
      ['delegation', 'running'],
      ['delegation', 'completed'],
      ['tool', 'completed'],
      ['tool', 'running'],
    ]);
    expect(confirmed!.steps[0]).toMatchObject({ subagentStatus: 'running' });
  });

  it('continues reasoning and words that resume after output as later steps', async () => {
    const { states, views } = replay([
      root(thinking('m1', 'Je réfléchis. ')),
      root(ai('m1', 'Début de réponse. ')),
      root(thinking('m1', 'Je vérifie encore.')),
      root(ai('m1', 'Suite.')),
      root(ai('m2', '', { tool_calls: [task('d1')] })),
      specialists({ d1: 'incident_agent' }),
      child(NS_A, 'incident_agent', thinking('c1', 'Plan. ')),
      child(NS_A, 'incident_agent', ai('c1', 'Je cherche ', { tool_calls: [tool('c-t')] })),
      child(NS_A, 'incident_agent', ai('c1', 'les journaux.')),
      child(NS_A, 'incident_agent', thinking('c1', 'Puis conclure.')),
      frame(`messages|${NS_A}`, [result('c-t'), { lc_agent_name: 'incident_agent' }]),
      delegationResult('d1', NS_A),
      root(ai('m3', 'Fin.')),
    ]);
    await expectContinuous(views);
    const texts = views.at(-1)!.steps.map((step) => [step.kind, step.text ?? null]);
    expect(texts).toEqual([
      ['reasoning', 'Je réfléchis. '],
      ['message', 'Début de réponse. Suite.'],
      ['reasoning', 'Je vérifie encore.'],
      ['delegation', null],
      ['reasoning', 'Plan. '],
      ['message', 'Je cherche '],
      ['tool', null],
      ['message', 'les journaux.'],
      ['reasoning', 'Puis conclure.'],
    ]);
    expect(JSON.stringify(states.at(-1))).not.toContain('PRIVATE');
  });

  it('reports a round trip without output only once a later one began', async () => {
    const { views } = replay([
      root(ai('m1', '')),
      root(thinking('m1', 'Finalement je pense.')),
      root(ai('m2', '')),
      root(ai('m3', '')),
      root(ai('m4', 'Réponse.')),
    ]);
    await expectContinuous(views);
    expect(views[0]!.steps).toEqual([]);
    expect(views.at(-1)!.steps.map((step) => step.kind)).toEqual([
      'reasoning',
      'generation',
      'generation',
    ]);
    // The closing chunk of an earlier round trip does not make it the answer again.
    const closing = replay([root(ai('m1', 'Un')), root(ai('m2', 'Deux')), root(ai('m1', ''))]);
    await expectContinuous(closing.views);
    expect(closing.views.at(-1)!.answer?.text).toBe('Deux');
  });

  it('keeps the first outcome of a call when a late or repeated result arrives', async () => {
    const { views } = replay([
      root(ai('m1', '', { tool_calls: [task('d1'), tool('r1', 'read_file')] })),
      specialists({ d1: 'incident_agent' }),
      child(NS_A, 'incident_agent', ai('c1', '', { tool_calls: [tool('c-t')] })),
      frame('messages', [result('r1', { name: 'read_file' }), {}]),
      frame('messages', [result('r1', { name: 'read_file' }, 'error'), {}]),
      delegationResult('d1', NS_A),
      frame(`messages|${NS_A}`, [result('c-t'), { lc_agent_name: 'incident_agent' }]),
    ]);
    await expectContinuous(views);
    expect(views.at(-1)!.steps.map((step) => [step.label, step.status])).toEqual([
      ['task', 'completed'],
      ['read_file', 'completed'],
      ['execute_raw', 'interrupted'],
    ]);
  });

  it('stops text at its bound without marks on the stream and opens no empty continuation', async () => {
    const long = (letter: string) => letter.repeat(20_000);
    const { states, views } = replay([
      root(thinking('m1', long('a'))),
      root(thinking('m1', long('b'))),
      root(ai('m1', 'Réponse.')),
      root(thinking('m1', long('c'))),
      root(thinking('m1', long('d'))),
    ]);
    await expectContinuous(views);
    const markers = Object.values(states.at(-1)!.reasoning);
    expect(markers.map((marker) => [marker.text.length, marker.truncated ?? false])).toEqual([
      [32_768, true],
      [32_768, true],
    ]);
    expect(views.at(-1)!.steps.every((step) => !(step.text ?? '').endsWith('…'))).toBe(true);
    // Once the shared budget is spent, later reasoning neither grows a step nor opens a new one.
    const spent = replay([
      ...Array.from({ length: 14 }, (_, index) =>
        root(thinking(`r${index}`, long(String.fromCharCode(97 + index)))),
      ),
      root(ai('r13', 'Fin.')),
      root(thinking('r13', 'encore')),
    ]);
    await expectContinuous(spent.views);
    expect(spent.states.at(-1)!.contentBytes).toBe(256 * 1024);
    expect(
      Object.values(spent.states.at(-1)!.reasoning).every((m) => m.segment === undefined),
    ).toBe(true);
  });

  it('documents the residual gaps: rewritten text and two root round trips at once', () => {
    const rewrite = replay([
      frame('messages/partial', [ai('m1', 'Bonjour')]),
      frame('messages/metadata', { m1: { metadata: { langgraph_node: 'model' } } }),
      frame('messages/partial', [ai('m1', 'Salut')]),
    ]);
    expect(() => translateObservedView(rewrite.views[1]!, rewrite.views[2]!)).toThrow(
      expect.objectContaining({ rule: 'answer_not_prefix', stepKind: 'answer' }),
    );
    const concurrent = replay([
      root(ai('m1', 'Premier')),
      root(ai('m2', 'Second')),
      root(ai('m1', ' encore')),
    ]);
    let gap: unknown;
    try {
      translateObservedView(concurrent.views[1]!, concurrent.views[2]!);
    } catch (error) {
      gap = error;
    }
    expect(gap).toBeInstanceOf(AgUiTranslationGap);
    expect(gap).toMatchObject({ rule: 'answer_reopened', stepKind: 'message' });
    // An earlier round trip reported without output gains a tool call after a later one began.
    const late = replay([
      root(ai('m1', '')),
      root(ai('m2', '')),
      root(ai('m1', '', { tool_calls: [tool('t1', 'read_file')] })),
    ]);
    expect(late.views[1]!.steps.map((step) => step.kind)).toEqual(['generation']);
    expect(() => translateObservedView(late.views[1]!, late.views[2]!)).toThrow(
      expect.objectContaining({ rule: 'withdrawn', stepKind: 'generation' }),
    );
  });

  it('refuses to retract a disclosed step when its message is excluded afterwards', () => {
    let state = projectRuntimeEvent(
      emptyProjection(),
      root(thinking('m1', 'Visible.')),
      invocation,
      { content: true },
    );
    expect(projectionWork(state, { settled: false, endedAt: null }).steps).toHaveLength(1);
    expect(() => {
      state = projectRuntimeEvent(
        state,
        frame('messages/metadata', { m1: { metadata: { tags: ['guard'] } } }),
        invocation,
      );
    }).toThrow('runtime_event_invalid');
  });
});
