import { describe, expect, it } from 'vitest';

import type { ProjectionState } from '@api/modules/executions/infrastructure/langgraph/runtime-projection';
import { projectionId } from '@api/modules/executions/infrastructure/langgraph/runtime-projection-data';
import { subagentProjectionId } from '@api/modules/executions/infrastructure/langgraph/runtime-projection-steps';
import {
  translateObservedView,
  type AgUiEvent,
  type ObservedView,
} from '@api/modules/stream/application/ag-ui-translation';
import {
  ai,
  continuityInvocation as invocation,
  expectContinuous,
  namespaceOf,
  nativeScript,
  nestedSteps,
  replayFrames,
  task,
  thinking,
  tool,
  verifiedEvents,
  type NativeFrame,
} from '../../../support/observation-continuity';

const NS_A = namespaceOf('a');
const NS_B = namespaceOf('b');
const delegationId = (call: string) => projectionId(invocation, 'tool', call);
const invocationOf = (namespace: string) => subagentProjectionId(invocation, namespace);
const standalone = (view: ObservedView) => view.steps.filter((step) => step.kind === 'subagent');

describe('delegation links that never move an observed step', () => {
  it('never pairs an invocation by elimination while a delegation that ended unnamed may own it', async () => {
    const s = nativeScript();
    const { states, views } = replayFrames(
      [
        s.root(ai('m1', '', { tool_calls: [task('d1'), task('d2')] })),
        s.specialists({ d1: 'topology_agent', d2: 'topology_agent' }),
        s.child(NS_A, 'topology_agent', ai('a1', 'A lit.', { tool_calls: [tool('a-t')] })),
        s.childResult(NS_A, 'topology_agent', 'a-t'),
        // The first result omits its namespace; the second invocation only starts afterwards.
        s.delegationResult('d1', null),
        s.child(NS_B, 'topology_agent', ai('b1', 'B lit.', { tool_calls: [tool('b-t')] })),
        s.childResult(NS_B, 'topology_agent', 'b-t'),
        s.delegationResult('d2', NS_B),
        s.root(ai('m2', 'Fin.')),
      ],
      s.now(),
    );
    await expectContinuous(views);
    // Before the second result, A could still be the first delegation's: nothing nests.
    expect(views.slice(0, 7).every((view) => nestedSteps(view).length === 0)).toBe(true);
    expect(views.slice(0, 7).every((view) => standalone(view).length === 0)).toBe(true);
    const last = states.at(-1)!;
    expect(last.subagents[invocationOf(NS_A)]).toMatchObject({
      delegationId: delegationId('d1'),
      status: 'completed',
      finishedAt: last.activities[delegationId('d1')]!.finishedAt,
    });
    expect(last.subagents[invocationOf(NS_B)]).toMatchObject({ delegationId: delegationId('d2') });
    expect(nestedSteps(views.at(-1)!)).toEqual([
      ['message', delegationId('d1')],
      ['tool', delegationId('d1')],
      ['message', delegationId('d2')],
      ['tool', delegationId('d2')],
    ]);
  });

  it('withholds a specialist running under another name until its result names it', async () => {
    const s = nativeScript();
    const { views } = replayFrames(
      [
        s.root(ai('m1', '', { tool_calls: [task('d1')] })),
        s.specialists({ d1: 'general-purpose' }),
        s.child(NS_A, 'alfred', thinking('a1', 'Je cherche.')),
        s.child(NS_A, 'alfred', ai('a1', 'Travail', { tool_calls: [tool('a-t')] })),
        s.childResult(NS_A, 'alfred', 'a-t'),
        s.delegationResult('d1', NS_A),
        s.root(ai('m2', 'Fin.')),
      ],
      s.now(),
    );
    await expectContinuous(views);
    expect(views.slice(0, 5).every((view) => view.steps.length === 1)).toBe(true);
    expect(nestedSteps(views.at(-1)!).map(([kind]) => kind)).toEqual([
      'reasoning',
      'message',
      'tool',
    ]);
  });

  it('records nothing a specialist streams after its delegation returned', async () => {
    const s = nativeScript();
    const { states, views } = replayFrames(
      [
        s.root(ai('m1', '', { tool_calls: [task('d1')] })),
        s.specialists({ d1: 'topology_agent' }),
        s.child(NS_A, 'topology_agent', ai('a1', 'Travail')),
        s.delegationResult('d1', NS_A),
        s.child(NS_A, 'topology_agent', ai('a2', 'Tard', { tool_calls: [tool('late')] })),
        s.root(ai('m2', 'Fin.')),
      ],
      s.now(),
    );
    await expectContinuous(views);
    expect(states[3]).toMatchObject({ order: states[4]!.order, activities: states[4]!.activities });
    expect(views.at(-1)!.steps.map((step) => [step.kind, step.status])).toEqual([
      ['delegation', 'completed'],
      ['message', 'completed'],
    ]);
  });

  it('reports invocations no result ever named on their own at settle, ended like their delegations', async () => {
    const s = nativeScript();
    const { views } = replayFrames(
      [
        s.root(ai('m1', '', { tool_calls: [task('d1'), task('d2')] })),
        s.specialists({ d1: 'topology_agent', d2: 'topology_agent' }),
        s.child(NS_A, 'topology_agent', ai('a1', 'A', { tool_calls: [tool('a-t')] })),
        s.child(NS_B, 'topology_agent', ai('b1', 'B')),
        s.delegationResult('d1', null),
        s.delegationResult('d2', null),
        s.root(ai('m2', 'Fin.')),
      ],
      s.now(),
    );
    await expectContinuous(views);
    expect(views.slice(0, -1).every((view) => standalone(view).length === 0)).toBe(true);
    expect(
      standalone(views.at(-1)!).map((step) => [step.status, step.subagentStatus, step.finishedAt]),
    ).toEqual([
      ['completed', 'completed', 1_600],
      ['completed', 'completed', 1_600],
    ]);
  });

  it('pairs live once a result resolves its delegation to a namespace that never streamed', async () => {
    const s = nativeScript();
    const { states, views } = replayFrames(
      [
        s.root(ai('m1', '', { tool_calls: [task('d1'), task('d2')] })),
        s.specialists({ d1: 'topology_agent', d2: 'topology_agent' }),
        s.child(NS_B, 'topology_agent', ai('b1', 'B', { tool_calls: [tool('b-t')] })),
        s.delegationResult('d1', NS_A, 'error'),
        s.childResult(NS_B, 'topology_agent', 'b-t'),
      ],
      s.now(),
    );
    await expectContinuous(views);
    expect(states[3]!.activities[delegationId('d1')]).toMatchObject({ link: 'exact' });
    expect(states[3]!.subagents[invocationOf(NS_B)]).toMatchObject({
      delegationId: delegationId('d2'),
      status: 'running',
    });
    expect(nestedSteps(views[3]!)).toEqual([
      ['message', delegationId('d2')],
      ['tool', delegationId('d2')],
    ]);
  });
});

describe('documented residual link gap', () => {
  it('withdraws a link when a specialist streams under the name of another one requested in parallel', () => {
    const s = nativeScript();
    const { views } = replayFrames(
      [
        s.root(ai('m1', '', { tool_calls: [task('d1'), task('d2')] })),
        s.specialists({ d1: 'general-purpose', d2: 'topology_agent' }),
        // The first delegation's specialist reports the second one's name: inferred to d2.
        s.child(NS_A, 'topology_agent', ai('a1', 'Travail')),
        s.delegationResult('d1', NS_A),
      ],
      s.now(),
    );
    expect(nestedSteps(views[2]!)).toEqual([['message', delegationId('d2')]]);
    expect(() => translateObservedView(views[2]!, views[3]!)).toThrow(
      expect.objectContaining({ rule: 'subagent_withdrawn', stepKind: 'delegation' }),
    );
  });
});

type Variant = 'plain' | 'noNamespace' | 'noName' | 'noUpdates' | 'otherName';

/** Deterministic pseudo-random numbers in [0, 1). */
function random(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value * 1_664_525 + 1_013_904_223) >>> 0;
    return value / 2 ** 32;
  };
}

/** Parallel delegations whose specialists stream interleaved, with one runtime anomaly. */
function parallelRun(seed: number, variant: Variant) {
  const next = random(seed);
  const s = nativeScript(1_789_000_000_000, 1 + Math.floor(next() * 40));
  const count = 2 + Math.floor(next() * 3);
  const names = Array.from({ length: count }, () =>
    next() < 0.7 ? 'topology_agent' : 'knowledge_agent',
  );
  const frames: NativeFrame[] = [s.root(thinking('m1', 'Plan. '))];
  for (let index = 0; index < count; index += 1)
    frames.push(s.root(ai('m1', '', { tool_calls: [task(`d${index}`)] })));
  if (variant !== 'noUpdates')
    frames.push(s.specialists(Object.fromEntries(names.map((name, i) => [`d${i}`, name]))));
  const scripts = names.map((name, index) => {
    const namespace = namespaceOf('0123456789abcdef'[index]!);
    const runtimeName =
      variant === 'otherName' && index === 0
        ? 'alfred'
        : variant === 'noName' && next() < 0.5
          ? null
          : name;
    const steps: (() => NativeFrame)[] = [];
    if (next() < 0.5) steps.push(() => s.frame(`updates|${namespace}`, { node: null }));
    const rounds = 1 + Math.floor(next() * 3);
    for (let round = 0; round < rounds; round += 1) {
      const id = `c${index}-${round}`;
      for (let think = Math.floor(next() * 3); think > 0; think -= 1)
        steps.push(() => s.child(namespace, runtimeName, thinking(id, `t${think} `)));
      if (next() < 0.6) steps.push(() => s.child(namespace, runtimeName, ai(id, `w${round} `)));
      if (round === rounds - 1) continue;
      steps.push(() =>
        s.child(namespace, runtimeName, ai(id, '', { tool_calls: [tool(`x${index}-${round}`)] })),
      );
      steps.push(() => s.childResult(namespace, runtimeName, `x${index}-${round}`));
    }
    const named = variant !== 'noNamespace' || next() < 0.5;
    steps.push(() => s.delegationResult(`d${index}`, named ? namespace : null));
    return steps;
  });
  const cursors = scripts.map(() => 0);
  for (;;) {
    const open = scripts.flatMap((steps, index) => (cursors[index]! < steps.length ? [index] : []));
    if (open.length === 0) break;
    const pick = open[Math.floor(next() * open.length)]!;
    frames.push(scripts[pick]![cursors[pick]!]!());
    cursors[pick]! += 1;
  }
  frames.push(s.root(ai('m2', 'Réponse.')));
  return { frames, count, endedAt: s.now() };
}

/** Every link the reducer holds is the true one: invocation `i` ran for delegation `d{i}`. */
function expectTrueLinks(state: ProjectionState, count: number): void {
  for (let index = 0; index < count; index += 1) {
    const subagent = state.subagents[invocationOf(namespaceOf('0123456789abcdef'[index]!))];
    if (subagent?.delegationId !== null && subagent !== undefined)
      expect(subagent.delegationId).toBe(delegationId(`d${index}`));
  }
}

describe('seeded interleavings of parallel delegations', () => {
  it.each<Variant>(['plain', 'noNamespace', 'noName', 'noUpdates', 'otherName'])(
    'continues every attach without a gap and links only true pairs (%s)',
    async (variant) => {
      for (let seed = 1; seed <= 12; seed += 1) {
        const { frames, count, endedAt } = parallelRun(seed * 7_919, variant);
        const { states, views } = replayFrames(frames, endedAt);
        for (const state of states) expectTrueLinks(state, count);
        for (let attach = 0; attach < views.length; attach += 1) {
          const events: AgUiEvent[] = translateObservedView(null, views[attach]!);
          for (let index = attach + 1; index < views.length; index += 1)
            events.push(...translateObservedView(views[index - 1]!, views[index]!));
          await verifiedEvents(events);
        }
        if (variant !== 'noNamespace') expect(standalone(views.at(-1)!)).toEqual([]);
      }
    },
    60_000,
  );
});
