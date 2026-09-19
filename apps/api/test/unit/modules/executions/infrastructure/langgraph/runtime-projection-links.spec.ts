import { describe, expect, it } from 'vitest';

import {
  projectionActivities,
  projectionText,
} from '@api/modules/executions/infrastructure/langgraph/runtime-projection';
import { presentWork } from '@api/modules/executions/infrastructure/langgraph/runtime-projection-work';
import {
  NS_A,
  NS_B,
  chunk,
  event,
  at,
  reduce,
  work,
} from '../../../../../support/projection-script';

describe('delegation links of the runtime projection work log', () => {
  it('links a specialist invocation to its delegation, first by inference then by the result', () => {
    const state = reduce([
      // The planner calls the delegation tool; the streamed chunk carries no arguments yet.
      event(at(1_000), 'messages', [
        chunk('m1', '', { tool_calls: [{ id: 'call-task', name: 'task', args: {} }] }),
        {},
      ]),
      // The node update carries the complete call with the specialist requested.
      event(at(1_050), 'updates', {
        model: {
          messages: [
            {
              id: 'm1',
              type: 'ai',
              content: '',
              tool_calls: [
                {
                  id: 'call-task',
                  name: 'task',
                  args: { description: 'PRIVATE PROMPT', subagent_type: 'topology_agent' },
                },
              ],
            },
          ],
        },
      }),
      event(at(1_100), `updates|${NS_A}`, { 'Middleware.before_agent': null }),
      event(at(1_200), `messages|${NS_A}`, [
        chunk('n1', 'CHILD TEXT', {
          tool_calls: [{ id: 'call-raw', name: 'execute_raw', args: { query: 'PRIVATE' } }],
        }),
        { lc_agent_name: 'topology_agent', langgraph_node: 'model' },
      ]),
      event(at(1_300), `messages|${NS_A}`, [
        { type: 'tool', tool_call_id: 'call-raw', content: 'PRIVATE RESULT', status: 'success' },
        { lc_agent_name: 'topology_agent', langgraph_node: 'tools' },
      ]),
    ]);
    const serialized = JSON.stringify(state);
    for (const word of ['PRIVATE', 'call-task', 'call-raw', NS_A]) {
      expect(serialized).not.toContain(word);
    }
    // The specialist's own words are exposed content; its prompt and tool payloads never are.
    expect(Object.values(state.childMessages)[0]).toMatchObject({ text: 'CHILD TEXT' });
    expect(projectionText(state)).toBe('');
    const [subagent] = Object.values(state.subagents);
    const delegationId = Object.values(state.activities).find((a) => a.kind === 'delegation')!.id;
    expect(subagent).toMatchObject({ name: 'topology_agent', delegationId, status: 'running' });
    expect(state.activities[delegationId]).toMatchObject({
      specialist: 'topology_agent',
      link: 'guess',
      subagentId: subagent!.id,
    });
    const running = work(state);
    // The specialist's words came with its tool call: they are complete once the call is out.
    expect(running.steps.map((s) => [s.kind, s.status, s.parentId ?? null])).toEqual([
      ['delegation', 'running', null],
      ['message', 'completed', delegationId],
      ['tool', 'completed', delegationId],
    ]);
    expect(running.steps[1]).toMatchObject({ text: 'CHILD TEXT', finishedAt: 1_200 });
    expect(running.steps[0]).toMatchObject({
      specialist: 'topology_agent',
      subagentStatus: 'running',
    });
    // The delegation's own result confirms the namespace and closes the specialist.
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
          { langgraph_checkpoint_ns: NS_A, langgraph_node: 'tools' },
        ]),
      ],
      state,
    );
    expect(finished.activities[delegationId]).toMatchObject({
      status: 'completed',
      link: 'exact',
      finishedAt: 2_000,
    });
    expect(Object.values(finished.subagents)[0]).toMatchObject({
      status: 'completed',
      finishedAt: 2_000,
    });
    expect(work(finished).steps[0]).toMatchObject({
      status: 'completed',
      subagentStatus: 'completed',
      finishedAt: 2_000,
    });
    // The specialist's message closes with its invocation.
    expect(work(finished).steps[1]).toMatchObject({ status: 'completed', finishedAt: 1_200 });
    expect(JSON.stringify(presentWork(work(finished)))).not.toContain('messageId');
  });

  it('corrects a guessed link with the namespace named by the delegation result', () => {
    const calls = (ids: readonly string[]) =>
      ids.map((id) => ({ id, name: 'task', args: { subagent_type: 'topology_agent' } }));
    const state = reduce([
      event(at(1_000), 'messages', [
        chunk('m1', '', { tool_calls: calls(['call-1', 'call-2']) }),
        {},
      ]),
      event(at(1_100), `messages|${NS_A}`, [chunk('n1', ''), { lc_agent_name: 'topology_agent' }]),
      event(at(1_200), `messages|${NS_B}`, [chunk('n2', ''), { lc_agent_name: 'topology_agent' }]),
      // The results arrive crossed: the first call actually ran in the second namespace.
      event(at(2_000), 'messages', [
        { type: 'tool', tool_call_id: 'call-1', name: 'task', content: 'x', status: 'success' },
        { langgraph_checkpoint_ns: NS_B },
      ]),
      event(at(2_100), 'messages', [
        { type: 'tool', tool_call_id: 'call-2', name: 'task', content: 'y', status: 'error' },
        { langgraph_checkpoint_ns: NS_A },
      ]),
    ]);
    const delegations = state.order
      .map((id) => state.activities[id])
      .filter((activity) => activity?.kind === 'delegation');
    const subagents = state.order.map((id) => state.subagents[id]).filter((s) => s !== undefined);
    expect(delegations.map((d) => [d!.link, d!.subagentId])).toEqual([
      ['exact', subagents[1]!.id],
      ['exact', subagents[0]!.id],
    ]);
    expect(subagents.map((s) => [s.delegationId, s.status])).toEqual([
      [delegations[1]!.id, 'failed'],
      [delegations[0]!.id, 'completed'],
    ]);
  });

  it('interrupts the unfinished tools of a specialist when its delegation ends', () => {
    const state = reduce([
      event(at(1_000), 'messages', [
        chunk('m1', '', { tool_calls: [{ id: 'call-task', name: 'task', args: {} }] }),
        {},
      ]),
      event(at(1_100), `messages|${NS_A}`, [
        chunk('n1', '', { tool_calls: [{ id: 'call-raw', name: 'execute_raw' }] }),
        { lc_agent_name: 'incident_agent' },
      ]),
      event(at(2_000), 'messages', [
        { type: 'tool', tool_call_id: 'call-task', name: 'task', content: 'x', status: 'error' },
        { langgraph_checkpoint_ns: NS_A },
      ]),
    ]);
    expect(projectionActivities(state).map((a) => [a.label, a.status])).toEqual([
      ['task', 'failed'],
      ['execute_raw', 'interrupted'],
    ]);
    expect(work(state).steps[0]).toMatchObject({
      specialist: 'incident_agent',
      subagentStatus: 'failed',
    });
  });

  it('hides a specialist seen only through updates until it is named or finished', () => {
    const silent = reduce([event(at(1_000), `updates|${NS_A}`, { node: null })]);
    expect(Object.values(silent.subagents)[0]).toMatchObject({ name: null, delegationId: null });
    expect(work(silent).steps).toEqual([]);
    const named = reduce(
      [
        event(at(1_100), `messages|${NS_A}`, [
          chunk('n1', ''),
          { lc_agent_name: 'knowledge_agent' },
        ]),
      ],
      silent,
    );
    expect(work(named).steps).toEqual([
      expect.objectContaining({
        kind: 'subagent',
        specialist: 'knowledge_agent',
        status: 'running',
        subagentStatus: 'running',
      }),
    ]);
  });

  it('never infers a link that another waiting delegation or an unnamed invocation could claim', () => {
    const calls = [
      { id: 'call-1', name: 'task', args: { subagent_type: 'topology_agent' } },
      { id: 'call-2', name: 'task', args: { subagent_type: 'topology_agent' } },
    ];
    const state = reduce([
      event(at(1_000), 'messages', [chunk('m1', '', { tool_calls: calls }), {}]),
      // Seen through its node updates only: no name yet, so it takes no link.
      event(at(1_100), `updates|${NS_A}`, { node: null }),
      event(at(1_200), `messages|${NS_B}`, [
        chunk('n2', '', { tool_calls: [{ id: 'raw-b', name: 'execute_raw' }] }),
        { lc_agent_name: 'topology_agent' },
      ]),
    ]);
    expect(Object.values(state.subagents).map((s) => [s.name, s.delegationId])).toEqual([
      [null, null],
      ['topology_agent', null],
    ]);
    // Neither invocation is reported, nor its tools, while two delegations could own them.
    expect(work(state).steps.map((s) => [s.kind, s.subagentStatus ?? null])).toEqual([
      ['delegation', null],
      ['delegation', null],
    ]);
    // Settled without results, the invocations stand on their own rather than under a guess.
    expect(work(state, true, 5_000).steps.map((s) => [s.kind, s.parentId ?? null])).toEqual([
      ['delegation', null],
      ['delegation', null],
      ['subagent', null],
      ['tool', Object.values(state.subagents)[1]!.id],
    ]);
    // Once named, one result confirmed, the remaining pair is unambiguous and links live.
    const resolved = reduce(
      [
        event(at(1_300), `messages|${NS_A}`, [
          chunk('n1', ''),
          { lc_agent_name: 'topology_agent' },
        ]),
        event(at(2_000), 'messages', [
          { type: 'tool', tool_call_id: 'call-2', name: 'task', content: 'x', status: 'success' },
          { langgraph_checkpoint_ns: NS_A },
        ]),
      ],
      state,
    );
    const [first, second] = resolved.order
      .map((id) => resolved.activities[id])
      .filter((activity) => activity?.kind === 'delegation');
    expect([first!.link, second!.link]).toEqual(['guess', 'exact']);
    expect(work(resolved).steps.map((s) => [s.kind, s.parentId ?? null])).toEqual([
      ['delegation', null],
      ['delegation', null],
      ['tool', first!.id],
    ]);
  });
});
