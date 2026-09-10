import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

/** Native radio semantics and keyboard navigation for visually composed choice cards. */
export function RadioInput({ className, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  return (
    <input
      data-slot="radio-input"
      type="radio"
      className={cn('peer absolute inset-0 z-10 size-full cursor-pointer opacity-0', className)}
      {...props}
    />
  );
}
