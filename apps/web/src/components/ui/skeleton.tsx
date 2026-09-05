import type { ComponentProps } from 'react';

import { cn } from '@/lib/cn';

export function Skeleton({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      {...props}
      aria-hidden="true"
      data-slot="skeleton"
      className={cn(
        'block h-3.5 animate-pulse rounded-md bg-muted motion-reduce:animate-none',
        className,
      )}
    />
  );
}
