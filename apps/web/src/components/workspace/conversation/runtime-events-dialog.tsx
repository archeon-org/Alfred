import { Download } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { RuntimeEventView } from '@/contexts/chat-session/chat-session-context';
import { useReturnFocus } from '@/hooks/ui/use-return-focus';
import { downloadBlob } from '@/lib/browser/download-blob';

interface RuntimeEventsDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly executionId: string;
  readonly events: readonly RuntimeEventView[];
}

/** Diagnostic copies of one answer's public events; never used to rebuild the transcript. */
export function RuntimeEventsDialog({
  open,
  onOpenChange,
  executionId,
  events,
}: RuntimeEventsDialogProps) {
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const returnFocus = useReturnFocus();
  const download = () => {
    try {
      downloadBlob(
        new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' }),
        `alfred-events-${executionId}.json`,
      );
      setDownloadError(null);
    } catch {
      setDownloadError('Impossible de télécharger les événements. Réessayez.');
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl" {...returnFocus}>
        <DialogHeader>
          <DialogTitle>Événements du runtime</DialogTitle>
          <DialogDescription>
            {events.length} événement{events.length > 1 ? 's' : ''} public
            {events.length > 1 ? 's' : ''} de cette réponse, dans l’ordre reçu. Exécution{' '}
            <code className="font-mono text-xs">{executionId}</code>.
          </DialogDescription>
        </DialogHeader>
        {downloadError ? (
          <p role="alert" className="text-xs text-destructive">
            {downloadError}
          </p>
        ) : null}
        <div
          role="region"
          aria-label="Événements capturés"
          // Scroll regions need keyboard focus so arrow keys can inspect both axes.
          // eslint-disable-next-line jsx-a11y-x/no-noninteractive-tabindex
          tabIndex={0}
          className="max-h-[60dvh] min-w-0 overflow-auto overscroll-contain rounded-xl border border-border bg-muted/40 text-xs focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring [scrollbar-width:thin]"
        >
          <ol className="divide-y divide-border">
            {events.map((event, index) => (
              <li key={event.id}>
                <details className="group">
                  <summary className="flex cursor-pointer items-center gap-3 px-3 py-2 select-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
                    <span className="w-8 shrink-0 font-mono text-muted-foreground tabular-nums">
                      {index + 1}
                    </span>
                    <span className="truncate font-mono font-medium">{event.event}</span>
                  </summary>
                  <pre className="m-0 w-max min-w-full border-t border-border px-3 py-2 font-mono whitespace-pre">
                    {JSON.stringify(event.data, null, 2)}
                  </pre>
                </details>
              </li>
            ))}
          </ol>
        </div>
        <DialogFooter showCloseButton>
          <Button size="sm" variant="outline" onClick={download} disabled={events.length === 0}>
            <Download aria-hidden="true" size={14} />
            Télécharger le JSON
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
