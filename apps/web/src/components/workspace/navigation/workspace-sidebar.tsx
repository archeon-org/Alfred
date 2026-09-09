import { ArrowUpRight, FlaskConical, MessageSquareText, Plus, Search } from 'lucide-react';
import { useId } from 'react';
import { Link } from 'react-router-dom';

import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlfredMark } from '@/components/ui/alfred-mark';
import { ConversationNavigation } from '@/components/workspace/navigation/conversation-navigation';
import {
  ProjectNavigation,
  type ProjectNavigationProps,
} from '@/components/workspace/navigation/project-navigation';
import { HistorySkeleton } from '@/components/workspace/workspace-skeletons';
import type { Conversation, WorkspaceCreationKind } from '@/lib/workspace/workspace.types';
import { cn } from '@/lib/cn';

interface WorkspaceSidebarProps extends Omit<
  ProjectNavigationProps,
  'conversations' | 'onCreate' | 'isSearching'
> {
  /** Recent chats already filtered by the search box. */
  readonly conversations: readonly Conversation[];
  /** Older chats exist beyond the loaded pages; the search only covers what is loaded. */
  readonly hasMoreConversations: boolean;
  readonly isLoadingMoreConversations: boolean;
  readonly onLoadMoreConversations: () => void;
  readonly search: string;
  readonly isLoading: boolean;
  readonly isNavigationOpen: boolean;
  readonly loadError: string | null;
  /** Transient message, for example a failed pin; announced as an alert. */
  readonly notice?: string | null;
  readonly onRetry: () => void;
  readonly onSearch: (value: string) => void;
  readonly onCreate: (kind: WorkspaceCreationKind, trigger: HTMLButtonElement) => void;
}

export function WorkspaceSidebar({
  conversationActions,
  conversations,
  hasMoreConversations,
  isLoadingMoreConversations,
  onLoadMoreConversations,
  search,
  isLoading,
  isNavigationOpen,
  loadError,
  notice,
  onRetry,
  onSearch,
  onCreate,
  onSelectConversation,
  selectedProjectId,
  selectedConversationId,
  ...projectNavigation
}: WorkspaceSidebarProps) {
  const searchId = useId();
  const isSearching = Boolean(search.trim());
  const projectChats = conversations.filter((item) => item.projectKind === 'named');
  const standaloneChats = conversations.filter((item) => item.projectKind === 'implicit');
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
          onClick={(event) =>
            onCreate(
              selectedProjectId === undefined ? 'sandbox' : 'conversation',
              event.currentTarget,
            )
          }
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
          className="mb-4 flex min-h-10 items-center gap-2 rounded-lg border border-sidebar-border px-2.5 text-sidebar-muted focus-within:border-sidebar-ring"
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
        {notice ? (
          <p
            className="mb-3 rounded-lg border border-sidebar-border bg-sidebar-accent px-2.5 py-2 text-2xs text-sidebar-foreground"
            role="alert"
          >
            {notice}
          </p>
        ) : null}
        <div aria-busy={isLoading}>
          {isLoading ? (
            <HistorySkeleton />
          ) : loadError ? (
            <div className="px-2.5 pb-3 text-xs" role="alert">
              <p className="text-sidebar-foreground">{loadError}</p>
              <Button
                className="mt-3 border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent"
                onClick={onRetry}
                size="sm"
                variant="outline"
              >
                Réessayer
              </Button>
            </div>
          ) : (
            <>
              {conversations.length === 0 && isSearching ? (
                <p className="px-2.5 pb-3 text-xs text-sidebar-foreground">
                  Aucune conversation trouvée
                </p>
              ) : null}
              <ProjectNavigation
                conversationActions={conversationActions}
                {...projectNavigation}
                conversations={projectChats}
                isSearching={isSearching}
                onCreate={(trigger) => onCreate('project', trigger)}
                onSelectConversation={onSelectConversation}
                selectedConversationId={selectedConversationId}
                selectedProjectId={selectedProjectId}
              />
              <section role="group" aria-label="Chats libres" className="mt-6">
                <div className="mb-1.5 flex min-h-8 items-center justify-between pl-2">
                  <h2 className="flex items-center gap-1.5 text-2xs font-semibold tracking-widest text-sidebar-muted uppercase">
                    <FlaskConical aria-hidden="true" size={12} />
                    Chats libres
                  </h2>
                  <Button
                    variant="ghost"
                    aria-label="Ouvrir un chat libre"
                    className="size-7 min-h-7 text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    size="icon-sm"
                    onClick={(event) => onCreate('sandbox', event.currentTarget)}
                    type="button"
                  >
                    <Plus aria-hidden="true" size={15} />
                  </Button>
                </div>
                <ConversationNavigation
                  conversationActions={conversationActions}
                  compact
                  conversations={standaloneChats}
                  selectedId={selectedConversationId}
                  onSelect={onSelectConversation}
                />
                <p className="mt-2 px-2 text-2xs text-sidebar-muted">
                  Conversations hors projet, chacune dans son espace privé.
                </p>
              </section>
              {hasMoreConversations ? (
                <Button
                  aria-busy={isLoadingMoreConversations}
                  className="mt-4 h-8 min-h-8 w-full justify-start px-2 text-2xs font-normal text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  disabled={isLoadingMoreConversations}
                  onClick={onLoadMoreConversations}
                  size="sm"
                  variant="ghost"
                >
                  Afficher plus de conversations
                </Button>
              ) : null}
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
          <span>Espace personnel</span>
        </div>
      </footer>
    </aside>
  );
}
