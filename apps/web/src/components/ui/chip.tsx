import { X } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';

import { IconButton } from '@/components/ui/icon-button';
import { cn } from '@/lib/cn';

/** A wrapping list of chips; give it an accessible name (`aria-label`). */
export function ChipList({ className, ...props }: ComponentProps<'ul'>) {
  return (
    <ul
      data-slot="chip-list"
      className={cn('flex min-w-0 flex-wrap gap-2', className)}
      {...props}
    />
  );
}

interface ChipProps extends Omit<ComponentProps<'li'>, 'children'> {
  readonly label: string;
  readonly icon?: ReactNode;
  /** Short state text beside the label, such as « Envoi… ». */
  readonly status?: ReactNode;
  /** `busy` while work is in progress, `danger` for a failure the person must act on. */
  readonly tone?: 'default' | 'busy' | 'danger';
  /** Accessible name of the remove button; without it the chip cannot be removed. */
  readonly removeLabel?: string;
  readonly onRemove?: () => void;
  /** Other actions of the chip (retry); rendered before the remove button. */
  readonly children?: ReactNode;
}

/**
 * A labelled token with an optional state and its own remove button: a composer attachment, an
 * active filter. The label is text, never a control, so that the remove button is never nested
 * in another button. The button looks compact and keeps a 44 px touch target.
 */
export function Chip({
  children,
  className,
  icon,
  label,
  onRemove,
  removeLabel,
  status,
  tone = 'default',
  ...props
}: ChipProps) {
  return (
    <li
      data-slot="chip"
      data-tone={tone}
      className={cn(
        'inline-flex min-h-8 max-w-full min-w-0 items-center gap-1.5 rounded-full border border-border bg-muted/60 py-0.5 pr-1 pl-2.5 text-xs text-foreground',
        tone === 'danger' && 'border-destructive/40 bg-destructive/5',
        removeLabel === undefined && 'pr-2.5',
        className,
      )}
      {...props}
    >
      {icon}
      <span className="min-w-0 truncate font-medium" title={label}>
        {label}
      </span>
      {status ? (
        <span
          className={cn(
            'shrink-0 text-2xs text-muted-foreground',
            tone === 'danger' && 'text-destructive',
          )}
        >
          {status}
        </span>
      ) : null}
      {children}
      {removeLabel !== undefined && onRemove !== undefined ? (
        <IconButton
          className="relative size-6 shrink-0 rounded-full after:absolute after:-inset-2.5"
          label={removeLabel}
          onClick={onRemove}
          size="icon-sm"
        >
          <X aria-hidden="true" size={14} />
        </IconButton>
      ) : null}
    </li>
  );
}
