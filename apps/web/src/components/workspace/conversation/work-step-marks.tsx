import type { WorkStep, WorkStepStatus } from '@alfred/contracts';
import { Check, ChevronRight, LoaderCircle, MinusCircle, X } from 'lucide-react';

import { cn } from '@/lib/cn';
import { durationBetween, formatDuration } from '@/lib/workspace/format-duration';

const STATUS = {
  running: {
    icon: LoaderCircle,
    label: 'en cours',
    className: 'animate-spin text-muted-foreground',
  },
  completed: { icon: Check, label: 'terminé', className: 'text-muted-foreground' },
  failed: { icon: X, label: 'échoué', className: 'text-destructive' },
  interrupted: { icon: MinusCircle, label: 'interrompu', className: 'text-muted-foreground' },
} as const satisfies Record<WorkStepStatus, unknown>;

/** The outcome of a step: an icon for the eye, its word for assistive technologies. */
export function StatusMark({ status }: { readonly status: WorkStepStatus }) {
  const mark = STATUS[status];
  const Icon = mark.icon;
  return (
    <>
      <Icon aria-hidden="true" className={cn('shrink-0', mark.className)} size={13} />
      <span className="sr-only">{mark.label}</span>
    </>
  );
}

export function Duration({ ms }: { readonly ms: number | null }) {
  if (ms === null) return null;
  return (
    <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">
      {formatDuration(ms)}
    </span>
  );
}

/** The end of a step's line: still running, or how long it took. */
export function Trailing({ step }: { readonly step: WorkStep }) {
  return step.status === 'running' ? (
    <span className="ml-auto shrink-0 text-muted-foreground">en cours…</span>
  ) : (
    <Duration ms={durationBetween(step.startedAt, step.finishedAt)} />
  );
}

/**
 * The affordance of a row that unfolds. `group` names the Tailwind group of its `<details>`, whose
 * open state turns the chevron; the class names stay literal so Tailwind generates them.
 */
const CHEVRON_TURN = {
  tools: 'group-open/tools:rotate-90',
  reasoning: 'group-open/reasoning:rotate-90',
  specialist: 'group-open/specialist:rotate-90',
} as const;

export function DisclosureChevron({ group }: { readonly group: keyof typeof CHEVRON_TURN }) {
  return (
    <ChevronRight
      aria-hidden="true"
      className={cn(
        'shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none',
        CHEVRON_TURN[group],
      )}
      size={12}
    />
  );
}

/** Shared line of a summary that unfolds a step: pointer, no marker, visible keyboard focus. */
export const DISCLOSURE_SUMMARY =
  'flex min-w-0 cursor-pointer list-none items-center gap-2 rounded-sm select-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden';
