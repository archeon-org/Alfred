import { useCallback, useEffect, useRef } from 'react';

const INTERACTION_OPEN_WINDOW_MS = 500;
const FOCUSABLE = 'button, a[href], input, select, textarea, [tabindex]';

/** Menu items unmount when a dialog opens; retain the persistent menu trigger instead. */
function dialogOpener(element: HTMLElement | null): HTMLElement | null {
  const menu = element?.closest('[role="menu"]');
  const triggerId = menu?.getAttribute('aria-labelledby');
  return triggerId ? (document.getElementById(triggerId) ?? element) : element;
}

/**
 * Restores keyboard focus to the element that opened a controlled dialog. Radix only restores
 * focus to a `DialogTrigger`; dialogs opened from application state spread these handlers on
 * their `DialogContent` instead. The opener is the focused element when the dialog autofocuses,
 * or the focusable target of the latest pointer or keyboard interaction (WebKit does not focus buttons
 * on click).
 */
export function useReturnFocus() {
  const opener = useRef<HTMLElement | null>(null);
  const interactionTarget = useRef<{ element: HTMLElement | null; at: number }>({
    at: Number.NEGATIVE_INFINITY,
    element: null,
  });

  useEffect(() => {
    const remember = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      interactionTarget.current = {
        at: performance.now(),
        element: dialogOpener(target?.closest<HTMLElement>(FOCUSABLE) ?? null),
      };
    };
    document.addEventListener('pointerdown', remember, true);
    document.addEventListener('keydown', remember, true);
    return () => {
      document.removeEventListener('pointerdown', remember, true);
      document.removeEventListener('keydown', remember, true);
    };
  }, []);

  const onOpenAutoFocus = useCallback(() => {
    const recentInteraction =
      performance.now() - interactionTarget.current.at <= INTERACTION_OPEN_WINDOW_MS
        ? interactionTarget.current.element
        : null;
    const active = document.activeElement;
    opener.current =
      recentInteraction ??
      dialogOpener(active instanceof HTMLElement && active !== document.body ? active : null);
  }, []);

  const onCloseAutoFocus = useCallback((event: Event) => {
    event.preventDefault();
    if (opener.current?.isConnected) opener.current.focus();
    else document.getElementById('main-content')?.focus();
  }, []);

  return { onCloseAutoFocus, onOpenAutoFocus };
}
