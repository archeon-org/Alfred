import { useState } from 'react';
import { useLocation } from 'react-router-dom';

import { useDesktopWorkspace } from '@/hooks/workspace/use-desktop-workspace';

/** The docked panel's state, which follows the "open the context by default" preference. */
interface DockedContext {
  readonly isOpen: boolean;
  readonly toggle: () => void;
}

export interface ContextPanelControls {
  /** Docked beside the chat from the workspace breakpoint; laid over it as a sheet below. */
  readonly isDocked: boolean;
  readonly isOpen: boolean;
  readonly toggle: () => void;
  readonly close: () => void;
}

/**
 * Where the context panel lives and whether it shows. From the workspace breakpoint it is a
 * resizable column that keeps the preference-driven state. Below it, it is an overlay sheet that
 * starts closed, and folds again whenever the layout crosses the breakpoint or the page changes,
 * so the conversation always keeps the screen until the person asks for the context.
 */
export function useContextPanel(docked: DockedContext): ContextPanelControls {
  const isDocked = useDesktopWorkspace();
  const { pathname } = useLocation();
  const [sheet, setSheet] = useState({ isDocked, open: false, pathname });
  const current = sheet.isDocked === isDocked && sheet.pathname === pathname;
  if (!current) setSheet({ isDocked, open: false, pathname });

  if (isDocked) {
    return {
      isDocked,
      isOpen: docked.isOpen,
      toggle: docked.toggle,
      close: () => {
        if (docked.isOpen) docked.toggle();
      },
    };
  }
  const isOpen = current && sheet.open;
  return {
    isDocked,
    isOpen,
    toggle: () => setSheet({ isDocked, open: !isOpen, pathname }),
    close: () => setSheet({ isDocked, open: false, pathname }),
  };
}
