import { useCallback, useEffect, useRef } from 'react';

const POINTER_OPEN_WINDOW_MS = 500;
const FOCUSABLE = 'button, a[href], input, select, textarea, [tabindex]';

/**
 * Restores keyboard focus to the element that opened a controlled dialog. Radix only restores
 * focus to a `DialogTrigger`; dialogs opened from application state spread these handlers on
 * their `DialogContent` instead. The opener is the focused element when the dialog autofocuses,
 * or the focusable target of a pointer press that just happened (WebKit does not focus buttons
 * on click).
 */
export function useReturnFocus() {
  const opener = useRef<HTMLElement | null>(null);
  const pointerTarget = useRef<{ element: HTMLElement | null; at: number }>({
    at: Number.NEGATIVE_INFINITY,
    element: null,
  });

  useEffect(() => {
    const remember = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      pointerTarget.current = {
        at: performance.now(),
        element: target?.closest<HTMLElement>(FOCUSABLE) ?? null,
      };
    };
    document.addEventListener('pointerdown', remember, true);
    return () => document.removeEventListener('pointerdown', remember, true);
  }, []);

  const onOpenAutoFocus = useCallback(() => {
    const recentPointer =
      performance.now() - pointerTarget.current.at <= POINTER_OPEN_WINDOW_MS
        ? pointerTarget.current.element
        : null;
    const active = document.activeElement;
    opener.current =
      recentPointer ?? (active instanceof HTMLElement && active !== document.body ? active : null);
  }, []);

  const onCloseAutoFocus = useCallback((event: Event) => {
    event.preventDefault();
    opener.current?.focus();
  }, []);

  return { onCloseAutoFocus, onOpenAutoFocus };
}
