import { PROJECT_NAME_MAX_LENGTH } from '@alfred/contracts';
import { useRef, useState } from 'react';
import { Outlet, useLocation, useMatch, useNavigate } from 'react-router-dom';
import type { PanelImperativeHandle } from 'react-resizable-panels';

import { ConversationActionDialogs } from '@/components/workspace/conversation/conversation-action-dialogs';
import { useChatSession } from '@/hooks/conversations/use-chat-session';
import { useConversationActions } from '@/hooks/conversations/use-conversation-actions';
import { TextFieldDialog } from '@/components/ui/text-field-dialog';
import { ContextPanel } from '@/components/workspace/context/context-panel';
import { WorkspaceHeader } from '@/components/workspace/header/workspace-header';
import { WorkspaceLayout } from '@/components/workspace/workspace-layout';
import { WorkspaceSidebar } from '@/components/workspace/navigation/workspace-sidebar';
import { ProjectActionDialogs } from '@/components/workspace/project/project-action-dialogs';
import {
  useConversationQuery,
  useConversationsQuery,
} from '@/hooks/conversations/use-conversations-query';
import { useFeatureFlagsQuery } from '@/hooks/feature-flags/use-feature-flags-query';
import { useProjectActions } from '@/hooks/projects/use-project-actions';
import { useCreateProject } from '@/hooks/projects/use-project-mutations';
import {
  usePinnedProjectsQuery,
  useProjectQuery,
  useProjectsQuery,
} from '@/hooks/projects/use-projects-query';
import { useWorkspacePreferences } from '@/hooks/workspace/use-workspace-preferences';
import type { WorkspaceOutletContext } from '@/hooks/workspace/use-workspace-outlet';
import { useTabletWorkspace } from '@/hooks/workspace/use-tablet-workspace';
import { useWorkspaceShell } from '@/hooks/workspace/use-workspace-shell';
import { useWorkspaceTools } from '@/hooks/workspace/use-workspace-tools';
import { describeApiError } from '@/lib/workspace/api-error-message';
import type { Project, WorkspaceCreationKind } from '@/lib/workspace/workspace.types';

// Only projects still ask for a name up front; a chat is named by its first message.
const projectCreationLabels = {
  field: 'Nom du projet',
  maxLength: PROJECT_NAME_MAX_LENGTH,
  placeholder: 'Ex. Préparation du comité',
  submit: 'Créer le projet',
  title: 'Nouveau projet',
} as const;

function projectHomePath(projectId: string): string {
  return `/app/projects/${projectId}`;
}

/** Composer-first creation: the home chat screen itself, scoped to a project when one is selected. */
function newConversationPath(projectId: string | undefined): string {
  return projectId === undefined
    ? '/app'
    : `/app/conversations/new?projectId=${encodeURIComponent(projectId)}`;
}

/** Workspace frame: navigation data, creation dialogs and the panels around the routed screen. */
export function WorkspaceScreen() {
  const preferences = useWorkspacePreferences();
  const shell = useWorkspaceShell(preferences.contextOpenByDefault);
  const tools = useWorkspaceTools();
  // Below md the narrow bar owns the context toggle; from md the panel folds itself.
  const isTablet = useTabletWorkspace();
  const isSettings = useMatch('/app/settings') !== null;
  const navigate = useNavigate();
  const location = useLocation();
  const projectMatch = useMatch('/app/projects/:projectId');
  const skillEditorMatch = useMatch('/app/skills/:skillId/edit');
  const newSkillMatch = useMatch('/app/skills/new');
  const isSkillEditor = skillEditorMatch !== null || newSkillMatch !== null;
  const newConversationMatch = useMatch('/app/conversations/new');
  const conversationMatch = useMatch('/app/conversations/:conversationId');
  const pinnedQuery = usePinnedProjectsQuery();
  const projectsQuery = useProjectsQuery();
  const recentQuery = useConversationsQuery(null);
  const createProject = useCreateProject();
  // Warms the capability manifest so a chat opened from the composer knows the bridge state at once.
  useFeatureFlagsQuery();
  const chatSession = useChatSession();
  const streamingConversationIds = new Set(
    chatSession.sessions
      .filter((session) => session.turn.status === 'streaming')
      .map((session) => session.conversationId),
  );
  const conversationRef = useRef<HTMLElement>(null);
  const sidebarRef = useRef<PanelImperativeHandle>(null);
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  // The conversation itself is the source of truth: an older chat opened by link must keep its
  // project in the header and in "Nouvelle conversation". The recent list only bridges the
  // detail request so a chat picked from the sidebar keeps its scope without a flicker.
  const selectedConversationId =
    newConversationMatch === null ? conversationMatch?.params.conversationId : undefined;
  const selectedConversation =
    useConversationQuery(selectedConversationId).conversation ??
    recentQuery.conversations.find(({ id }) => id === selectedConversationId);
  const newConversationProjectId =
    newConversationMatch === null
      ? undefined
      : (new URLSearchParams(location.search).get('projectId') ?? undefined);
  const selectedProjectId =
    projectMatch?.params.projectId ??
    newConversationProjectId ??
    (selectedConversation?.projectKind === 'named' ? selectedConversation.projectId : undefined);
  const selectedProjectQuery = useProjectQuery(selectedProjectId);
  const selectedProject = selectedProjectQuery.project;
  const projectActions = useProjectActions({
    onDeleted: (project) => {
      if (project.id === selectedProjectId) void navigate('/app', { replace: true });
    },
  });

  const conversationActions = useConversationActions({
    onDeleted: (conversation) => {
      if (conversation.id === selectedConversationId) {
        void navigate(
          conversation.projectKind === 'named' ? projectHomePath(conversation.projectId) : '/app',
          { replace: true },
        );
      }
    },
  });

  const normalizedSearch = shell.search.trim().toLocaleLowerCase('fr');
  const conversations = recentQuery.conversations.filter(({ title }) =>
    title.toLocaleLowerCase('fr').includes(normalizedSearch),
  );
  const navigationQueries = [
    { fallback: 'Impossible de charger vos projets.', query: pinnedQuery },
    { fallback: 'Impossible de charger vos projets.', query: projectsQuery },
    { fallback: 'Impossible de charger vos conversations.', query: recentQuery },
  ] as const;
  const isNavigationLoading = navigationQueries.some(({ query }) => query.status === 'loading');
  const isLoading = shell.isPreviewLoading || isNavigationLoading;
  const failed = navigationQueries.find(({ query }) => query.status === 'error');
  const loadError =
    failed === undefined ? null : describeApiError(failed.query.error, failed.fallback);
  const scopeName =
    selectedProjectId !== undefined
      ? (selectedProject?.name ?? 'Projet')
      : selectedConversation?.projectKind === 'implicit'
        ? 'Chat libre'
        : 'Espace personnel';
  const creationError = createProject.isError
    ? describeApiError(createProject.error, 'Impossible de créer le projet.')
    : null;

  function closeCreation() {
    setIsCreatingProject(false);
    createProject.reset();
  }

  function openProject(project: Project) {
    shell.closeNavigation();
    void navigate(projectHomePath(project.id));
  }

  function create(kind: WorkspaceCreationKind) {
    if (kind === 'project') {
      setIsCreatingProject(true);
      return;
    }
    // No dialog: the empty chat screen opens and the first message creates the conversation.
    shell.closeNavigation();
    void navigate(newConversationPath(kind === 'conversation' ? selectedProject?.id : undefined));
  }

  function submitProject(value: string) {
    createProject.mutate(
      { name: value },
      {
        onSuccess: (project) => {
          closeCreation();
          openProject(project);
        },
      },
    );
  }

  function toggleSidebar() {
    if (shell.isSidebarOpen) sidebarRef.current?.collapse();
    else sidebarRef.current?.expand();
    shell.setIsSidebarOpen(!shell.isSidebarOpen);
  }

  const outlet: WorkspaceOutletContext = {
    preferences,
    conversationRef,
    isLoading: shell.isPreviewLoading,
    selectedProject,
  };
  const labels = projectCreationLabels;

  if (isSettings) return <Outlet context={outlet} />;

  return (
    <div
      className="group/workspace min-h-dvh bg-canvas text-sm text-foreground"
      data-testid="workspace"
      data-density={preferences.density}
      data-reduced-motion={preferences.reducedMotion}
    >
      <a
        className="fixed top-3 left-3 z-50 -translate-y-24 rounded-lg bg-background p-3 font-medium outline-none focus:translate-y-0 focus-visible:ring-2 focus-visible:ring-ring"
        href="#main-content"
      >
        Aller au contenu principal
      </a>
      <WorkspaceLayout
        contextAvailable={!isSkillEditor}
        isSidebarOpen={shell.isSidebarOpen}
        isContextOpen={shell.isContextOpen && !isSkillEditor}
        sidebarRef={sidebarRef}
        onSidebarOpenChange={shell.setIsSidebarOpen}
        onOpenSidebar={toggleSidebar}
        onOpenContext={shell.toggleContext}
        sidebar={
          <WorkspaceSidebar
            conversationActions={{
              onMove: conversationActions.move,
              onDelete: conversationActions.remove,
              onRename: conversationActions.rename,
              onTogglePin: conversationActions.togglePin,
            }}
            pinnedProjects={pinnedQuery.projects}
            projects={projectsQuery.projects}
            hasMoreProjects={projectsQuery.hasMore}
            isLoadingMoreProjects={projectsQuery.isLoadingMore}
            onLoadMoreProjects={projectsQuery.loadMore}
            conversations={conversations}
            hasMoreConversations={recentQuery.hasMore}
            isLoadingMoreConversations={recentQuery.isLoadingMore}
            onLoadMoreConversations={recentQuery.loadMore}
            onRetryConversations={recentQuery.retryMore}
            conversationsError={
              recentQuery.status === 'ready' && recentQuery.error
                ? describeApiError(recentQuery.error, 'Impossible de charger les conversations.')
                : null
            }
            selectedProjectId={selectedProjectId}
            selectedConversationId={selectedConversationId}
            streamingConversationIds={streamingConversationIds}
            isProjectHome={projectMatch !== null}
            search={shell.search}
            isLoading={isLoading}
            isNavigationOpen={shell.isNavigationOpen}
            onCollapse={toggleSidebar}
            isPreviewLoading={shell.isPreviewLoading}
            onTogglePreviewLoading={shell.toggleLoading}
            loadError={loadError}
            notice={conversationActions.pinError ?? projectActions.pinError}
            onRetry={() => navigationQueries.forEach(({ query }) => query.reload())}
            onSearch={shell.setSearch}
            onSelectConversation={(id) => {
              shell.closeNavigation();
              void navigate(`/app/conversations/${id}`);
            }}
            onSelectProject={openProject}
            onCreate={create}
            actions={{
              onDelete: projectActions.remove,
              onRename: projectActions.rename,
              onTogglePin: projectActions.togglePin,
            }}
          />
        }
        header={
          <WorkspaceHeader
            contextAvailable={!isSkillEditor}
            scope={{
              href:
                selectedProjectId === undefined ? undefined : projectHomePath(selectedProjectId),
              name: scopeName,
            }}
            isContextOpen={shell.isContextOpen && !isSkillEditor}
            isNavigationOpen={shell.isNavigationOpen}
            onToggleContext={shell.toggleContext}
            onToggleNavigation={shell.toggleNavigation}
          />
        }
        conversation={<Outlet context={outlet} />}
        context={
          <ContextPanel
            isLoading={isLoading}
            tools={tools}
            onClose={isTablet ? shell.toggleContext : undefined}
          />
        }
      />
      <TextFieldDialog
        description="Regroupez les conversations autour d’un même objectif."
        error={creationError}
        isPending={createProject.isPending}
        label={labels.field}
        maxLength={labels.maxLength}
        onOpenChange={(open) => {
          if (!open) closeCreation();
        }}
        onSubmit={submitProject}
        open={isCreatingProject}
        placeholder={labels.placeholder}
        submitLabel={labels.submit}
        title={labels.title}
      />
      <ConversationActionDialogs {...conversationActions.dialogs} />
      <ProjectActionDialogs {...projectActions.dialogs} />
      {shell.isPreviewLoading ? (
        <p className="sr-only" role="status" aria-label="Chargement de l’espace de travail">
          Chargement de l’espace de travail
        </p>
      ) : null}
    </div>
  );
}
