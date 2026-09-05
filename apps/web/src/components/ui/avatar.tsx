import type { ComponentProps } from 'react';

import { cn } from '@/lib/cn';

interface AvatarProps extends ComponentProps<'span'> {
  readonly name: string;
}

export function Avatar({ className, name, ...props }: AvatarProps) {
  const initials = name
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.at(0)?.toLocaleUpperCase('fr'))
    .join('');

  return (
    <span
      {...props}
      aria-hidden="true"
      data-slot="avatar"
      className={cn(
        'grid size-10 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-accent-foreground',
        className,
      )}
    >
      {initials || 'A'}
    </span>
  );
}
