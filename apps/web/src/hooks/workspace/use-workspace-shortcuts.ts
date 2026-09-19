import { useEffect, useRef } from 'react';

import { useShortcutPreferences } from '@/hooks/workspace/use-shortcut-preferences';
import { matchShortcut, type ShortcutAction } from '@/lib/workspace/keyboard-shortcuts';

export type ShortcutHandlers = Partial<Record<ShortcutAction, () => void>>;

/**
 * Listens for the workspace shortcuts on the window with the person's current bindings. Modifier
 * combinations are safe inside text fields, so nothing is filtered on focus; a matched shortcut
 * is consumed before the browser acts.
 */
export function useWorkspaceShortcuts(handlers: ShortcutHandlers): void {
  const { apple, bindings } = useShortcutPreferences();
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const action = matchShortcut(event, apple, bindings);
      if (action === null) return;
      const handle = latest.current[action];
      if (handle === undefined) return;
      event.preventDefault();
      handle();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [apple, bindings]);
}
