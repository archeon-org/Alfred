import * as DialogPrimitive from '@radix-ui/react-dialog';
import type { ComponentProps } from 'react';

import { DialogOverlay, DialogPortal } from '@/components/ui/dialog';
import { cn } from '@/lib/cn';

/**
 * A panel laid over the page from the right edge. It is a modal Radix dialog: focus moves inside
 * and stays there, Escape or a click on the backdrop closes it, and the page behind is inert.
 * Give the content an accessible name (`aria-label` or `aria-labelledby`).
 */
function Sheet({ ...props }: ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetContent({
  className,
  children,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPortal data-slot="sheet-portal">
      {/* The dialogs' own backdrop. Enter transitions only (`@starting-style`): closing is
          immediate, never delayed. */}
      <DialogOverlay
        data-slot="sheet-overlay"
        className="transition-opacity duration-200 starting:opacity-0 motion-reduce:transition-none"
      />
      <DialogPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex w-88 max-w-[calc(100%-2.5rem)] flex-col overflow-hidden border-l border-border bg-background text-foreground shadow-panel outline-none transition-[translate] duration-200 ease-out starting:translate-x-full motion-reduce:transition-none',
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

export { Sheet, SheetContent };
