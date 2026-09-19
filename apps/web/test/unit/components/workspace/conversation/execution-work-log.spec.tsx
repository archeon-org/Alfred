import type { Execution, ExecutionWork, WorkStep } from '@alfred/contracts';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ExecutionWorkLog,
  groupSteps,
  workHeading,
} from '@/components/workspace/conversation/execution-work-log';
import { reasoningPreview, reasoningTail } from '@/components/workspace/conversation/reasoning-row';
import { specialistPreview } from '@/components/workspace/conversation/specialist-row';
import { applyPreset, type ChatDisplay, type ChatPreset } from '@/lib/workspace/chat-preferences';
import { chatPreferencesStore } from '@/services/workspace/chat-preferences-store';
import { execution as executionOf } from '../../../../support/executions-api';

const step = (overrides: Partial<WorkStep> & Pick<WorkStep, 'id' | 'kind'>): WorkStep => ({
  label: '',
  status: 'completed',
  startedAt: 1_000,
  finishedAt: 1_400,
  ...overrides,
});

const work: ExecutionWork = {
  steps: [
    step({ id: 'g0', kind: 'generation', startedAt: 500, finishedAt: 900 }),
    step({ id: 'm0', kind: 'message', text: 'Je regarde **la topologie**.' }),
    step({
      id: 'r1',
      kind: 'reasoning',
      startedAt: 1_000,
      finishedAt: 6_000,
      text: 'Il faut lister les serveurs.',
    }),
    step({
      id: 'task-1',
      kind: 'delegation',
      label: 'task',
      specialist: 'topology_agent',
      subagentStatus: 'completed',
      finishedAt: 48_000,
    }),
    step({ id: 'n1', kind: 'message', parentId: 'task-1', text: 'Je commence par le graphe.' }),
    step({ id: 'call-1', kind: 'tool', label: 'execute_raw', parentId: 'task-1' }),
    step({
      id: 'call-2',
      kind: 'tool',
      label: 'execute_raw',
      parentId: 'task-1',
      status: 'failed',
    }),
    step({ id: 'call-3', kind: 'tool', label: 'get_application_topology', parentId: 'task-1' }),
    step({ id: 't1', kind: 'tool', label: 'write_todos', status: 'running', finishedAt: null }),
    step({ id: 't2', kind: 'tool', label: 'write_todos', status: 'running', finishedAt: null }),
  ],
  omittedSteps: 2,
};

const running: Execution = { ...executionOf('running'), startedAt: '2026-09-11T09:00:00.000Z' };
const done: Execution = {
  ...executionOf('completed'),
  startedAt: '2026-09-11T09:00:00.000Z',
  finishedAt: '2026-09-11T09:06:34.000Z',
};

describe('ExecutionWorkLog', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-09-11T09:00:12.000Z'));
    // Every kind of step, Alfred's and the specialists', shows under the detailed preset.
    chatPreferencesStore.setValue(applyPreset('detailed'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('nests the steps of a specialist under its delegation and folds repeated tools', () => {
    const describe = (entries: ReturnType<typeof groupSteps>): unknown[] =>
      entries.map((entry) =>
        entry.kind === 'group'
          ? ['group', entry.steps.map((s) => s.id)]
          : [entry.step.id, describe(entry.children)],
      );
    expect(describe(groupSteps(work.steps))).toEqual([
      ['g0', []],
      ['m0', []],
      ['r1', []],
      [
        'task-1',
        [
          ['n1', []],
          ['group', ['call-1', 'call-2']],
          ['call-3', []],
        ],
      ],
      ['group', ['t1', 't2']],
    ]);
  });

  it('describes a live turn with its running clock and counts, then folds once settled', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const view = render(<ExecutionWorkLog execution={running} live work={work} />);
    const details = view.container.querySelector('details');
    expect(details).toHaveAttribute('open');
    const summary = screen.getByText('Travail en cours').closest('summary')!;
    expect(summary).toHaveTextContent('12 s');
    expect(summary).toHaveTextContent('5 outils');
    expect(summary).toHaveTextContent('1 spécialiste');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(summary).toHaveTextContent('14 s');
    const list = screen.getByRole('list', { name: 'Étapes du travail' });
    expect(within(list).getByText('Génération sans réponse').closest('li')).toHaveTextContent(
      '0,4 s',
    );
    expect(within(list).getByText('la topologie')).toBeVisible();
    // A reasoning already complete when it appears starts folded on its one-line preview.
    const reasoning = within(list).getByText('Réflexion').closest('li')!;
    expect(reasoning).toHaveTextContent('5,0 s');
    const reasoningRow = reasoning.querySelector('details')!;
    expect(reasoningRow).not.toHaveAttribute('open');
    expect(reasoning.querySelector('[data-slot="reasoning-preview"]')).toHaveTextContent(
      'Il faut lister les serveurs.',
    );
    expect(
      within(reasoningRow).getByText('Il faut lister les serveurs.', { selector: 'p' }),
    ).not.toBeVisible();
    const delegation = within(list).getByText('Spécialiste topology_agent').closest('li')!;
    expect(delegation).toHaveTextContent('47 s');
    // A specialist already done when it appears is folded on a count of its work.
    const specialistRow = delegation.querySelector('details')!;
    expect(specialistRow).toHaveAttribute('data-slot', 'specialist-step');
    expect(specialistRow).not.toHaveAttribute('open');
    expect(delegation.querySelector('[data-slot="specialist-preview"]')).toHaveTextContent(
      '3 outils',
    );
    await user.click(within(delegation).getByText('Spécialiste topology_agent'));
    expect(specialistRow).toHaveAttribute('open');
    expect(delegation.querySelector('[data-slot="specialist-preview"]')).toBeNull();
    const nested = within(delegation).getByRole('list', {
      name: 'Travail de Spécialiste topology_agent',
    });
    expect(within(nested).getByText('Je commence par le graphe.')).toBeVisible();
    const calls = within(nested).getByRole('list', { name: 'Appels de execute_raw' });
    const group = calls.closest('li')!;
    expect(within(group).getAllByText('execute_raw')).toHaveLength(3);
    expect(group).toHaveTextContent('×2');
    // The folded row carries the worst outcome of its calls, then each call its own.
    expect(within(group).getAllByText('échoué')).toHaveLength(2);
    expect(within(calls).getAllByRole('listitem')).toHaveLength(2);
    expect(within(nested).getByText('get_application_topology')).toBeVisible();
    const todos = within(list).getByRole('list', { name: 'Appels de write_todos' }).closest('li')!;
    expect(todos).toHaveTextContent('×2');
    expect(todos).toHaveTextContent('en cours…');
    expect(within(list).getByText('+2 étapes non affichées')).toBeVisible();
    view.rerender(<ExecutionWorkLog execution={done} live={false} work={work} />);
    expect(details).not.toHaveAttribute('open');
    expect(screen.getByText('Travail effectué').closest('summary')).toHaveTextContent('6 min 34 s');
  });

  it('reopens on demand and names the outcome of a stopped or failed execution', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const view = render(
      <ExecutionWorkLog execution={{ ...done, status: 'cancelled' }} live={false} work={work} />,
    );
    expect(screen.getByText('Travail arrêté')).toBeVisible();
    const details = view.container.querySelector('details')!;
    expect(details).not.toHaveAttribute('open');
    await user.click(screen.getByText('Travail arrêté'));
    expect(details).toHaveAttribute('open');
    view.rerender(
      <ExecutionWorkLog execution={{ ...done, status: 'failed' }} live={false} work={work} />,
    );
    expect(screen.getByText('Travail interrompu par une erreur')).toBeVisible();
  });

  it('renders nothing for a settled answer without any work and only the header while live', () => {
    const empty: ExecutionWork = { steps: [], omittedSteps: 0 };
    const { container, rerender } = render(
      <ExecutionWorkLog execution={done} live={false} work={empty} />,
    );
    expect(container).toBeEmptyDOMElement();
    rerender(<ExecutionWorkLog execution={running} live work={empty} />);
    expect(screen.getByText('Travail en cours')).toBeVisible();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('prefers the stored account of a settled answer for its header', () => {
    const heading = workHeading(
      null,
      false,
      null,
      { steps: [], omittedSteps: 0 },
      {
        status: 'completed',
        durationMs: 65_000,
        steps: 4,
        tools: 2,
        delegations: 1,
        failedSteps: 0,
      },
    );
    expect(heading).toEqual({
      title: 'Travail effectué',
      durationMs: 65_000,
      counts: ['2 outils', '1 spécialiste'],
    });
  });
});

describe('Reasoning rows', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-09-11T09:00:12.000Z'));
    // Reasoning streams in the open only under the detailed preset.
    chatPreferencesStore.setValue(applyPreset('detailed'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  const thinking = 'Je dois **lister** les serveurs,\n\n- puis `comparer` les versions.';
  const reasoningWork = (status: WorkStep['status'], text = thinking): ExecutionWork => ({
    steps: [
      step({
        id: 'r1',
        kind: 'reasoning',
        status,
        finishedAt: status === 'running' ? null : 3_400,
        text,
      }),
    ],
    omittedSteps: 0,
  });
  const rowOf = () => screen.getByText('Réflexion').closest('li')!;
  const previewOf = () => rowOf().querySelector('[data-slot="reasoning-preview"]');
  const bodyOf = () => within(rowOf()).getByText('lister', { selector: 'strong' });

  it('flattens the preview to one plain line', () => {
    expect(reasoningPreview(thinking)).toBe(
      'Je dois lister les serveurs, puis comparer les versions.',
    );
    expect(reasoningPreview(`${'mot '.repeat(400)}fin`)).toHaveLength(160);
  });

  it('streams a running reasoning in the open, then folds it on a preview once complete', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const view = render(
      <ExecutionWorkLog execution={running} live work={reasoningWork('running')} />,
    );
    const details = rowOf().querySelector('details')!;
    expect(details).toHaveAttribute('open');
    // Browsers echo the open attribute set at mount with a toggle event: not a choice to keep.
    act(() => {
      details.dispatchEvent(new Event('toggle'));
    });
    expect(bodyOf()).toBeVisible();
    expect(previewOf()).toBeNull();
    expect(details.querySelector('summary')).toHaveTextContent('en cours…');
    view.rerender(
      <ExecutionWorkLog
        execution={running}
        live
        work={reasoningWork('running', `${thinking} Encore.`)}
      />,
    );
    expect(within(rowOf()).getByText(/Encore\./u)).toBeVisible();
    view.rerender(<ExecutionWorkLog execution={running} live work={reasoningWork('completed')} />);
    // Let the toggle event echo the fold: it is the run's doing, not a choice to keep.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(details).not.toHaveAttribute('open');
    expect(bodyOf()).not.toBeVisible();
    expect(previewOf()).toHaveTextContent(
      'Je dois lister les serveurs, puis comparer les versions.',
    );
    expect(details.querySelector('summary')).toHaveTextContent('2,4 s');
    await user.click(screen.getByText('Réflexion'));
    expect(details).toHaveAttribute('open');
    expect(bodyOf()).toBeVisible();
    expect(previewOf()).toBeNull();
  });

  it('keeps the log folded when a nested row toggles as the answer settles', () => {
    const view = render(
      <ExecutionWorkLog execution={running} live work={reasoningWork('running')} />,
    );
    const log = view.container.querySelector('[data-slot="execution-work-log"]')!;
    const row = rowOf().querySelector('details')!;
    // React hands a nested row's toggle to the log's handler too; it must not reopen the log.
    act(() => {
      row.dispatchEvent(new Event('toggle'));
      view.rerender(
        <ExecutionWorkLog execution={done} live={false} work={reasoningWork('completed')} />,
      );
    });
    expect(log).not.toHaveAttribute('open');
    act(() => {
      log.dispatchEvent(new Event('toggle'));
    });
    expect(log).not.toHaveAttribute('open');
  });

  it('keeps the choice of a person who toggled the reasoning during its run', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const view = render(
      <ExecutionWorkLog execution={running} live work={reasoningWork('running')} />,
    );
    const details = rowOf().querySelector('details')!;
    await user.click(screen.getByText('Réflexion'));
    expect(details).not.toHaveAttribute('open');
    expect(previewOf()).toHaveTextContent('Je dois lister');
    await user.click(screen.getByText('Réflexion'));
    expect(details).toHaveAttribute('open');
    view.rerender(<ExecutionWorkLog execution={running} live work={reasoningWork('completed')} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(details).toHaveAttribute('open');
    expect(bodyOf()).toBeVisible();
  });

  it('folds the reasoning of a specialist too and keeps a marker without text a plain line', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ExecutionWorkLog
        execution={done}
        live={false}
        work={{
          steps: [
            step({ id: 'r0', kind: 'reasoning' }),
            step({ id: 'task-1', kind: 'delegation', label: 'task', specialist: 'topology_agent' }),
            step({
              id: 'r2',
              kind: 'reasoning',
              parentId: 'task-1',
              text: 'Le graphe **suffit**.',
            }),
          ],
          omittedSteps: 0,
        }}
      />,
    );
    await user.click(screen.getByText('Travail effectué'));
    await user.click(screen.getByText('Spécialiste topology_agent'));
    const [marker, nested] = screen.getAllByText('Réflexion').map((label) => label.closest('li')!);
    expect(marker!.querySelector('details')).toBeNull();
    expect(marker).toHaveTextContent('terminé');
    expect(marker).toHaveTextContent('0,4 s');
    const specialist = screen.getByRole('list', { name: 'Travail de Spécialiste topology_agent' });
    expect(specialist).toContainElement(nested!);
    const details = nested!.querySelector('details')!;
    expect(details).not.toHaveAttribute('open');
    expect(nested!.querySelector('[data-slot="reasoning-preview"]')).toHaveTextContent(
      'Le graphe suffit.',
    );
    await user.click(within(nested!).getByText('Réflexion'));
    expect(details).toHaveAttribute('open');
    expect(within(nested!).getByText('suffit', { selector: 'strong' })).toBeVisible();
  });
});

describe('Specialist rows', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-09-11T09:00:12.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  const specialistWork = (status: WorkStep['status']): ExecutionWork => ({
    steps: [
      step({
        id: 'task-1',
        kind: 'delegation',
        label: 'task',
        specialist: 'topology_agent',
        status,
        subagentStatus: status,
        finishedAt: status === 'running' ? null : 9_000,
      }),
      step({ id: 'n1', kind: 'message', parentId: 'task-1', text: 'Je commence par le graphe.' }),
      step({ id: 'call-1', kind: 'tool', label: 'execute_raw', parentId: 'task-1' }),
    ],
    omittedSteps: 0,
  });
  const rowOf = () => screen.getByText('Spécialiste topology_agent').closest('li')!;
  const detailsOf = () => rowOf().querySelector('details')!;
  const previewOf = () => rowOf().querySelector('[data-slot="specialist-preview"]');

  it('counts the folded work in words', () => {
    expect(specialistPreview(1, 3)).toBe('1 outil');
    expect(specialistPreview(4, 9)).toBe('4 outils');
    expect(specialistPreview(0, 1)).toBe('1 étape');
    expect(specialistPreview(0, 2)).toBe('2 étapes');
  });

  it('shows the work of a running specialist, then folds it once the specialist is done', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const view = render(
      <ExecutionWorkLog execution={running} live work={specialistWork('running')} />,
    );
    expect(detailsOf()).toHaveAttribute('open');
    expect(previewOf()).toBeNull();
    expect(within(rowOf()).getByText('Je commence par le graphe.')).toBeVisible();
    expect(detailsOf().querySelector('summary')).toHaveTextContent('en cours…');
    view.rerender(<ExecutionWorkLog execution={running} live work={specialistWork('completed')} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(detailsOf()).not.toHaveAttribute('open');
    expect(previewOf()).toHaveTextContent('1 outil');
    expect(within(rowOf()).getByText('Je commence par le graphe.')).not.toBeVisible();
    expect(detailsOf().querySelector('summary')).toHaveTextContent('8,0 s');
    await user.click(screen.getByText('Spécialiste topology_agent'));
    expect(detailsOf()).toHaveAttribute('open');
    expect(within(rowOf()).getByText('Je commence par le graphe.')).toBeVisible();
  });

  it('keeps the choice of a person who folded a specialist during its run', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const view = render(
      <ExecutionWorkLog execution={running} live work={specialistWork('running')} />,
    );
    await user.click(screen.getByText('Spécialiste topology_agent'));
    expect(detailsOf()).not.toHaveAttribute('open');
    expect(previewOf()).toHaveTextContent('1 outil');
    await user.click(screen.getByText('Spécialiste topology_agent'));
    view.rerender(<ExecutionWorkLog execution={running} live work={specialistWork('completed')} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(detailsOf()).toHaveAttribute('open');
  });

  it('keeps a delegation without any work of its own a plain line', () => {
    render(
      <ExecutionWorkLog
        execution={running}
        live
        work={{ steps: [specialistWork('running').steps[0]!], omittedSteps: 0 }}
      />,
    );
    expect(rowOf().querySelector('details')).toBeNull();
    expect(rowOf()).toHaveTextContent('en cours…');
  });
});

describe('Chat display preferences', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-09-11T09:00:12.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  const prefer = (preset: ChatPreset, switches: Partial<ChatDisplay> = {}) =>
    act(() => chatPreferencesStore.setValue({ ...applyPreset(preset), ...switches }));
  const live = (status: WorkStep['status']): ExecutionWork => {
    const ended = status === 'running' ? null : 3_400;
    return {
      steps: [
        step({ id: 'g0', kind: 'generation' }),
        step({
          id: 'r1',
          kind: 'reasoning',
          status,
          finishedAt: ended,
          text: `Je commence par la topologie. ${'Puis je vérifie. '.repeat(20)}Enfin je conclus.`,
        }),
        step({ id: 'm0', kind: 'message', text: 'Je regarde le graphe.' }),
        step({ id: 't0', kind: 'tool', label: 'write_todos' }),
        step({
          id: 'task-1',
          kind: 'delegation',
          label: 'task',
          specialist: 'topology_agent',
          subagentStatus: status,
          status,
          finishedAt: ended,
        }),
        step({ id: 'r2', kind: 'reasoning', parentId: 'task-1', text: 'Le graphe suffit.' }),
        step({
          id: 'call-1',
          kind: 'tool',
          label: 'execute_raw',
          parentId: 'task-1',
          status,
          finishedAt: ended,
        }),
      ],
      omittedSteps: 0,
    };
  };
  const logOf = (container: HTMLElement) =>
    container.querySelector('[data-slot="execution-work-log"]')!;

  it('keeps a running reasoning folded on its latest line under the standard preset', () => {
    expect(reasoningTail('court')).toBe('court');
    expect(reasoningTail(`${'début '.repeat(80)}fin du raisonnement`)).toMatch(
      /^….*fin du raisonnement$/u,
    );
    render(<ExecutionWorkLog execution={running} live work={live('running')} />);
    const row = screen.getByText('Réflexion').closest('li')!;
    expect(row.querySelector('details')).not.toHaveAttribute('open');
    expect(row.querySelector('[data-slot="reasoning-preview"]')).toHaveTextContent(
      /Enfin je conclus\.$/u,
    );
  });

  it('shows one live activity line under the simple preset, then only the specialists', async () => {
    prefer('simple');
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const view = render(<ExecutionWorkLog execution={running} live work={live('running')} />);
    const log = logOf(view.container);
    expect(log).not.toHaveAttribute('open');
    expect(log.querySelector('[data-slot="work-activity"]')).toHaveTextContent(
      '· topology_agent · execute_raw',
    );
    await user.click(screen.getByText('Travail en cours'));
    expect(log).toHaveAttribute('open');
    expect(log.querySelector('[data-slot="work-activity"]')).toBeNull();
    const list = screen.getByRole('list', { name: 'Étapes du travail' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([expect.stringContaining('Spécialiste topology_agent')]);
    view.rerender(<ExecutionWorkLog execution={done} live={false} work={live('completed')} />);
    expect(log).not.toHaveAttribute('open');
    expect(screen.getByText('Travail effectué').closest('summary')).toHaveTextContent('2 outils');
  });

  it('hides the reasoning of specialists without hiding Alfred’s', async () => {
    prefer('detailed', { specialistReasoning: false });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<ExecutionWorkLog execution={done} live={false} work={live('completed')} />);
    await user.click(screen.getByText('Travail effectué'));
    const list = screen.getByRole('list', { name: 'Étapes du travail' });
    expect(within(list).getAllByText('Réflexion')).toHaveLength(1);
    await user.click(within(list).getByText('Spécialiste topology_agent'));
    const specialist = within(list).getByRole('list', {
      name: 'Travail de Spécialiste topology_agent',
    });
    expect(within(specialist).queryByText('Réflexion')).toBeNull();
    expect(within(specialist).getByText('execute_raw')).toBeVisible();
  });

  it('says so when every step is hidden', async () => {
    prefer('simple');
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ExecutionWorkLog
        execution={done}
        live={false}
        work={{ steps: live('completed').steps.slice(0, 4), omittedSteps: 0 }}
      />,
    );
    await user.click(screen.getByText('Travail effectué'));
    expect(
      screen.getByText(
        'Les étapes de ce travail sont masquées par vos réglages d’affichage du chat.',
      ),
    ).toBeVisible();
  });

  it('keeps the log open once the answer settles when the person turned the fold off', () => {
    prefer('standard', { foldWhenDone: false });
    const view = render(<ExecutionWorkLog execution={running} live work={live('running')} />);
    const log = logOf(view.container);
    expect(log).toHaveAttribute('open');
    view.rerender(<ExecutionWorkLog execution={done} live={false} work={live('completed')} />);
    expect(log).toHaveAttribute('open');
  });
});
