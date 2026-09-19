import { Check, Copy, ListTree } from 'lucide-react';
import { useEffect, useState } from 'react';

import { IconButton } from '@/components/ui/icon-button';
import { RuntimeEventsDialog } from '@/components/workspace/conversation/runtime-events-dialog';
import { TraceLinkAction } from '@/components/workspace/conversation/trace-link-action';
import type { RuntimeEventView } from '@/contexts/chat-session/chat-session-context';
import { cn } from '@/lib/cn';

interface TurnActionsProps {
  readonly content: string;
  readonly executionId: string | null;
  /** Diagnostic events of this answer's execution; empty unless diagnostics are enabled. */
  readonly events: readonly RuntimeEventView[];
  /** Whether the API serves trace links (`traceLinks` capability). */
  readonly traceLinksEnabled?: boolean;
  readonly className?: string;
}

const COPIED_FOR_MS = 2000;

/** Quiet controls under an answer: copy the Markdown source, inspect the run's public events. */
export function TurnActions({
  content,
  executionId,
  events,
  traceLinksEnabled = false,
  className,
}: TurnActionsProps) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [eventsOpen, setEventsOpen] = useState(false);
  useEffect(() => {
    if (copyState === 'idle') return;
    const timer = setTimeout(() => setCopyState('idle'), COPIED_FOR_MS);
    return () => clearTimeout(timer);
  }, [copyState]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };
  const hasEvents = executionId !== null && events.length > 0;
  return (
    <div
      className={cn(
        'flex items-center gap-0.5 text-muted-foreground opacity-70 transition-opacity group-hover/turn:opacity-100 focus-within:opacity-100 motion-reduce:transition-none',
        className,
      )}
    >
      <IconButton
        label={copyState === 'copied' ? 'Copié' : 'Copier la réponse'}
        onClick={() => void copy()}
        size="icon-sm"
      >
        {copyState === 'copied' ? (
          <Check aria-hidden="true" size={15} />
        ) : (
          <Copy aria-hidden="true" size={15} />
        )}
      </IconButton>
      {hasEvents ? (
        <IconButton
          label={`Événements du runtime (${events.length})`}
          onClick={() => setEventsOpen(true)}
          size="icon-sm"
        >
          <ListTree aria-hidden="true" size={15} />
        </IconButton>
      ) : null}
      {traceLinksEnabled && executionId !== null ? (
        <TraceLinkAction executionId={executionId} />
      ) : null}
      {copyState !== 'idle' ? (
        <span className="sr-only" role="status">
          {copyState === 'copied' ? 'Réponse copiée.' : 'Copie impossible.'}
        </span>
      ) : null}
      {hasEvents ? (
        <RuntimeEventsDialog
          open={eventsOpen}
          onOpenChange={setEventsOpen}
          executionId={executionId}
          events={events}
        />
      ) : null}
    </div>
  );
}
