import { Folder, FolderOpen } from 'lucide-react';

import type { ConversationActionHandlers } from '@/components/workspace/conversation/conversation-action-menu';
import { Button } from '@/components/ui/button';
import { ConversationNavigation } from '@/components/workspace/navigation/conversation-navigation';
import {
  ProjectActionMenu,
  type ProjectActionHandlers,
} from '@/components/workspace/project/project-action-menu';
import { cn } from '@/lib/cn';
import type { Conversation, Project } from '@/lib/workspace/workspace.types';

export interface ProjectNavigationItemProps {
  readonly project: Project;
  readonly conversationActions: ConversationActionHandlers;
  readonly conversations: readonly Conversation[];
  readonly panelId: string;
  readonly isSelected: boolean;
  readonly isExpanded: boolean;
  readonly isSearching: boolean;
  readonly selectedConversationId: string | undefined;
  /** Opens the project home; when already there, toggles the chat list instead. */
  readonly onSelect: (project: Project) => void;
  readonly onSelectConversation: (id: string) => void;
  readonly onHome: (project: Project) => void;
  readonly actions: ProjectActionHandlers;
}

/** One project row: folder, name, its "⋯" menu and, when expanded, its chats. */
export function ProjectNavigationItem({
  actions,
  conversationActions,
  conversations,
  isExpanded,
  isSearching,
  isSelected,
  onHome,
  onSelect,
  onSelectConversation,
  panelId,
  project,
  selectedConversationId,
}: ProjectNavigationItemProps) {
  const name = project.name ?? 'Projet';
  const Icon = isExpanded ? FolderOpen : Folder;
  return (
    <div role="group" aria-label={name}>
      <div
        className={cn(
          'group/project flex items-center rounded-lg pr-0.5 transition-colors hover:bg-sidebar-accent has-[[data-state=open]]:bg-sidebar-accent motion-reduce:transition-none',
          isSelected && 'bg-sidebar-accent text-sidebar-accent-foreground',
        )}
      >
        <Button
          variant="ghost"
          aria-controls={panelId}
          aria-current={isSelected ? 'true' : undefined}
          aria-expanded={isExpanded}
          className={cn(
            'flex h-auto min-h-8 min-w-0 flex-1 items-center justify-start gap-2 rounded-lg px-2 py-1 text-left text-xs font-medium whitespace-normal text-sidebar-foreground hover:bg-transparent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sidebar-ring group-data-[density=compact]/workspace:min-h-7',
            isSelected && 'text-sidebar-accent-foreground',
          )}
          onClick={() => onSelect(project)}
          type="button"
        >
          <Icon aria-hidden="true" className="shrink-0 text-sidebar-accent-foreground" size={15} />
          <span className="min-w-0 flex-1 wrap-anywhere">{name}</span>
        </Button>
        <ProjectActionMenu
          className="size-7 min-h-7 shrink-0 text-sidebar-muted opacity-70 hover:bg-transparent hover:text-sidebar-foreground focus-visible:opacity-100 focus-visible:-outline-offset-2 group-hover/project:opacity-100 data-[state=open]:opacity-100 data-[state=open]:text-sidebar-foreground"
          onDelete={actions.onDelete}
          onHome={onHome}
          onRename={actions.onRename}
          onTogglePin={actions.onTogglePin}
          project={project}
        />
      </div>
      <div
        className="mt-0.5 ml-3.5 border-l border-sidebar-border pl-1.5"
        hidden={!isExpanded}
        id={panelId}
      >
        {conversations.length > 0 ? (
          <ConversationNavigation
            conversationActions={conversationActions}
            compact
            conversations={conversations}
            onSelect={onSelectConversation}
            selectedId={selectedConversationId}
          />
        ) : (
          <p className="px-2 py-2 text-2xs leading-relaxed text-sidebar-muted">
            {isSearching ? 'Aucun résultat dans ce projet.' : 'Aucun chat pour le moment.'}
          </p>
        )}
      </div>
    </div>
  );
}
