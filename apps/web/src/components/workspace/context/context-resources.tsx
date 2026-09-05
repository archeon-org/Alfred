import { FileText, Files } from 'lucide-react';
import { useId } from 'react';

import { cn } from '@/lib/cn';
import type { ResourceView } from '@/lib/workspace/workspace.types';

export function ContextResources({ resources }: { readonly resources: readonly ResourceView[] }) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold" id={titleId}>
          Ressources
        </h3>
        <span className="rounded border border-border px-1.5 py-0.5 text-2xs text-muted-foreground">
          {resources.length.toString().padStart(2, '0')}
        </span>
      </div>
      {resources.length > 0 ? (
        <ul className="mt-4 grid gap-4">
          {resources.map((resource) => (
            <li className="flex items-center gap-2.5" key={resource.id}>
              <span
                className={cn(
                  'flex h-11 w-9 shrink-0 flex-col items-center justify-center rounded-md border',
                  resource.format === 'MD'
                    ? 'border-primary/15 bg-primary/5 text-primary'
                    : 'border-warning/20 bg-warning/10 text-warning-foreground',
                )}
              >
                <FileText aria-hidden="true" className="size-4.5" />
                <small className="mt-0.5 text-2xs font-bold">{resource.format}</small>
              </span>
              <div className="min-w-0">
                <strong className="text-2xs font-medium [overflow-wrap:anywhere]">
                  {resource.name}
                </strong>
                <p className="mt-1 text-2xs text-muted-foreground">{resource.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-primary/20 bg-card/30 px-3 py-5 text-center">
          <Files aria-hidden="true" className="mx-auto size-6 text-primary/50" strokeWidth={1.3} />
          <p className="mt-3 text-2xs text-muted-foreground">Une place pour vos références.</p>
          <span className="mt-2 block text-2xs leading-relaxed text-muted-foreground">
            Les ressources de votre conversation apparaîtront ici.
          </span>
        </div>
      )}
    </section>
  );
}
