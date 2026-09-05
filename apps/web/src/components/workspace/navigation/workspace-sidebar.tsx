import { ArrowUpRight, FlaskConical, MessageSquareText, Plus, Search } from 'lucide-react';
import { useId } from 'react';
import { Link } from 'react-router-dom';

import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlfredMark } from '@/components/ui/alfred-mark';
import { ConversationNavigation } from '@/components/workspace/navigation/conversation-navigation';
import { ProjectNavigation } from '@/components/workspace/navigation/project-navigation';
import { HistorySkeleton } from '@/components/workspace/workspace-skeletons';
import type {
  ConversationView,
  WorkspaceCreationKind,
  ProjectView,
} from '@/lib/workspace/workspace.types';
import { cn } from '@/lib/cn';

interface WorkspaceSidebarProps {
  readonly conversations: readonly ConversationView[];
  readonly projects: readonly ProjectView[];
  readonly selectedProjectId: string | undefined;
  readonly selectedId: string | undefined;
  readonly search: string;
  readonly isLoading: boolean;
  readonly isNavigationOpen: boolean;
  readonly onSearch: (value: string) => void;
  readonly onSelect: (id: string) => void;
  readonly onSelectProject: (id: string) => void;
  readonly onCreate: (kind: WorkspaceCreationKind, trigger: HTMLButtonElement) => void;
}

export function WorkspaceSidebar({
  conversations,
  projects,
  selectedProjectId,
  selectedId,
  search,
  isLoading,
  isNavigationOpen,
  onSearch,
  onSelect,
  onSelectProject,
  onCreate,
}: WorkspaceSidebarProps) {
  const searchId = useId();
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
      <nav
        aria-label="Navigation principale"
        className="mt-4 grid grid-cols-2 gap-3 md:mt-0 md:grid-cols-1"
      >
        <Button
          className="h-auto rounded-lg border border-sidebar-primary px-2 py-3 text-2xs whitespace-normal md:text-xs"
          onClick={(event) => onCreate('conversation', event.currentTarget)}
          type="button"
        >
          <Plus aria-hidden="true" size={17} />
          Nouvelle conversation
        </Button>
        <a
          className={cn(
            buttonVariants({ variant: 'ghost', size: 'sm' }),
            'min-h-10 gap-2.5 bg-sidebar-accent px-2.5 text-2xs font-normal text-sidebar-foreground md:justify-start md:text-xs',
          )}
          href="#conversation"
        >
          <MessageSquareText aria-hidden="true" size={17} />
          Conversations
          <span className="text-2xs text-sidebar-muted md:ml-auto">{conversations.length}</span>
        </a>
      </nav>
      <div
        id="conversation-history"
        className={cn(
          'mt-5 min-h-0 flex-1 overflow-y-auto [scrollbar-color:var(--sidebar-border)_transparent] [scrollbar-width:thin]',
          !isNavigationOpen && 'max-md:hidden',
        )}
      >
        <label
          htmlFor={searchId}
          className="mb-5 flex min-h-10 items-center gap-2 rounded-lg border border-sidebar-border px-2.5 text-sidebar-muted focus-within:border-sidebar-ring"
        >
          <Search aria-hidden="true" size={15} />
          <Input
            id={searchId}
            aria-label="Rechercher une conversation"
            className="min-w-0 flex-1 border-0 bg-transparent px-0 text-xs text-sidebar-foreground shadow-none placeholder:text-sidebar-muted focus-visible:ring-0"
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Rechercher…"
            type="search"
            value={search}
          />
        </label>
        <div aria-busy={isLoading}>
          {isLoading ? (
            <HistorySkeleton />
          ) : (
            <>
              {conversations.length === 0 && search.trim() ? (
                <p className="px-2.5 pb-3 text-xs text-sidebar-foreground">
                  Aucune conversation trouvée
                </p>
              ) : null}
              <ProjectNavigation
                projects={projects}
                conversations={conversations}
                selectedProjectId={selectedProjectId}
                selectedId={selectedId}
                onSelectProject={onSelectProject}
                onSelectConversation={onSelect}
                onCreate={(trigger) => onCreate('project', trigger)}
                isSearching={Boolean(search.trim())}
              />
              <section role="group" aria-label="Sandboxes" className="mt-7">
                <div className="mb-2 flex items-center justify-between pl-2.5">
                  <h2 className="flex items-center gap-2 text-2xs font-semibold tracking-widest text-sidebar-muted uppercase">
                    <FlaskConical aria-hidden="true" size={13} />
                    Sandbox
                  </h2>
                  <Button
                    variant="ghost"
                    aria-label="Créer une sandbox"
                    size="icon-sm"
                    onClick={(event) => onCreate('sandbox', event.currentTarget)}
                    type="button"
                  >
                    <Plus aria-hidden="true" size={15} />
                  </Button>
                </div>
                <ConversationNavigation
                  conversations={conversations.filter((item) => !item.projectId)}
                  selectedId={selectedId}
                  onSelect={onSelect}
                />
                <p className="mt-2 px-2.5 text-2xs text-sidebar-muted">
                  Conversations libres, hors projet.
                </p>
              </section>
            </>
          )}
        </div>
      </div>
      <footer className="hidden shrink-0 px-2.5 pt-6 md:block">
        <ArrowUpRight
          aria-hidden="true"
          className="mb-2 text-sidebar-accent-foreground"
          size={17}
        />
        <p className="text-2xs text-sidebar-foreground">De l’idée à l’essentiel.</p>
        <div className="mt-4 flex justify-between border-t border-sidebar-border pt-3 text-2xs text-sidebar-muted">
          <span>Alfred · Workspace</span>
          <span>Aperçu local</span>
        </div>
      </footer>
    </aside>
  );
}
