import type { WorkStep } from '@alfred/contracts';
import { Brain } from 'lucide-react';

import { MarkdownView } from '@/components/ui/markdown-view';
import {
  DISCLOSURE_SUMMARY,
  DisclosureChevron,
  StatusMark,
  Trailing,
} from '@/components/workspace/conversation/work-step-marks';
import { useRunDisclosure } from '@/hooks/ui/use-run-disclosure';
import { useChatPreferences } from '@/hooks/workspace/use-chat-preferences';
import { cn } from '@/lib/cn';
import { markdownToText } from '@/lib/markdown/markdown-text';

/** Only the start of a long reasoning is flattened: the preview shows a single line of it. */
const PREVIEW_SOURCE_LENGTH = 600;
const PREVIEW_LENGTH = 160;

export function reasoningPreview(text: string): string {
  return markdownToText(text.slice(0, PREVIEW_SOURCE_LENGTH), PREVIEW_LENGTH);
}

/** The latest line of a reasoning still being written, so a folded row shows it progressing. */
export function reasoningTail(text: string): string {
  const flat = markdownToText(text.slice(-PREVIEW_SOURCE_LENGTH));
  return flat.length <= PREVIEW_LENGTH ? flat : `…${flat.slice(-(PREVIEW_LENGTH - 1)).trimStart()}`;
}

/**
 * Exposed reasoning of the orchestrator or of a specialist. When the person chose to open reasoning
 * while it is written (Paramètres › Chat), its text streams in the open while it runs, then folds
 * to one line with a preview once complete, unless the person toggled it during the run.
 * Otherwise it stays folded on its latest line while it runs. A reasoning already complete when
 * it appears starts folded; a marker without text stays a plain line.
 */
export function ReasoningRow({ step }: { readonly step: WorkStep }) {
  const { openReasoningWhileStreaming } = useChatPreferences();
  const running = step.status === 'running';
  const { open, onToggle } = useRunDisclosure(openReasoningWhileStreaming && running);
  const text = step.text ?? '';
  const header = (
    <>
      <Brain aria-hidden="true" className="shrink-0" size={13} />
      <span className="shrink-0">Réflexion</span>
    </>
  );
  if (text === '')
    return (
      <li className="py-1">
        <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
          {header}
          <StatusMark status={step.status} />
          <Trailing step={step} />
        </div>
      </li>
    );
  return (
    <li className="py-1">
      <details
        className="group/reasoning"
        data-slot="reasoning-step"
        open={open}
        onToggle={onToggle}
      >
        <summary className={cn(DISCLOSURE_SUMMARY, 'text-muted-foreground hover:text-foreground')}>
          {header}
          <DisclosureChevron group="reasoning" />
          <StatusMark status={step.status} />
          {open ? null : (
            <span className="min-w-0 flex-1 truncate" data-slot="reasoning-preview">
              {running ? reasoningTail(text) : reasoningPreview(text)}
            </span>
          )}
          <Trailing step={step} />
        </summary>
        <MarkdownView
          className="mt-0.5 text-xs leading-relaxed text-muted-foreground"
          source={text}
        />
      </details>
    </li>
  );
}
