import type { ComponentProps } from 'react';

import { cn } from '@/lib/cn';

/** Native single-choice control with shared focus and disabled feedback. */
export function Radio({ className, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  return (
    <input
      {...props}
      type="radio"
      data-slot="radio"
      className={cn(
        'size-4 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
    />
  );
}
