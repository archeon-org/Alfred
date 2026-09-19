import { ExternalLink } from 'lucide-react';
import { useState } from 'react';

import { IconButton } from '@/components/ui/icon-button';
import { useExecutionTraceLink } from '@/hooks/executions/use-execution-trace-link';
import { describeApiError } from '@/lib/workspace/api-error-message';

interface TraceLinkActionProps {
  readonly executionId: string;
}

/**
 * Opens the run's trace in the runtime's console (development diagnostic behind `traceLinks`).
 * The address is fetched on demand and opened in a new tab; it then stays as a plain link so a
 * blocked pop-up never loses it.
 */
export function TraceLinkAction({ executionId }: TraceLinkActionProps) {
  const trace = useExecutionTraceLink();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const open = async () => {
    setError(null);
    try {
      const link = await trace.mutateAsync(executionId);
      setUrl(link.url);
      window.open(link.url, '_blank', 'noopener,noreferrer');
    } catch (caught) {
      setError(describeApiError(caught, 'La trace de cette réponse est indisponible.'));
    }
  };
  if (url !== null) {
    return (
      <a
        aria-label="Ouvrir la trace de cette réponse"
        className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none"
        href={url}
        rel="noreferrer noopener"
        target="_blank"
        title="Ouvrir la trace de cette réponse"
      >
        <ExternalLink aria-hidden="true" size={15} />
      </a>
    );
  }
  return (
    <>
      <IconButton
        disabled={trace.isPending}
        label="Voir la trace de cette réponse"
        onClick={() => void open()}
        size="icon-sm"
      >
        <ExternalLink aria-hidden="true" size={15} />
      </IconButton>
      {error ? (
        <span className="text-xs text-destructive" role="alert">
          {error}
        </span>
      ) : null}
    </>
  );
}
