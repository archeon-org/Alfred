import type { FileQuota } from '@alfred/contracts';
import { useId } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/cn';
import { formatFileSize, formatQuota, quotaTakenBytes } from '@/lib/files/file-format';

interface QuotaMeterProps {
  /** Absent while the budget loads. */
  readonly quota: FileQuota | undefined;
  readonly isError?: boolean;
  readonly className?: string;
}

/** Above this share of the budget the bar warns that the library is nearly full. */
const NEARLY_FULL = 0.9;

/**
 * How much of the personal file budget is taken. The native `<meter>` carries the value for
 * assistive technology; browsers cannot theme it consistently, so a token-coloured bar draws it.
 */
export function QuotaMeter({ quota, isError = false, className }: QuotaMeterProps) {
  const labelId = useId();
  if (isError)
    return (
      <p className={cn('text-2xs text-muted-foreground', className)} role="status">
        Espace utilisé indisponible pour le moment.
      </p>
    );
  if (quota === undefined) return <Skeleton className={cn('h-7 rounded-lg', className)} />;
  const taken = quotaTakenBytes(quota);
  const share = taken / quota.limitBytes;
  const text = formatQuota(quota);
  return (
    <div data-slot="quota-meter" className={cn('space-y-1.5', className)}>
      <div className="flex items-baseline justify-between gap-2 text-2xs">
        <span className="font-medium" id={labelId}>
          Espace utilisé
        </span>
        <span className="text-muted-foreground">{text}</span>
      </div>
      <meter
        aria-labelledby={labelId}
        className="sr-only"
        high={quota.limitBytes * NEARLY_FULL}
        max={quota.limitBytes}
        min={0}
        value={taken}
      >
        {text}
      </meter>
      <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full rounded-full transition-[width] motion-reduce:transition-none',
            share >= NEARLY_FULL ? 'bg-destructive' : 'bg-primary',
          )}
          style={{ width: `${Math.min(100, Math.max(share > 0 ? 2 : 0, share * 100))}%` }}
        />
      </div>
      {quota.reservedBytes > 0 ? (
        <p className="text-2xs text-muted-foreground">
          Dont {formatFileSize(quota.reservedBytes)} réservés par des envois en cours.
        </p>
      ) : null}
    </div>
  );
}
