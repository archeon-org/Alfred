import type { ComponentProps } from 'react';

import { cn } from '@/lib/cn';

export function Badge({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      data-slot="badge"
      className={cn(
        'inline-flex min-h-6 items-center rounded-full border border-border bg-accent px-2.5 text-xs font-semibold text-accent-foreground',
        className,
      )}
      {...props}
    />
  );
}
