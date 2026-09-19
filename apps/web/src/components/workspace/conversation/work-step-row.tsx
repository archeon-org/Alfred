import type { WorkStep, WorkStepStatus } from '@alfred/contracts';
import { Bot, Hourglass, Wrench } from 'lucide-react';

import { MarkdownView } from '@/components/ui/markdown-view';
import { ReasoningRow } from '@/components/workspace/conversation/reasoning-row';
import { SpecialistRow } from '@/components/workspace/conversation/specialist-row';
import {
  DISCLOSURE_SUMMARY,
  DisclosureChevron,
  Duration,
  StatusMark,
  Trailing,
} from '@/components/workspace/conversation/work-step-marks';
import { cn } from '@/lib/cn';
import { durationBetween } from '@/lib/workspace/format-duration';

/** The runtime's delegation tool reads as a delegation, not as a tool named after itself. */
export function describeStep(step: WorkStep): string {
  switch (step.kind) {
    case 'reasoning':
      return 'Réflexion';
    case 'generation':
      return 'Génération sans réponse';
    case 'delegation':
    case 'subagent':
      return step.specialist === undefined ? 'Délégation' : `Spécialiste ${step.specialist}`;
    case 'tool':
      return step.label === 'task' ? 'Délégation' : step.label;
    case 'message':
      return '';
  }
}

/** Consecutive calls of the same tool by the same owner read as one row that unfolds. */
export interface ToolGroup {
  readonly kind: 'group';
  readonly id: string;
  readonly steps: readonly WorkStep[];
}
export interface SingleEntry {
  readonly kind: 'single';
  readonly step: WorkStep;
  readonly children: readonly WorkEntry[];
}
export type WorkEntry = SingleEntry | ToolGroup;

export function groupEntries(
  steps: readonly WorkStep[],
  childrenOf: (id: string) => readonly WorkStep[],
): readonly WorkEntry[] {
  const entries: WorkEntry[] = [];
  for (const step of steps) {
    const previous = entries.at(-1);
    if (step.kind === 'tool' && previous !== undefined) {
      const last = previous.kind === 'group' ? previous.steps.at(-1) : previous.step;
      if (last?.kind === 'tool' && last.label === step.label) {
        entries[entries.length - 1] =
          previous.kind === 'group'
            ? { ...previous, steps: [...previous.steps, step] }
            : { kind: 'group', id: previous.step.id, steps: [previous.step, step] };
        continue;
      }
    }
    entries.push({
      kind: 'single',
      step,
      children: groupEntries(childrenOf(step.id), childrenOf),
    });
  }
  return entries;
}

const ICONS = { generation: Hourglass, tool: Wrench } as const;

/** The orchestrator's or a specialist's narration between its actions. */
function Narration({ step }: { readonly step: WorkStep }) {
  if (step.text === undefined || step.text === '') return null;
  return (
    <li className="py-1">
      <MarkdownView className="text-xs leading-relaxed text-muted-foreground" source={step.text} />
    </li>
  );
}

function groupStatus(steps: readonly WorkStep[]): WorkStepStatus {
  if (steps.some((step) => step.status === 'running')) return 'running';
  if (steps.some((step) => step.status === 'failed')) return 'failed';
  if (steps.some((step) => step.status === 'interrupted')) return 'interrupted';
  return 'completed';
}

function ToolGroupRow({ group }: { readonly group: ToolGroup }) {
  const status = groupStatus(group.steps);
  const label = group.steps[0]?.label ?? '';
  const first = group.steps[0]?.startedAt ?? 0;
  const last = group.steps.reduce<number | null>(
    (end, step) =>
      end === null || step.finishedAt === null ? null : Math.max(end, step.finishedAt),
    0,
  );
  return (
    <li className="py-0.5">
      <details className="group/tools">
        <summary className={DISCLOSURE_SUMMARY}>
          <Wrench aria-hidden="true" className="shrink-0 text-muted-foreground" size={13} />
          <span className="min-w-0 truncate font-mono">{label}</span>
          <span className="shrink-0 text-muted-foreground">×{group.steps.length}</span>
          <DisclosureChevron group="tools" />
          <StatusMark status={status} />
          {status === 'running' ? (
            <span className="ml-auto shrink-0 text-muted-foreground">en cours…</span>
          ) : (
            <Duration ms={durationBetween(first, last)} />
          )}
        </summary>
        <ol aria-label={`Appels de ${label}`} className="mt-0.5 ml-5 border-l border-border pl-3">
          {group.steps.map((step) => (
            <WorkStepRow key={step.id} entry={{ kind: 'single', step, children: [] }} />
          ))}
        </ol>
      </details>
    </li>
  );
}

/** Tool calls and steps of a specialist's work, nested groups included. */
function tally(entries: readonly WorkEntry[]): { readonly tools: number; readonly steps: number } {
  let tools = 0;
  let steps = 0;
  for (const entry of entries) {
    if (entry.kind === 'group') {
      tools += entry.steps.length;
      steps += entry.steps.length;
      continue;
    }
    const nested = tally(entry.children);
    tools += nested.tools + (entry.step.kind === 'tool' ? 1 : 0);
    steps += nested.steps + 1;
  }
  return { tools, steps };
}

const entryKey = (entry: WorkEntry) => (entry.kind === 'group' ? entry.id : entry.step.id);

/** One line of the work log; a delegation lists the steps of its specialist beneath it. */
export function WorkStepRow({ entry }: { readonly entry: WorkEntry }) {
  if (entry.kind === 'group') return <ToolGroupRow group={entry} />;
  const { step, children } = entry;
  if (step.kind === 'message') return <Narration step={step} />;
  if (step.kind === 'reasoning') return <ReasoningRow step={step} />;
  const Icon = step.kind === 'tool' || step.kind === 'generation' ? ICONS[step.kind] : Bot;
  const name = describeStep(step);
  if ((step.kind === 'delegation' || step.kind === 'subagent') && children.length > 0) {
    const { tools, steps } = tally(children);
    return (
      <SpecialistRow name={name} step={step} steps={steps} tools={tools}>
        {children.map((child) => (
          <WorkStepRow key={entryKey(child)} entry={child} />
        ))}
      </SpecialistRow>
    );
  }
  return (
    <li className="py-0.5">
      <div
        className={cn(
          'flex min-w-0 items-center gap-2',
          step.status === 'failed' && 'text-destructive',
          step.kind === 'generation' && 'text-muted-foreground',
        )}
      >
        <Icon aria-hidden="true" className="shrink-0 text-muted-foreground" size={13} />
        <span className={cn('min-w-0 truncate', step.kind === 'tool' && 'font-mono')}>{name}</span>
        <StatusMark status={step.status} />
        <Trailing step={step} />
      </div>
      {children.length > 0 ? (
        <ol aria-label={`Travail de ${name}`} className="mt-0.5 ml-5 border-l border-border pl-3">
          {children.map((child) => (
            <WorkStepRow key={entryKey(child)} entry={child} />
          ))}
        </ol>
      ) : null}
    </li>
  );
}
