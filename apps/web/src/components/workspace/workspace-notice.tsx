import { LoaderCircle, TriangleAlert } from 'lucide-react';
import type { ReactNode, Ref } from 'react';

import { Card } from '@/components/ui/card';

interface WorkspaceNoticeProps {
  readonly ref?: Ref<HTMLElement>;
  readonly title: string;
  readonly message: string;
  readonly tone?: 'error' | 'loading';
  readonly action?: ReactNode;
}

/** Main-column placeholder for loading, missing or failed workspace resources. */
export function WorkspaceNotice({
  action,
  message,
  ref,
  title,
  tone = 'loading',
}: WorkspaceNoticeProps) {
  return (
    <main
      aria-busy={tone === 'loading'}
      className="flex h-full min-h-0 min-w-0 items-center justify-center outline-none focus-visible:outline-2 focus-visible:-outline-offset-3 focus-visible:outline-ring"
      id="main-content"
      ref={ref}
      tabIndex={-1}
    >
      <Card
        className="w-full max-w-md p-8 text-center"
        role={tone === 'error' ? 'alert' : 'status'}
      >
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
          {tone === 'error' ? (
            <TriangleAlert aria-hidden="true" className="text-destructive" size={24} />
          ) : (
            <LoaderCircle
              aria-hidden="true"
              className="animate-spin text-primary motion-reduce:animate-none"
              size={24}
            />
          )}
        </span>
        <h1 className="mt-5 text-lg font-semibold text-foreground">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{message}</p>
        {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
      </Card>
    </main>
  );
}
