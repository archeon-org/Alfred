import type { HTMLAttributes } from 'react';

import { cn } from '../../lib/cn';

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'inline-flex min-h-6 items-center rounded-full border border-brand-200 bg-brand-50 px-2.5 text-xs font-semibold text-brand-800',
        className,
      )}
      {...props}
    />
  );
}
