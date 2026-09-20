import type { ExecutionWorkSummary } from '@alfred/contracts';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ExecutionWorkLog } from '@/components/workspace/conversation/execution-work-log';
import { EMPTY_WORK } from '@/contexts/chat-session/live-work';
import { useExecutionWork } from '@/hooks/executions/use-execution-work';
import { describeApiError } from '@/lib/workspace/api-error-message';

interface StoredWorkLogProps {
  readonly executionId: string;
  readonly summary: ExecutionWorkSummary;
}

/** The work log of a stored answer: folded with its account, loaded when first opened. */
export function StoredWorkLog({ executionId, summary }: StoredWorkLogProps) {
  const [opened, setOpened] = useState(false);
  const work = useExecutionWork(executionId, opened);
  const body = !opened ? null : work.isPending ? (
    <div aria-busy="true" className="flex flex-col gap-1.5 py-1">
      <Skeleton className="h-3 w-2/3" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  ) : work.isError ? (
    <p className="flex flex-wrap items-center gap-2 py-1 text-destructive" role="alert">
      {describeApiError(work.error, 'Les étapes de cette réponse sont indisponibles.')}
      <Button onClick={() => void work.refetch()} size="sm" variant="outline">
        Réessayer
      </Button>
    </p>
  ) : work.data === null ? (
    <p className="py-1 text-muted-foreground">
      Les étapes de cette réponse ne sont pas disponibles.
    </p>
  ) : null;
  return (
    <ExecutionWorkLog
      body={body}
      execution={null}
      live={false}
      onOpen={() => setOpened(true)}
      summary={summary}
      work={work.data ?? EMPTY_WORK}
    />
  );
}
