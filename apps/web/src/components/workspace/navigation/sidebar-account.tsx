import { ChevronsUpDown, LogOut, PanelLeftClose, Settings, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { IconButton } from '@/components/ui/icon-button';
import { useSession } from '@/hooks/auth/use-session';
import { cn } from '@/lib/cn';

export interface SidebarAccountProps {
  /** Collapses the navigation column; absent where the column cannot collapse (settings). */
  readonly onCollapse?: () => void;
  /** Skeleton preview of the workspace, a development aid kept out of the chat chrome. */
  readonly isPreviewLoading?: boolean;
  readonly onTogglePreviewLoading?: () => void;
  readonly className?: string;
}

/**
 * The signed-in identity at the foot of the sidebar. The name opens the account menu (settings,
 * preview, sign out); the panel control beside it folds the navigation away.
 */
export function SidebarAccount({
  onCollapse,
  isPreviewLoading = false,
  onTogglePreviewLoading,
  className,
}: SidebarAccountProps) {
  const { logout, user } = useSession();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    setLogoutError(null);
    try {
      await logout();
    } catch {
      setLogoutError('Déconnexion impossible. Votre session reste active.');
    } finally {
      setIsLoggingOut(false);
    }
  };

  if (!user) return null;
  return (
    <div className={cn('border-t border-sidebar-border pt-2', className)}>
      {logoutError ? (
        <p
          className="mb-2 rounded-lg border border-destructive/40 bg-destructive/15 px-3 py-2 text-xs text-sidebar-foreground"
          role="alert"
        >
          {logoutError}
        </p>
      ) : null}
      <div className="flex items-center gap-1">
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              className="h-auto min-h-11 min-w-0 flex-1 justify-start gap-2.5 rounded-lg px-2 text-left font-normal text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-sidebar-ring focus-visible:ring-offset-sidebar data-[state=open]:bg-sidebar-accent"
              variant="ghost"
            >
              <Avatar
                className="size-8 bg-sidebar-primary text-2xs text-sidebar-primary-foreground"
                name={user.displayName}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">{user.displayName}</span>
                <span className="block truncate text-2xs font-normal text-sidebar-muted">
                  {user.email}
                </span>
              </span>
              <ChevronsUpDown
                aria-hidden="true"
                className="shrink-0 text-sidebar-muted"
                size={14}
              />
              <span className="sr-only">Ouvrir le menu du compte</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-60" side="top" sideOffset={8}>
            <DropdownMenuLabel>
              <span className="block truncate font-medium text-foreground">{user.displayName}</span>
              <span className="block truncate">{user.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/app/settings">
                <Settings aria-hidden="true" />
                Paramètres
              </Link>
            </DropdownMenuItem>
            {onTogglePreviewLoading ? (
              <DropdownMenuCheckboxItem
                checked={isPreviewLoading}
                onCheckedChange={() => onTogglePreviewLoading()}
              >
                <SlidersHorizontal aria-hidden="true" />
                Aperçu du chargement
              </DropdownMenuCheckboxItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={isLoggingOut}
              onSelect={() => void handleLogout()}
              variant="destructive"
            >
              <LogOut aria-hidden="true" />
              Se déconnecter
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {onCollapse ? (
          <IconButton
            aria-controls="workspace-navigation"
            aria-expanded
            className="hidden shrink-0 text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-sidebar-ring md:inline-flex"
            label="Masquer la navigation"
            onClick={onCollapse}
            size="icon-sm"
          >
            <PanelLeftClose aria-hidden="true" size={16} />
          </IconButton>
        ) : null}
      </div>
    </div>
  );
}
