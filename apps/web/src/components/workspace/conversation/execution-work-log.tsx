import type { Execution, ExecutionWork, ExecutionWorkSummary, WorkStep } from '@alfred/contracts';
import { ChevronRight, LoaderCircle } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import {
  groupEntries,
  WorkStepRow,
  type WorkEntry,
} from '@/components/workspace/conversation/work-step-row';
import { useElapsed } from '@/hooks/ui/use-elapsed';
import { useChatPreferences } from '@/hooks/workspace/use-chat-preferences';
import { formatDuration } from '@/lib/workspace/format-duration';
import { currentActivity, visibleWork } from '@/lib/workspace/work-display';

export interface WorkHeading {
  /** What the header says: working, done, stopped, failed. */
  readonly title: string;
  readonly durationMs: number | null;
  readonly counts: readonly string[];
}

const TITLES: Readonly<Record<string, string>> = {
  completed: 'Travail effectué',
  cancelled: 'Travail arrêté',
  failed: 'Travail interrompu par une erreur',
  timed_out: 'Travail interrompu par le délai',
  interrupted: 'Travail en attente',
  recovery_required: 'Travail en attente de vérification',
};

const plural = (count: number, one: string, many: string) =>
  count === 0 ? null : `${count} ${count === 1 ? one : many}`;

/** Header of the log from the execution, the live elapsed time and the work's counts. */
export function workHeading(
  execution: Execution | null,
  live: boolean,
  elapsedMs: number | null,
  work: ExecutionWork,
  summary?: ExecutionWorkSummary,
): WorkHeading {
  const status = execution?.status ?? summary?.status;
  const settled = !live && status !== undefined && status !== 'pending' && status !== 'running';
  const title = settled ? (TITLES[status] ?? 'Travail effectué') : 'Travail en cours';
  const started = execution?.startedAt ?? null;
  const finished = execution?.finishedAt ?? null;
  const durationMs = live
    ? elapsedMs
    : (summary?.durationMs ??
      (started !== null && finished !== null
        ? Math.max(0, Date.parse(finished) - Date.parse(started))
        : null));
  const tools = summary?.tools ?? work.steps.filter((step) => step.kind === 'tool').length;
  const specialists =
    summary?.delegations ??
    work.steps.filter((step) => step.kind === 'delegation' || step.kind === 'subagent').length;
  const omitted = work.omittedSteps;
  const counts = [
    plural(tools, 'outil', 'outils'),
    plural(specialists, 'spécialiste', 'spécialistes'),
    omitted > 0 ? `${omitted} étapes non affichées` : null,
  ].filter((value): value is string => value !== null);
  return { title, durationMs, counts };
}

/** Top-level entries with each specialist's steps beneath its delegation, repeated tools folded. */
export function groupSteps(steps: readonly WorkStep[]): readonly WorkEntry[] {
  const children = new Map<string, WorkStep[]>();
  for (const step of steps) {
    if (step.parentId === undefined) continue;
    const list = children.get(step.parentId);
    if (list === undefined) children.set(step.parentId, [step]);
    else list.push(step);
  }
  return groupEntries(
    steps.filter((step) => step.parentId === undefined),
    (id) => children.get(id) ?? [],
  );
}

interface ExecutionWorkLogProps {
  readonly work: ExecutionWork;
  readonly execution: Execution | null;
  /** The answer is still streaming: the log stays open and its clock runs. */
  readonly live: boolean;
  /** For a stored answer: the account served with its transcript row. */
  readonly summary?: ExecutionWorkSummary;
  /** Called when the log is opened; a stored answer loads its steps then. */
  readonly onOpen?: () => void;
  /** Shown in the body instead of the steps while they load or when they could not load. */
  readonly body?: ReactNode;
}

/**
 * What Alfred did for an answer, as part of the transcript: a quiet line that unfolds the work
 * beneath it, open while it works, folded once it settles, reopened at will. The header carries
 * the outcome, the duration and the counts.
 */
export function ExecutionWorkLog({
  work,
  execution,
  live,
  summary,
  onOpen,
  body,
}: ExecutionWorkLogProps) {
  const chat = useChatPreferences();
  const elapsed = useElapsed(execution?.startedAt ?? execution?.createdAt ?? null, live);
  const [open, setOpen] = useState(live && chat.openWhileWorking);
  const [wasLive, setWasLive] = useState(live);
  if (wasLive !== live) {
    // The log opens while the answer is being worked on when the person wants it, and folds
    // itself once it settles unless the person chose to keep it; the person can reopen it
    // afterwards. Adjusted during render, without an effect.
    setWasLive(live);
    if (live) setOpen(chat.openWhileWorking);
    else if (chat.foldWhenDone) setOpen(false);
  }
  const heading = workHeading(execution, live, elapsed, work, summary);
  const empty = work.steps.length === 0 && work.omittedSteps === 0 && (summary?.steps ?? 0) === 0;
  if (empty && !live) return null;
  const duration = heading.durationMs === null ? '' : formatDuration(heading.durationMs);
  const shown = visibleWork(work, chat);
  const activity = live && !open ? currentActivity(work) : null;
  const content =
    body ??
    (work.steps.length === 0 ? null : shown.steps.length === 0 ? (
      <p className="py-1 text-xs text-muted-foreground">
        Les étapes de ce travail sont masquées par vos réglages d’affichage du chat.
      </p>
    ) : (
      <ol aria-label="Étapes du travail" className="text-xs">
        {groupSteps(shown.steps).map((entry) => (
          <WorkStepRow key={entry.kind === 'group' ? entry.id : entry.step.id} entry={entry} />
        ))}
        {work.omittedSteps > 0 ? (
          <li className="py-1 text-muted-foreground">+{work.omittedSteps} étapes non affichées</li>
        ) : null}
      </ol>
    ));
  return (
    <details
      className="group/work mb-2"
      data-slot="execution-work-log"
      open={open}
      onToggle={(event) => {
        const next = event.currentTarget.open;
        // React also hands this log the toggles of the rows nested in it, and the browser echoes
        // the open state the log set itself: neither is the person's choice. Queuing either would
        // undo the fold that settling the answer applies during render.
        if (event.target !== event.currentTarget || next === open) return;
        setOpen(next);
        if (next) onOpen?.();
      }}
    >
      <summary className="-ml-1 flex w-fit max-w-full min-w-0 cursor-pointer list-none items-center gap-1.5 rounded-md px-1 py-0.5 text-xs text-muted-foreground select-none hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
        {live ? (
          <LoaderCircle aria-hidden="true" className="shrink-0 animate-spin" size={13} />
        ) : (
          <ChevronRight
            aria-hidden="true"
            className="shrink-0 transition-transform group-open/work:rotate-90 motion-reduce:transition-none"
            size={13}
          />
        )}
        <span className="font-medium">{heading.title}</span>
        {duration !== '' ? <span className="tabular-nums">· {duration}</span> : null}
        {activity !== null ? (
          <span className="min-w-0 truncate" data-slot="work-activity">
            · {activity}
          </span>
        ) : (
          heading.counts.map((count) => (
            <span className="hidden sm:inline" key={count}>
              · {count}
            </span>
          ))
        )}
      </summary>
      {content !== null ? <div className="mt-1 pl-0.5">{content}</div> : null}
    </details>
  );
}
