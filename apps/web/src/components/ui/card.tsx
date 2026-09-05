import type { ComponentProps } from 'react';

import { cn } from '@/lib/cn';

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card"
      className={cn(
        'rounded-2xl border border-border bg-card text-card-foreground shadow-soft',
        className,
      )}
      {...props}
    />
  );
}
