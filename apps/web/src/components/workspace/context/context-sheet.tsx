import { useEffect, useRef, type ReactNode } from 'react';

import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useReturnFocus } from '@/hooks/ui/use-return-focus';

/** Marks the controls that open the context sheet: the gutter button from md, the bar button below. */
const CONTEXT_OPENER = '[data-context-opener]';

/** How long after a click on an opener the sheet's opening still counts as caused by it. */
const OPENER_CLICK_WINDOW_MS = 500;

interface ContextSheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly children: ReactNode;
}

/**
 * The context panel below the workspace breakpoint: laid over the conversation from the right
 * edge instead of stacked under it, so opening it never moves the chat. Focus goes to the panel's
 * first control and comes back to whatever opened it (gutter button, bar button or shortcut).
 * When the window crosses md while the sheet is open, the opener that was used is replaced by the
 * other one; focus then goes to the opener now on screen rather than to the main content.
 */
export function ContextSheet({ open, onClose, children }: ContextSheetProps) {
  const returnFocus = useReturnFocus();
  const openerClickedAt = useRef(Number.NEGATIVE_INFINITY);
  const openedFromOpener = useRef(false);

  useEffect(() => {
    // `click` also follows Enter and Space on a button, and fires in WebKit, which does not focus
    // a clicked button.
    const remember = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest(CONTEXT_OPENER) !== null)
        openerClickedAt.current = performance.now();
    };
    document.addEventListener('click', remember, true);
    return () => document.removeEventListener('click', remember, true);
  }, []);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent
        aria-label="Contexte de la conversation"
        className="max-md:w-full"
        onOpenAutoFocus={() => {
          returnFocus.onOpenAutoFocus();
          openedFromOpener.current =
            performance.now() - openerClickedAt.current <= OPENER_CLICK_WINDOW_MS;
        }}
        onCloseAutoFocus={(event) => {
          returnFocus.onCloseAutoFocus(event);
          const focused = document.activeElement;
          const onOpener = focused !== null && focused.closest(CONTEXT_OPENER) !== null;
          if (openedFromOpener.current && !onOpener)
            document.querySelector<HTMLElement>(CONTEXT_OPENER)?.focus();
        }}
      >
        {children}
      </SheetContent>
    </Sheet>
  );
}
