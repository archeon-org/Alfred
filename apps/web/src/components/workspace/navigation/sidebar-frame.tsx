import type { PropsWithChildren } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AlfredMark } from '@/components/ui/alfred-mark';

/** Shared application identity and fixed footer; only navigation content varies by screen. */
export function SidebarFrame({ children }: PropsWithChildren) {
  return (
    <aside
      aria-label="Espace personnel"
      id="workspace-navigation"
      className="theme-sidebar flex h-full min-h-0 flex-col bg-sidebar p-4 text-sidebar-foreground md:px-4.5 md:pt-7"
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
      <div className="my-5 hidden items-center gap-2.5 border-y border-sidebar-border px-2.5 py-3 text-xs md:flex">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-sidebar-border bg-sidebar-accent">
          P
        </span>
        <span>
          Espace personnel
          <small className="mt-1 block text-2xs text-sidebar-muted">
            Votre espace de réflexion
          </small>
        </span>
      </div>
      {children}
      <footer className="hidden shrink-0 px-2.5 pt-6 md:block">
        <ArrowUpRight
          aria-hidden="true"
          className="mb-2 text-sidebar-accent-foreground"
          size={17}
        />
        <p className="text-2xs text-sidebar-foreground">De l’idée à l’essentiel.</p>
        <div className="mt-4 flex justify-between border-t border-sidebar-border pt-3 text-2xs text-sidebar-muted">
          <span>Alfred · Workspace</span>
          <span>Espace personnel</span>
        </div>
      </footer>
    </aside>
  );
}
