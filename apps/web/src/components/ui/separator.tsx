import type { ComponentProps } from 'react';

import { cn } from '@/lib/cn';

interface SeparatorProps extends ComponentProps<'div'> {
  readonly orientation?: 'horizontal' | 'vertical';
}

export function Separator({ className, orientation = 'horizontal', ...props }: SeparatorProps) {
  return (
    <div
      {...props}
      aria-hidden="true"
      data-slot="separator"
      data-orientation={orientation}
      className={cn(
        'shrink-0 bg-border',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className,
      )}
    />
  );
}
