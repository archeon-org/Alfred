import { ConversationPagination } from '@/components/workspace/conversation/conversation-pagination';
import { FlaskConical, FolderPlus, Plus, Search } from 'lucide-react';
import { useId } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SidebarFrame } from '@/components/workspace/navigation/sidebar-frame';
import { ConversationNavigation } from '@/components/workspace/navigation/conversation-navigation';
import {
  ProjectNavigation,
  type ProjectNavigationProps,
} from '@/components/workspace/navigation/project-navigation';
import { HistorySkeleton } from '@/components/workspace/workspace-skeletons';
import type { Conversation, WorkspaceCreationKind } from '@/lib/workspace/workspace.types';
import { cn } from '@/lib/cn';

interface WorkspaceSidebarProps extends Omit<ProjectNavigationProps, 'onCreate' | 'isSearching'> {
  /** Recent chats already filtered by the search box. */
  readonly conversations: readonly Conversation[];
  /** Older chats exist beyond the loaded pages; the search only covers what is loaded. */
  readonly hasMoreConversations: boolean;
  readonly isLoadingMoreConversations: boolean;
  readonly conversationsError: string | null;
  readonly onRetryConversations: () => void;
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
  /** Chat whose answer is streaming right now, wherever it is listed. */
  readonly streamingConversationId?: string;
}

export function WorkspaceSidebar({
  conversationActions,
  conversations,
  streamingConversationId,
  hasMoreConversations,
  isLoadingMoreConversations,
  onLoadMoreConversations,
  onRetryConversations,
  conversationsError,
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
  const standaloneChats = conversations.filter((item) => item.projectKind === 'implicit');
  return (
    <SidebarFrame>
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
        <Button
          variant="ghost"
          size="sm"
          className="min-h-10 gap-2.5 bg-sidebar-accent px-2.5 text-2xs font-normal text-sidebar-foreground md:justify-start md:text-xs"
          onClick={(event) => onCreate('project', event.currentTarget)}
          type="button"
        >
          <FolderPlus aria-hidden="true" size={17} />
          Nouveau projet
        </Button>
      </nav>
      <div
        id="conversation-history"
        data-conversation-scroll-root
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
        {isSearching ? (
          <p className="mb-3 px-2 text-2xs text-sidebar-muted">
            Recherche parmi les conversations chargées. Effacez la recherche pour parcourir la
            suite.
          </p>
        ) : null}
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
                  Aucun chat libre trouvé
                </p>
              ) : null}
              <ProjectNavigation
                conversationActions={conversationActions}
                {...projectNavigation}
                search={search}
                isSearching={isSearching}
                onCreate={(trigger) => onCreate('project', trigger)}
                onSelectConversation={onSelectConversation}
                selectedConversationId={selectedConversationId}
                selectedProjectId={selectedProjectId}
                streamingConversationId={streamingConversationId}
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
                  streamingId={streamingConversationId}
                  onSelect={onSelectConversation}
                />
                <ConversationPagination
                  hasMore={hasMoreConversations}
                  isLoadingMore={isLoadingMoreConversations}
                  error={conversationsError}
                  onLoadMore={onLoadMoreConversations}
                  onRetry={onRetryConversations}
                  paused={isSearching}
                />
                <p className="mt-2 px-2 text-2xs text-sidebar-muted">
                  Conversations hors projet, chacune dans son espace privé.
                </p>
              </section>
            </>
          )}
        </div>
      </div>
    </SidebarFrame>
  );
}
