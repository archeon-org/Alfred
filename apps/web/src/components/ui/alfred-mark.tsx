import type { ComponentProps } from 'react';

import { cn } from '@/lib/cn';

export function AlfredMark({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      {...props}
      aria-hidden="true"
      data-slot="alfred-mark"
      className={cn(
        'inline-grid size-9.5 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground [&_svg]:size-7',
        className,
      )}
    >
      <svg fill="none" viewBox="0 0 32 32">
        <path
          d="M7 24 15 7h3l7 17M10 19h12M16 10v14"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
        <path d="m23 5 .9 2.1L26 8l-2.1.9L23 11l-.9-2.1L20 8l2.1-.9L23 5Z" fill="currentColor" />
      </svg>
    </span>
  );
}
