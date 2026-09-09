import { useCallback, useRef } from 'react';

/**
 * Restores keyboard focus to the element that opened a controlled dialog. Radix only restores
 * focus to a `DialogTrigger`; dialogs opened from application state spread these handlers on
 * their `DialogContent` instead. The opener is captured when the dialog is about to autofocus.
 */
export function useReturnFocus() {
  const opener = useRef<HTMLElement | null>(null);
  const onOpenAutoFocus = useCallback(() => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, []);
  const onCloseAutoFocus = useCallback((event: Event) => {
    event.preventDefault();
    opener.current?.focus();
  }, []);
  return { onCloseAutoFocus, onOpenAutoFocus };
}
