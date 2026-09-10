import { CONVERSATION_TITLE_MAX_LENGTH, PROJECT_NAME_MAX_LENGTH } from '@alfred/contracts';
import { useRef, useState } from 'react';
import { Outlet, useMatch, useNavigate } from 'react-router-dom';
import type { PanelImperativeHandle } from 'react-resizable-panels';

import { ConversationActionDialogs } from '@/components/workspace/conversation/conversation-action-dialogs';
import { useConversationActions } from '@/hooks/conversations/use-conversation-actions';
import { TextFieldDialog } from '@/components/ui/text-field-dialog';
import { ContextPanel } from '@/components/workspace/context/context-panel';
import { WorkspaceHeader } from '@/components/workspace/header/workspace-header';
import { WorkspaceLayout } from '@/components/workspace/workspace-layout';
import { WorkspaceSidebar } from '@/components/workspace/navigation/workspace-sidebar';
import { ProjectActionDialogs } from '@/components/workspace/project/project-action-dialogs';
import { useCreateConversation } from '@/hooks/conversations/use-conversation-mutations';
import {
  useConversationQuery,
  useConversationsQuery,
} from '@/hooks/conversations/use-conversations-query';
import { useProjectActions } from '@/hooks/projects/use-project-actions';
import { useCreateProject } from '@/hooks/projects/use-project-mutations';
import {
  usePinnedProjectsQuery,
  useProjectQuery,
  useProjectsQuery,
} from '@/hooks/projects/use-projects-query';
import { useWorkspacePreferences } from '@/hooks/workspace/use-workspace-preferences';
import type { WorkspaceOutletContext } from '@/hooks/workspace/use-workspace-outlet';
import { useWorkspaceShell } from '@/hooks/workspace/use-workspace-shell';
import { useWorkspaceTools } from '@/hooks/workspace/use-workspace-tools';
import { describeApiError } from '@/lib/workspace/api-error-message';
import type { Project, WorkspaceCreationKind } from '@/lib/workspace/workspace.types';

const creationLabels = {
  conversation: {
    field: 'Titre de la conversation',
    maxLength: CONVERSATION_TITLE_MAX_LENGTH,
    placeholder: 'Ex. Définir les prochaines étapes',
    submit: 'Créer la conversation',
    title: 'Nouvelle conversation',
  },
  project: {
    field: 'Nom du projet',
    maxLength: PROJECT_NAME_MAX_LENGTH,
    placeholder: 'Ex. Préparation du comité',
    submit: 'Créer le projet',
    title: 'Nouveau projet',
  },
  sandbox: {
    field: 'Titre du chat',
    maxLength: CONVERSATION_TITLE_MAX_LENGTH,
    placeholder: 'Ex. Une idée à explorer',
    submit: 'Ouvrir le chat',
    title: 'Nouveau chat libre',
  },
} as const satisfies Record<WorkspaceCreationKind, unknown>;

function projectHomePath(projectId: string): string {
  return `/app/projects/${projectId}`;
}

/** Workspace frame: navigation data, creation dialogs and the panels around the routed screen. */
export function WorkspaceScreen() {
  const shell = useWorkspaceShell();
  const tools = useWorkspaceTools();
  const preferences = useWorkspacePreferences();
  const navigate = useNavigate();
  const projectMatch = useMatch('/app/projects/:projectId');
  const skillEditorMatch = useMatch('/app/skills/:skillId/edit');
  const newSkillMatch = useMatch('/app/skills/new');
  const isSkillEditor = skillEditorMatch !== null || newSkillMatch !== null;
  const conversationMatch = useMatch('/app/conversations/:conversationId');
  const pinnedQuery = usePinnedProjectsQuery();
  const projectsQuery = useProjectsQuery();
  const recentQuery = useConversationsQuery(null);
  const createProject = useCreateProject();
  const createConversation = useCreateConversation();
  const conversationRef = useRef<HTMLElement>(null);
  const sidebarRef = useRef<PanelImperativeHandle>(null);
  const [creation, setCreation] = useState<WorkspaceCreationKind | null>(null);

  // The conversation itself is the source of truth: an older chat opened by link must keep its
  // project in the header and in "Nouvelle conversation". The recent list only bridges the
  // detail request so a chat picked from the sidebar keeps its scope without a flicker.
  const selectedConversationId = conversationMatch?.params.conversationId;
  const selectedConversation =
    useConversationQuery(selectedConversationId).conversation ??
    recentQuery.conversations.find(({ id }) => id === selectedConversationId);
  const selectedProjectId =
    projectMatch?.params.projectId ??
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
  const creationError =
    creation === 'project'
      ? createProject.isError
        ? describeApiError(createProject.error, 'Impossible de créer le projet.')
        : null
      : createConversation.isError
        ? describeApiError(createConversation.error, 'Impossible de créer la conversation.')
        : null;

  function closeCreation() {
    setCreation(null);
    createProject.reset();
    createConversation.reset();
  }

  function openProject(project: Project) {
    shell.closeNavigation();
    void navigate(projectHomePath(project.id));
  }

  function submitCreation(value: string) {
    if (creation === 'project') {
      createProject.mutate(
        { name: value },
        {
          onSuccess: (project) => {
            closeCreation();
            openProject(project);
          },
        },
      );
      return;
    }
    createConversation.mutate(
      {
        title: value,
        ...(creation === 'conversation' && selectedProject !== undefined
          ? { projectId: selectedProject.id }
          : {}),
      },
      {
        onSuccess: (conversation) => {
          closeCreation();
          shell.closeNavigation();
          void navigate(`/app/conversations/${conversation.id}`);
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
  const labels = creation === null ? creationLabels.project : creationLabels[creation];

  return (
    <div
      className="group/workspace min-h-dvh bg-canvas text-sm text-foreground data-[reduced-motion=true]:[&_*]:animate-none data-[reduced-motion=true]:[&_*]:transition-none data-[reduced-motion=true]:[&_*]:scale-100 data-[text-size=comfortable]:[&_[data-slot=message-body]]:text-base data-[text-size=comfortable]:[&_[data-slot=welcome-description]]:text-sm data-[text-size=comfortable]:[&_textarea]:text-base"
      data-testid="workspace"
      data-density={preferences.density}
      data-text-size={preferences.textSize}
      data-reduced-motion={preferences.reducedMotion}
    >
      <a
        className="fixed top-3 left-3 z-50 -translate-y-24 rounded-lg bg-background p-3 font-medium outline-none focus:translate-y-0 focus-visible:ring-2 focus-visible:ring-ring"
        href="#main-content"
      >
        Aller au contenu principal
      </a>
      <WorkspaceLayout
        isSidebarOpen={shell.isSidebarOpen}
        isContextOpen={shell.isContextOpen && !isSkillEditor}
        sidebarRef={sidebarRef}
        onSidebarOpenChange={shell.setIsSidebarOpen}
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
            selectedConversationId={conversationMatch?.params.conversationId}
            isProjectHome={projectMatch !== null}
            search={shell.search}
            isLoading={isLoading}
            isNavigationOpen={shell.isNavigationOpen}
            loadError={loadError}
            notice={conversationActions.pinError ?? projectActions.pinError}
            onRetry={() => navigationQueries.forEach(({ query }) => query.reload())}
            onSearch={shell.setSearch}
            onSelectConversation={(id) => {
              shell.closeNavigation();
              void navigate(`/app/conversations/${id}`);
            }}
            onSelectProject={openProject}
            onCreate={(kind) => setCreation(kind)}
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
            isLoading={shell.isPreviewLoading}
            isContextOpen={shell.isContextOpen && !isSkillEditor}
            isSidebarOpen={shell.isSidebarOpen}
            isNavigationOpen={shell.isNavigationOpen}
            onToggleLoading={shell.toggleLoading}
            onToggleContext={shell.toggleContext}
            onToggleNavigation={shell.toggleNavigation}
            onToggleSidebar={toggleSidebar}
          />
        }
        conversation={<Outlet context={outlet} />}
        context={
          <ContextPanel
            isLoading={isLoading}
            scope={{
              conversationTitle: selectedConversation?.title,
              projectName: selectedProject?.name ?? undefined,
            }}
            tools={tools}
          />
        }
      />
      <TextFieldDialog
        description={
          creation === 'conversation' && selectedProject?.name
            ? `Dans le projet « ${selectedProject.name} ».`
            : creation === 'sandbox'
              ? 'Un chat hors projet, dans son propre espace privé.'
              : 'Regroupez les conversations autour d’un même objectif.'
        }
        error={creationError}
        isPending={createProject.isPending || createConversation.isPending}
        label={labels.field}
        maxLength={labels.maxLength}
        onOpenChange={(open) => {
          if (!open) closeCreation();
        }}
        onSubmit={submitCreation}
        open={creation !== null}
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
