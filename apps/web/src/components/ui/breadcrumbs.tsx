import type { ComponentProps } from 'react';

import { cn } from '@/lib/cn';

/** Styling of an ancestor link; the caller renders its own router link with it. */
export const breadcrumbLinkClassName =
  'rounded text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

/**
 * Where the page sits: `<nav aria-label="Fil d’Ariane">` over an ordered list. Compose it with
 * `BreadcrumbItem`; the last one takes `current`.
 */
export function Breadcrumbs({ children, className, ...props }: ComponentProps<'nav'>) {
  return (
    <nav aria-label="Fil d’Ariane" data-slot="breadcrumbs" className={className} {...props}>
      <ol className="flex min-w-0 flex-wrap items-center gap-y-1 text-xs">{children}</ol>
    </nav>
  );
}

interface BreadcrumbItemProps extends ComponentProps<'li'> {
  /** The page being shown: plain text with `aria-current="page"`. */
  readonly current?: boolean;
}

export function BreadcrumbItem({
  children,
  className,
  current = false,
  ...props
}: BreadcrumbItemProps) {
  return (
    <li
      data-slot="breadcrumb-item"
      className={cn('group/crumb inline-flex min-w-0 items-center', className)}
      {...props}
    >
      <span aria-hidden="true" className="mx-2 text-muted-foreground group-first/crumb:hidden">
        /
      </span>
      {current ? (
        <span aria-current="page" className="min-w-0 truncate font-medium text-foreground">
          {children}
        </span>
      ) : (
        children
      )}
    </li>
  );
}
