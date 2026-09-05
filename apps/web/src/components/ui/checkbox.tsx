import type { ComponentProps } from 'react';

import { cn } from '@/lib/cn';

// Native adaptation of the shadcn checkbox: keeps keyboard/form semantics without
// adding another primitive dependency. Labels provide the larger click target.
export function Checkbox({ className, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  return (
    <input
      {...props}
      type="checkbox"
      data-slot="checkbox"
      className={cn(
        'size-4 shrink-0 rounded border border-input accent-primary shadow-xs transition-shadow outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:outline-destructive motion-reduce:transition-none',
        className,
      )}
    />
  );
}
