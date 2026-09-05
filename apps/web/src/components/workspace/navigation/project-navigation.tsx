import { ChevronRight, Folder, FolderOpen, Plus } from 'lucide-react';
import { useId, useState } from 'react';

import { ConversationNavigation } from '@/components/workspace/navigation/conversation-navigation';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import type { ConversationView, ProjectView } from '@/lib/workspace/workspace.types';

interface ProjectNavigationProps {
  readonly projects: readonly ProjectView[];
  readonly conversations: readonly ConversationView[];
  readonly selectedProjectId: string | undefined;
  readonly selectedId: string | undefined;
  readonly onSelectProject: (id: string) => void;
  readonly onSelectConversation: (id: string) => void;
  readonly onCreate: (trigger: HTMLButtonElement) => void;
  readonly isSearching: boolean;
}

export function ProjectNavigation({
  projects,
  conversations,
  selectedProjectId,
  selectedId,
  onSelectProject,
  onSelectConversation,
  onCreate,
  isSearching,
}: ProjectNavigationProps) {
  const id = useId();
  const [collapsedProjectId, setCollapsedProjectId] = useState<string | null>(null);
  return (
    <section aria-labelledby={`${id}-title`}>
      <div className="mb-3 flex items-center justify-between pl-2.5">
        <h2
          className="text-2xs font-semibold tracking-widest text-sidebar-muted uppercase"
          id={`${id}-title`}
        >
          Projets
        </h2>
        <Button
          variant="ghost"
          aria-label="Créer un projet"
          size="icon-sm"
          onClick={(event) => onCreate(event.currentTarget)}
          type="button"
        >
          <Plus aria-hidden="true" size={15} />
        </Button>
      </div>
      <div className="space-y-3">
        {projects.map((project) => {
          const items = conversations.filter((item) => item.projectId === project.id);
          const expanded =
            isSearching || (selectedProjectId === project.id && collapsedProjectId !== project.id);
          const Icon = expanded ? FolderOpen : Folder;
          return (
            <div role="group" aria-label={project.name} key={project.id}>
              <Button
                variant="ghost"
                aria-current={selectedProjectId === project.id ? 'true' : undefined}
                aria-controls={`${id}-project-${project.id}`}
                aria-expanded={expanded}
                className={cn(
                  'flex h-auto min-h-10 w-full items-center justify-start whitespace-normal gap-2 rounded-lg px-2.5 text-left text-xs text-sidebar-foreground hover:bg-sidebar-accent focus-visible:outline-2 focus-visible:outline-sidebar-ring group-data-[density=compact]/workspace:min-h-8',
                  selectedProjectId === project.id &&
                    'bg-sidebar-accent text-sidebar-accent-foreground',
                )}
                onClick={() => {
                  if (selectedProjectId === project.id)
                    setCollapsedProjectId(expanded ? project.id : null);
                  else {
                    setCollapsedProjectId(null);
                    onSelectProject(project.id);
                  }
                }}
                type="button"
              >
                <Icon
                  aria-hidden="true"
                  size={16}
                  className="shrink-0 text-sidebar-accent-foreground"
                />
                <span className="min-w-0 flex-1 wrap-anywhere">{project.name}</span>
                <ChevronRight
                  aria-hidden="true"
                  size={13}
                  className={cn(
                    'shrink-0 transition-transform motion-reduce:transition-none',
                    expanded && 'rotate-90',
                  )}
                />
              </Button>
              <div
                id={`${id}-project-${project.id}`}
                hidden={!expanded}
                className="mt-1 ml-4 border-l border-sidebar-border pl-2"
              >
                {items.length ? (
                  <ConversationNavigation
                    conversations={items}
                    selectedId={selectedId}
                    onSelect={onSelectConversation}
                  />
                ) : (
                  <p className="px-2 py-3 text-2xs leading-relaxed text-sidebar-muted">
                    {isSearching
                      ? 'Aucun résultat dans ce projet.'
                      : 'Un projet, de nouvelles possibilités.'}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
