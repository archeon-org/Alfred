import type { PropsWithChildren } from 'react';
import { Link } from 'react-router-dom';

import { AlfredMark } from '@/components/ui/alfred-mark';
import {
  SidebarAccount,
  type SidebarAccountProps,
} from '@/components/workspace/navigation/sidebar-account';
import { useCurrentWorkspaces } from '@/hooks/workspace/use-current-workspaces';
import { cn } from '@/lib/cn';

interface SidebarFrameProps extends PropsWithChildren, SidebarAccountProps {
  /** On narrow screens the account row belongs to the open navigation drawer. */
  readonly isNavigationOpen?: boolean;
}

/** Shared application identity and account foot; only navigation content varies by screen. */
export function SidebarFrame({
  children,
  isNavigationOpen = true,
  onCollapse,
  isPreviewLoading,
  onTogglePreviewLoading,
}: SidebarFrameProps) {
  const { membership, isError } = useCurrentWorkspaces();
  return (
    <aside
      aria-label="Espace personnel"
      id="workspace-navigation"
      className="theme-sidebar flex h-full min-h-0 flex-col bg-sidebar p-4 text-sidebar-foreground md:px-4.5 md:pt-7 md:pb-3"
    >
      <Link
        className="flex w-fit items-center gap-2.5 text-2xl font-semibold tracking-tight text-sidebar-foreground focus-visible:outline-2 focus-visible:outline-sidebar-ring md:px-2.5 md:text-3xl"
        to="/app"
      >
        <AlfredMark className="size-8 rounded-lg bg-sidebar-accent text-sidebar-accent-foreground md:size-9.5 md:rounded-xl" />
        <span>
          alfred<span className="text-sidebar-accent-foreground">.</span>
        </span>
      </Link>
      <div className="my-5 flex items-center gap-2.5 border-y border-sidebar-border px-2.5 py-3 text-xs">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-sidebar-border bg-sidebar-accent">
          P
        </span>
        <div className="min-w-0">
          Espace personnel
          <div className="mt-1 text-2xs text-sidebar-muted">
            {membership ? (
              <>
                <span className="block break-words">
                  <span className="sr-only">Organisation : </span>
                  {membership.tenant.name}
                </span>
                {membership.workspaces.length > 0 && (
                  <ul aria-label="Équipes" className="space-y-1">
                    {membership.workspaces.slice(0, 3).map((workspace) => (
                      <li key={workspace.id} className="break-words">
                        {workspace.name}
                      </li>
                    ))}
                  </ul>
                )}
                {isError && (
                  <span className="block" role="status">
                    Actualisation indisponible · dernières données reçues
                  </span>
                )}
                {membership.workspaces.length === 0 && <span>Aucune équipe</span>}
                {membership.workspaces.length > 3 && (
                  <details className="mt-1">
                    <summary className="cursor-pointer rounded py-1 hover:text-sidebar-foreground focus-visible:outline-2 focus-visible:outline-sidebar-ring">
                      {membership.workspaces.length - 3} autres équipes
                    </summary>
                    <ul
                      aria-label="Autres équipes"
                      className="max-h-32 space-y-1 overflow-y-auto py-1"
                    >
                      {membership.workspaces.slice(3).map((workspace) => (
                        <li key={workspace.id} className="break-words">
                          {workspace.name}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </>
            ) : isError ? (
              'Organisation et équipes indisponibles'
            ) : (
              'Chargement de l’organisation et des équipes…'
            )}
          </div>
        </div>
      </div>
      {children}
      <SidebarAccount
        className={cn('mt-auto shrink-0 pt-3 md:mt-6', !isNavigationOpen && 'max-md:hidden')}
        isPreviewLoading={isPreviewLoading}
        onCollapse={onCollapse}
        onTogglePreviewLoading={onTogglePreviewLoading}
      />
    </aside>
  );
}
