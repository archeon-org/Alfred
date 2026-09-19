import type { RuntimeEvent } from '@api/modules/executions/application/runtime-client.port';
import { paced, type PacedFrame } from './observation-harness';

const NS = (letter: string) =>
  `tools:${letter.repeat(8)}-${letter.repeat(4)}-4${letter.repeat(3)}-8${letter.repeat(3)}-${letter.repeat(12)}`;

/**
 * A native run shaped like the GLM topology run that detached six times: reasoning-heavy rounds,
 * two sequential delegations to the same specialist, then two parallel ones whose results arrive
 * crossed, long tool calls with no event (hence no commit) in between, then the answer.
 */
export function glmLikeRun(): PacedFrame[] {
  const frames: RuntimeEvent[] = [];
  let clock = 1_789_567_300_000;
  let sequence = 0;
  const push = (event: string, data: unknown, step = 100) => {
    clock += step;
    frames.push({ id: `${clock}-${sequence++}`, event, data });
  };
  const chunk = (id: string, content: string, extra: Record<string, unknown> = {}) => ({
    id,
    type: 'AIMessageChunk',
    content,
    ...extra,
  });
  const nested = (ns: string, node = 'model') => ({
    lc_agent_name: 'topology_agent',
    langgraph_node: node,
    langgraph_checkpoint_ns: `${ns}|${node}:1`,
  });
  const think = (id: string, count: number, ns?: string) => {
    for (let index = 0; index < count; index += 1)
      push(ns === undefined ? 'messages' : `messages|${ns}`, [
        chunk(id, '', { additional_kwargs: { reasoning_content: `pensée ${index} ` } }),
        ns === undefined ? { langgraph_node: 'model' } : nested(ns),
      ]);
  };
  const say = (id: string, text: string, ns?: string, extra: Record<string, unknown> = {}) =>
    push(ns === undefined ? 'messages' : `messages|${ns}`, [
      chunk(id, text, extra),
      ns === undefined ? { langgraph_node: 'model' } : nested(ns),
    ]);
  const delegate = (id: string, calls: readonly string[]) => {
    say(id, '', undefined, { tool_calls: calls.map((call) => ({ id: call, name: 'task' })) });
    say(id, '');
    push('updates', {
      model: {
        messages: [
          {
            id,
            type: 'ai',
            content: '',
            tool_calls: calls.map((call) => ({
              id: call,
              name: 'task',
              args: { subagent_type: 'topology_agent', description: 'PRIVATE PROMPT' },
            })),
          },
        ],
      },
    });
  };
  const toolCall = (ns: string, id: string, call: string) =>
    say(id, '', ns, { tool_calls: [{ id: call, name: 'execute_raw', args: {} }] });
  const toolResult = (ns: string, call: string, step = 100) =>
    push(
      `messages|${ns}`,
      [
        { type: 'tool', tool_call_id: call, content: 'PRIVATE ROWS', status: 'success' },
        nested(ns, 'tools'),
      ],
      step,
    );
  const report = (call: string, ns: string) =>
    push(
      'messages',
      [
        {
          type: 'tool',
          tool_call_id: call,
          name: 'task',
          content: 'PRIVATE REPORT',
          status: 'success',
        },
        { langgraph_node: 'tools', langgraph_checkpoint_ns: ns },
      ],
      500,
    );
  const [one, two, three, four] = [NS('a'), NS('b'), NS('c'), NS('d')];
  think('m1', 20);
  delegate('m1', ['call-1']);
  push(`updates|${one}`, { 'Middleware.before_agent': null }, 500);
  think('c1', 30, one);
  say('c1', 'Je lance la requête.', one);
  toolCall(one, 'c1', 'raw-1');
  say('c1', '', one);
  toolResult(one, 'raw-1', 8_000);
  think('c2', 15, one);
  say('c2', 'Topologie trouvée.', one);
  report('call-1', one);
  think('m2', 10);
  delegate('m2', ['call-2']);
  push(`updates|${two}`, { 'Middleware.before_agent': null }, 500);
  think('e1', 20, two);
  toolCall(two, 'e1', 'raw-2');
  toolResult(two, 'raw-2', 3_000);
  say('e2', 'Liens vérifiés.', two);
  report('call-2', two);
  think('m3', 10);
  delegate('m3', ['call-3', 'call-4']);
  push(`updates|${three}`, { 'Middleware.before_agent': null }, 500);
  push(`updates|${four}`, { 'Middleware.before_agent': null });
  for (let index = 0; index < 15; index += 1) {
    think('f1', 1, three);
    think('g1', 1, four);
  }
  say('f1', 'Côté A.', three);
  toolCall(three, 'f1', 'raw-3');
  say('g1', 'Côté B.', four);
  toolCall(four, 'g1', 'raw-4');
  toolResult(four, 'raw-4', 6_000);
  toolResult(three, 'raw-3');
  think('g2', 10, four);
  say('g2', 'Fin B.', four);
  // Crossed: the first parallel delegation ran in the namespace seen second.
  report('call-3', four);
  think('f2', 10, three);
  say('f2', 'Fin A.', three);
  report('call-4', three);
  think('m4', 10);
  for (let index = 0; index < 20; index += 1) say('m4', `partie ${index} `);
  say('m4', '');
  return paced(frames);
}
