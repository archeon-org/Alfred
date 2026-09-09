import {
  Columns2,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRight,
  SlidersHorizontal,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { WorkspaceAccount } from '@/components/workspace/header/workspace-account';
import { Separator } from '@/components/ui/separator';
import { IconButton } from '@/components/ui/icon-button';
import { WorkspaceSettings } from '@/components/workspace/header/workspace-settings';
import type { WorkspacePreferences } from '@/lib/workspace/workspace-preferences.types';

export interface WorkspaceScopeLink {
  readonly name: string;
  /** Project home; omitted when the scope has no page of its own. */
  readonly href?: string;
}

interface WorkspaceHeaderProps {
  readonly scope: WorkspaceScopeLink;
  readonly isLoading: boolean;
  readonly isContextOpen: boolean;
  readonly isNavigationOpen: boolean;
  readonly isSidebarOpen: boolean;
  readonly onToggleSidebar: () => void;
  readonly onToggleLoading: () => void;
  readonly onToggleContext: () => void;
  readonly onToggleNavigation: () => void;
  readonly preferences: WorkspacePreferences;
}

export function WorkspaceHeader({
  scope,
  isLoading,
  isContextOpen,
  isNavigationOpen,
  isSidebarOpen,
  onToggleSidebar,
  onToggleLoading,
  onToggleContext,
  onToggleNavigation,
  preferences,
}: WorkspaceHeaderProps) {
  const SidebarIcon = isSidebarOpen ? PanelLeftClose : PanelLeftOpen;
  return (
    <header className="flex min-h-16 shrink-0 items-center justify-between gap-2 px-3 md:min-h-18 md:px-5 workspace:min-h-19 workspace:px-6">
      <div className="hidden min-w-0 items-center gap-2 md:flex">
        <IconButton
          aria-controls="workspace-navigation"
          aria-expanded={isSidebarOpen}
          label={isSidebarOpen ? 'Masquer la navigation' : 'Afficher la navigation'}
          onClick={onToggleSidebar}
        >
          <SidebarIcon aria-hidden="true" size={17} />
        </IconButton>
        <Columns2
          aria-hidden="true"
          className="hidden shrink-0 text-muted-foreground min-[87.5rem]:block"
          size={15}
        />
        <span className="hidden text-2xs whitespace-nowrap text-muted-foreground min-[96.875rem]:inline">
          Espace de travail /
        </span>
        {scope.href ? (
          <Link
            className="min-w-0 truncate rounded-md px-1 text-2xs font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
            title="Revenir à l’accueil du projet"
            to={scope.href}
          >
            {scope.name}
          </Link>
        ) : (
          <strong className="min-w-0 truncate text-2xs font-medium text-foreground">
            {scope.name}
          </strong>
        )}
      </div>
      <div className="flex w-full items-center justify-end gap-0.5 md:w-auto">
        <IconButton
          className="md:hidden"
          aria-controls="conversation-history"
          aria-expanded={isNavigationOpen}
          label={isNavigationOpen ? 'Masquer les conversations' : 'Afficher les conversations'}
          onClick={onToggleNavigation}
        >
          <Menu aria-hidden="true" size={18} />
        </IconButton>
        <IconButton
          label="Aperçu du chargement"
          aria-pressed={isLoading}
          className="size-9 min-h-9 aria-pressed:bg-accent"
          onClick={onToggleLoading}
        >
          <SlidersHorizontal aria-hidden="true" size={16} />
        </IconButton>
        <WorkspaceSettings preferences={preferences} />
        <IconButton
          label={isContextOpen ? 'Masquer le contexte' : 'Afficher le contexte'}
          aria-controls="context-panel"
          aria-expanded={isContextOpen}
          className="size-9 min-h-9"
          onClick={onToggleContext}
        >
          <PanelRight aria-hidden="true" size={18} />
        </IconButton>
        <Separator orientation="vertical" className="mx-1 h-5" />
        <WorkspaceAccount />
      </div>
    </header>
  );
}
