import { Pin, Plus } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { ProjectNavigationItem } from '@/components/workspace/navigation/project-navigation-item';
import type { ProjectActionHandlers } from '@/components/workspace/project/project-action-menu';
import { useFoldedList } from '@/hooks/ui/use-folded-list';
import { RECENT_PROJECTS_FIRST_PAGE } from '@/lib/workspace/project-list';
import type { Conversation, Project } from '@/lib/workspace/workspace.types';

export interface ProjectNavigationProps {
  /** Pinned projects in the order they were pinned. */
  readonly pinnedProjects: readonly Project[];
  /** Unpinned projects, most recent first, loaded page by page. */
  readonly projects: readonly Project[];
  readonly hasMoreProjects: boolean;
  readonly isLoadingMoreProjects: boolean;
  readonly onLoadMoreProjects: () => void;
  /** Chats of named projects only; standalone chats live in their own section. */
  readonly conversations: readonly Conversation[];
  readonly selectedProjectId: string | undefined;
  readonly selectedConversationId: string | undefined;
  /** True while the project home of `selectedProjectId` is the current screen. */
  readonly isProjectHome: boolean;
  readonly isSearching: boolean;
  readonly onSelectProject: (project: Project) => void;
  readonly onSelectConversation: (id: string) => void;
  readonly onCreate: (trigger: HTMLButtonElement) => void;
  readonly actions: ProjectActionHandlers;
}

interface ProjectSectionProps {
  readonly title: string;
  readonly icon?: ReactNode;
  readonly headerAction?: ReactNode;
  readonly footer?: ReactNode;
  readonly children: ReactNode;
}

interface FoldControlsProps {
  readonly canShowMore: boolean;
  readonly canShowLess: boolean;
  readonly isLoadingMore?: boolean;
  readonly onShowMore: () => void;
  readonly onShowLess: () => void;
}

const foldButtonClass =
  'h-8 min-h-8 justify-start px-2 text-2xs font-normal text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground';

/** "Afficher plus" / "Afficher moins" footer shared by the sidebar sections. */
function FoldControls({
  canShowLess,
  canShowMore,
  isLoadingMore = false,
  onShowLess,
  onShowMore,
}: FoldControlsProps) {
  if (!canShowMore && !canShowLess) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {canShowMore ? (
        <Button
          aria-busy={isLoadingMore}
          className={foldButtonClass}
          disabled={isLoadingMore}
          onClick={onShowMore}
          size="sm"
          variant="ghost"
        >
          Afficher plus
        </Button>
      ) : null}
      {canShowLess ? (
        <Button className={foldButtonClass} onClick={onShowLess} size="sm" variant="ghost">
          Afficher moins
        </Button>
      ) : null}
    </div>
  );
}

function ProjectSection({ children, footer, headerAction, icon, title }: ProjectSectionProps) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="mt-1">
      <div className="mb-1.5 flex min-h-8 items-center justify-between pl-2">
        <h2
          className="flex items-center gap-1.5 text-2xs font-semibold tracking-widest text-sidebar-muted uppercase"
          id={id}
        >
          {icon}
          {title}
        </h2>
        {headerAction}
      </div>
      <div className="space-y-1">{children}</div>
      {footer}
    </section>
  );
}

export function ProjectNavigation({
  actions,
  conversations,
  hasMoreProjects,
  isLoadingMoreProjects,
  isProjectHome,
  isSearching,
  onCreate,
  onLoadMoreProjects,
  onSelectConversation,
  onSelectProject,
  pinnedProjects,
  projects,
  selectedConversationId,
  selectedProjectId,
}: ProjectNavigationProps) {
  const id = useId();
  const [collapsedProjectId, setCollapsedProjectId] = useState<string | null>(null);
  const pinnedList = useFoldedList(pinnedProjects, RECENT_PROJECTS_FIRST_PAGE);
  const recentList = useFoldedList(projects, RECENT_PROJECTS_FIRST_PAGE, {
    hasMore: hasMoreProjects,
    onLoadMore: onLoadMoreProjects,
  });

  const renderProject = (project: Project) => {
    const isSelected = selectedProjectId === project.id;
    const isExpanded = isSearching || (isSelected && collapsedProjectId !== project.id);
    return (
      <ProjectNavigationItem
        actions={actions}
        conversations={conversations.filter((item) => item.projectId === project.id)}
        isExpanded={isExpanded}
        isSearching={isSearching}
        isSelected={isSelected}
        key={project.id}
        onHome={onSelectProject}
        onSelect={(target) => {
          if (isSelected && isProjectHome) {
            setCollapsedProjectId(isExpanded ? target.id : null);
            return;
          }
          setCollapsedProjectId(null);
          onSelectProject(target);
        }}
        onSelectConversation={onSelectConversation}
        panelId={`${id}-project-${project.id}`}
        project={project}
        selectedConversationId={selectedConversationId}
      />
    );
  };

  return (
    <div className="space-y-5">
      {pinnedProjects.length > 0 ? (
        <ProjectSection
          footer={
            <FoldControls
              canShowLess={pinnedList.canShowLess}
              canShowMore={pinnedList.canShowMore}
              onShowLess={pinnedList.showLess}
              onShowMore={pinnedList.showMore}
            />
          }
          icon={<Pin aria-hidden="true" size={12} />}
          title="Épinglés"
        >
          {pinnedList.visible.map(renderProject)}
        </ProjectSection>
      ) : null}
      <ProjectSection
        footer={
          <FoldControls
            canShowLess={recentList.canShowLess}
            canShowMore={recentList.canShowMore}
            isLoadingMore={isLoadingMoreProjects}
            onShowLess={recentList.showLess}
            onShowMore={recentList.showMore}
          />
        }
        headerAction={
          <Button
            variant="ghost"
            aria-label="Créer un projet"
            className="size-7 min-h-7 text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground"
            size="icon-sm"
            onClick={(event) => onCreate(event.currentTarget)}
            type="button"
          >
            <Plus aria-hidden="true" size={15} />
          </Button>
        }
        title="Projets"
      >
        {projects.length === 0 ? (
          <p className="px-2 pb-1 text-2xs leading-relaxed text-sidebar-muted">
            {pinnedProjects.length === 0
              ? 'Aucun projet pour le moment. Créez-en un pour regrouper vos chats.'
              : 'Tous vos projets sont épinglés.'}
          </p>
        ) : (
          recentList.visible.map(renderProject)
        )}
      </ProjectSection>
    </div>
  );
}
