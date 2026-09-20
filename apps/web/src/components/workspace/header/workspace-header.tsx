import { Menu, PanelRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import { IconButton } from '@/components/ui/icon-button';
import { useShortcutHint } from '@/hooks/workspace/use-shortcut-preferences';

export interface WorkspaceScopeLink {
  readonly name: string;
  /** Project home; omitted when the scope has no page of its own. */
  readonly href?: string;
}

interface WorkspaceHeaderProps {
  readonly scope: WorkspaceScopeLink;
  readonly contextAvailable?: boolean;
  readonly isContextOpen: boolean;
  readonly isNavigationOpen: boolean;
  readonly onToggleContext: () => void;
  readonly onToggleNavigation: () => void;
}

/**
 * The one-line bar of narrow screens: conversations drawer, current scope, context panel. Wider
 * layouts have no bar; their controls live in the panels themselves. Below md the context panel
 * is always a modal sheet, so its opener is a dialog trigger: one label, like the gutter opener,
 * and the sheet's own button closes it.
 */
export function WorkspaceHeader({
  scope,
  contextAvailable = true,
  isContextOpen,
  isNavigationOpen,
  onToggleContext,
  onToggleNavigation,
}: WorkspaceHeaderProps) {
  const contextHint = useShortcutHint('toggleContext', 'Afficher le contexte');
  return (
    <header className="flex min-h-12 shrink-0 items-center gap-1 px-2 md:hidden">
      <IconButton
        aria-controls="conversation-history"
        aria-expanded={isNavigationOpen}
        label={isNavigationOpen ? 'Masquer les conversations' : 'Afficher les conversations'}
        onClick={onToggleNavigation}
        size="icon-sm"
      >
        <Menu aria-hidden="true" size={18} />
      </IconButton>
      {scope.href ? (
        <Link
          className="min-w-0 flex-1 truncate rounded-md px-1 text-xs font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
          title="Revenir à l’accueil du projet"
          to={scope.href}
        >
          {scope.name}
        </Link>
      ) : (
        <strong className="min-w-0 flex-1 truncate px-1 text-xs font-medium text-foreground">
          {scope.name}
        </strong>
      )}
      {contextAvailable && (
        <IconButton
          aria-controls="context-panel"
          aria-expanded={isContextOpen}
          aria-haspopup="dialog"
          data-context-opener=""
          label="Afficher le contexte"
          onClick={onToggleContext}
          size="icon-sm"
          {...contextHint}
        >
          <PanelRight aria-hidden="true" size={18} />
        </IconButton>
      )}
    </header>
  );
}
