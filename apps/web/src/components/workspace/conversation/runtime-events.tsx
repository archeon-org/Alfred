import { ChevronRight, Download } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import type { RuntimeEventView } from '@/contexts/chat-session/chat-session-context';
import { isRuntimeEventDebugEnabled } from '@/lib/workspace/runtime-event-debug';

interface RuntimeEventsProps {
  readonly events: readonly RuntimeEventView[];
  readonly error: string | null;
}

/** Diagnostic copies only; never used to reconstruct the product transcript. */
export function RuntimeEvents({ events, error }: RuntimeEventsProps) {
  const [downloadError, setDownloadError] = useState<string | null>(null);
  if (!isRuntimeEventDebugEnabled() || (events.length === 0 && error === null)) return null;
  const download = () => {
    try {
      const blob = new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `alfred-events-${new Date().toISOString().replaceAll(':', '-')}.json`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      // Leave the browser time to start the download before releasing its backing bytes.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDownloadError(null);
    } catch {
      setDownloadError('Impossible de télécharger les événements. Réessayez.');
    }
  };
  return (
    <div className="min-w-0">
      {error || downloadError ? (
        <p role="alert" className="mb-2 text-xs text-destructive">
          {error ?? downloadError}
        </p>
      ) : null}
      <details className="group min-w-0 rounded-xl border border-border bg-muted/40 text-xs">
        <summary className="flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-2 font-medium text-muted-foreground select-none focus-visible:outline-2 focus-visible:outline-ring">
          <ChevronRight
            aria-hidden="true"
            className="transition-transform group-open:rotate-90 motion-reduce:transition-none"
            size={14}
          />
          Événements du runtime ({events.length})
        </summary>
        <div className="border-t border-border p-2">
          <Button size="sm" variant="outline" onClick={download} disabled={events.length === 0}>
            <Download aria-hidden="true" size={14} />
            Télécharger les événements
          </Button>
        </div>
        <div
          role="region"
          aria-label="Événements capturés"
          // Scroll regions need keyboard focus so arrow keys can inspect both axes.
          // eslint-disable-next-line jsx-a11y-x/no-noninteractive-tabindex
          tabIndex={0}
          className="max-h-72 min-w-0 overflow-auto overscroll-contain border-t border-border font-mono focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring [scrollbar-width:thin]"
        >
          <pre className="m-0 w-max min-w-full p-3 text-xs whitespace-pre">
            {JSON.stringify(events, null, 2)}
          </pre>
        </div>
      </details>
    </div>
  );
}
