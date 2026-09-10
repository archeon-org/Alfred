import { Link, useNavigate, useParams } from 'react-router-dom';

import { ConversationActionDialogs } from '@/components/workspace/conversation/conversation-action-dialogs';
import { useConversationActions } from '@/hooks/conversations/use-conversation-actions';
import { buttonVariants } from '@/components/ui/button';
import { ProjectActionDialogs } from '@/components/workspace/project/project-action-dialogs';
import { ProjectOverview } from '@/components/workspace/project/project-overview';
import { WorkspaceNotice } from '@/components/workspace/workspace-notice';
import { useCreateConversation } from '@/hooks/conversations/use-conversation-mutations';
import { useConversationsQuery } from '@/hooks/conversations/use-conversations-query';
import { useProjectActions } from '@/hooks/projects/use-project-actions';
import { useProjectQuery } from '@/hooks/projects/use-projects-query';
import { useWorkspaceOutlet } from '@/hooks/workspace/use-workspace-outlet';
import { describeApiError } from '@/lib/workspace/api-error-message';
import { deriveConversationTitle } from '@/lib/workspace/derive-title';

/** `/app/projects/:projectId`: project home with its chats and Markdown sources. */
export function ProjectScreen() {
  const { projectId = '' } = useParams();
  const { conversationRef, isLoading } = useWorkspaceOutlet();
  const navigate = useNavigate();
  const projectQuery = useProjectQuery(projectId);
  const chats = useConversationsQuery(projectId);
  const createChat = useCreateConversation();
  const actions = useProjectActions({ onDeleted: () => void navigate('/app', { replace: true }) });
  const conversationActions = useConversationActions();
  if (projectQuery.status === 'error') {
    return (
      <WorkspaceNotice
        action={
          <Link className={buttonVariants({ variant: 'outline' })} to="/app">
            Retour à l’accueil
          </Link>
        }
        message={describeApiError(projectQuery.error, 'Ce projet est introuvable.')}
        ref={conversationRef}
        title="Projet introuvable"
        tone="error"
      />
    );
  }
  const project = projectQuery.project;
  if (project === undefined) {
    return (
      <WorkspaceNotice
        message="Un instant, le projet arrive."
        ref={conversationRef}
        title="Chargement du projet"
      />
    );
  }

  return (
    <>
      <ProjectOverview
        ref={conversationRef}
        project={project}
        isBusy={isLoading}
        notice={conversationActions.pinError ?? actions.pinError}
        actions={{
          onDelete: actions.remove,
          onRename: actions.rename,
          onTogglePin: actions.togglePin,
        }}
        chats={{
          conversationActions: {
            onMove: conversationActions.move,
            onDelete: conversationActions.remove,
            onRename: conversationActions.rename,
            onTogglePin: conversationActions.togglePin,
          },
          conversations: chats.conversations,
          error: chats.error
            ? describeApiError(chats.error, 'Impossible de charger les chats.')
            : null,
          hasMore: chats.hasMore,
          isLoadingMore: chats.isLoadingMore,
          onLoadMore: chats.loadMore,
          onRetry: chats.status === 'error' ? chats.reload : chats.retryMore,
          onSelect: (id) => void navigate(`/app/conversations/${id}`),
          status: chats.status,
        }}
        composer={{
          error: createChat.isError
            ? describeApiError(createChat.error, 'Impossible d’ouvrir le chat.')
            : null,
          isPending: createChat.isPending,
          onSubmit: (text) =>
            createChat.mutate(
              { projectId: project.id, title: deriveConversationTitle(text) },
              {
                onSuccess: (conversation) => {
                  void navigate(`/app/conversations/${conversation.id}`, {
                    state: { draft: text },
                  });
                },
              },
            ),
        }}
      />
      <ConversationActionDialogs {...conversationActions.dialogs} />
      <ProjectActionDialogs {...actions.dialogs} />
    </>
  );
}
