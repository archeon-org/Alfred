import type { WorkStep } from '@alfred/contracts';
import { Bot } from 'lucide-react';
import type { ReactNode } from 'react';

import {
  DISCLOSURE_SUMMARY,
  DisclosureChevron,
  StatusMark,
  Trailing,
} from '@/components/workspace/conversation/work-step-marks';
import { useRunDisclosure } from '@/hooks/ui/use-run-disclosure';
import { cn } from '@/lib/cn';

/** What a folded specialist did, in a few words: its tool calls, or else its steps. */
export function specialistPreview(tools: number, steps: number): string {
  if (tools > 0) return `${tools} ${tools === 1 ? 'outil' : 'outils'}`;
  return `${steps} ${steps === 1 ? 'étape' : 'étapes'}`;
}

interface SpecialistRowProps {
  readonly step: WorkStep;
  /** "Spécialiste <name>", or "Délégation" before the specialist is known. */
  readonly name: string;
  readonly tools: number;
  readonly steps: number;
  /** The rows of the specialist's own work. */
  readonly children: ReactNode;
}

/**
 * A delegation with the work of its specialist beneath it. It stays open while the specialist
 * works, then folds to one line once it is done, unless the person toggled it during the run.
 * A specialist already done when it appears starts folded.
 */
export function SpecialistRow({ step, name, tools, steps, children }: SpecialistRowProps) {
  const { open, onToggle } = useRunDisclosure(step.status === 'running');
  return (
    <li className="py-0.5">
      <details
        className="group/specialist"
        data-slot="specialist-step"
        open={open}
        onToggle={onToggle}
      >
        <summary className={cn(DISCLOSURE_SUMMARY, step.status === 'failed' && 'text-destructive')}>
          <Bot aria-hidden="true" className="shrink-0 text-muted-foreground" size={13} />
          <span className="min-w-0 shrink-0 truncate">{name}</span>
          <DisclosureChevron group="specialist" />
          <StatusMark status={step.status} />
          {open ? null : (
            <span
              className="min-w-0 flex-1 truncate text-muted-foreground"
              data-slot="specialist-preview"
            >
              {specialistPreview(tools, steps)}
            </span>
          )}
          <Trailing step={step} />
        </summary>
        <ol aria-label={`Travail de ${name}`} className="mt-0.5 ml-5 border-l border-border pl-3">
          {children}
        </ol>
      </details>
    </li>
  );
}
