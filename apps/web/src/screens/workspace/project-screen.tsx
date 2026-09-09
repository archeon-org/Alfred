import {
  PROJECT_CONTEXT_MAX_BYTES,
  PROJECT_DESCRIPTION_MAX_LENGTH,
  PROJECT_NAME_MAX_LENGTH,
} from '@alfred/contracts';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { buttonVariants } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { MarkdownDocumentDialog } from '@/components/ui/markdown-document-dialog';
import type { TextLimit } from '@/components/ui/markdown-editor';
import { TextFieldDialog } from '@/components/ui/text-field-dialog';
import { ProjectOverview } from '@/components/workspace/project/project-overview';
import type { ProjectDocumentKey } from '@/components/workspace/project/project-sources';
import { WorkspaceNotice } from '@/components/workspace/workspace-notice';
import { useCreateConversation } from '@/hooks/conversations/use-conversation-mutations';
import { useConversationsQuery } from '@/hooks/conversations/use-conversations-query';
import { useDeleteProject, useUpdateProject } from '@/hooks/projects/use-project-mutations';
import { useProjectQuery } from '@/hooks/projects/use-projects-query';
import { useWorkspaceOutlet } from '@/hooks/workspace/use-workspace-outlet';
import { describeApiError } from '@/lib/workspace/api-error-message';
import { deriveConversationTitle } from '@/lib/workspace/derive-title';

type ProjectDialog = ProjectDocumentKey | 'delete' | 'rename';

const documents: Record<
  ProjectDocumentKey,
  {
    readonly title: string;
    readonly description: string;
    readonly placeholder: string;
    readonly limit: TextLimit;
  }
> = {
  context: {
    description:
      'Ce qu’Alfred doit savoir pour travailler dans ce projet : fonctionnement, règles, vocabulaire, liens utiles. Markdown accepté.',
    limit: { max: PROJECT_CONTEXT_MAX_BYTES, unit: 'bytes' },
    placeholder: '## Fonctionnement\n\nDécrivez comment le projet fonctionne…',
    title: 'Contexte du projet',
  },
  description: {
    description: 'De quoi parle ce projet ? Un texte court, en Markdown.',
    limit: { max: PROJECT_DESCRIPTION_MAX_LENGTH, unit: 'characters' },
    placeholder: 'Ce projet vise à…',
    title: 'Description du projet',
  },
};

/** `/app/projects/:projectId`: project home with its chats and Markdown sources. */
export function ProjectScreen() {
  const { projectId = '' } = useParams();
  const { conversationRef, isLoading } = useWorkspaceOutlet();
  const navigate = useNavigate();
  const projectQuery = useProjectQuery(projectId);
  const chats = useConversationsQuery(projectId);
  const update = useUpdateProject();
  const remove = useDeleteProject();
  const createChat = useCreateConversation();
  const [dialog, setDialog] = useState<ProjectDialog | null>(null);

  function closeDialog() {
    setDialog(null);
    update.reset();
    remove.reset();
  }
  const dialogError = (fallback: string) =>
    update.isError
      ? describeApiError(update.error, fallback)
      : remove.isError
        ? describeApiError(remove.error, fallback)
        : null;

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
  const name = project.name ?? 'Projet';

  return (
    <>
      <ProjectOverview
        ref={conversationRef}
        project={project}
        isBusy={isLoading}
        chats={{
          conversations: chats.conversations,
          error: chats.error
            ? describeApiError(chats.error, 'Impossible de charger les chats.')
            : null,
          hasMore: chats.hasMore,
          isLoadingMore: chats.isLoadingMore,
          onLoadMore: chats.loadMore,
          onRetry: chats.reload,
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
        onRename={() => setDialog('rename')}
        onDelete={() => setDialog('delete')}
        onEditDocument={setDialog}
      />
      <TextFieldDialog
        error={dialog === 'rename' ? dialogError('Impossible de renommer le projet.') : null}
        initialValue={project.name ?? ''}
        isPending={update.isPending}
        label="Nom du projet"
        maxLength={PROJECT_NAME_MAX_LENGTH}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
        onSubmit={(value) =>
          update.mutate({ id: project.id, input: { name: value } }, { onSuccess: closeDialog })
        }
        open={dialog === 'rename'}
        submitLabel="Renommer"
        title="Renommer le projet"
      />
      <ConfirmDialog
        confirmLabel="Supprimer le projet"
        description={`Le projet « ${name} » et tous ses chats seront supprimés définitivement. Cette action est irréversible.`}
        destructive
        error={dialog === 'delete' ? dialogError('Impossible de supprimer le projet.') : null}
        isPending={remove.isPending}
        onConfirm={() =>
          remove.mutate(project.id, {
            onSuccess: () => {
              closeDialog();
              void navigate('/app', { replace: true });
            },
          })
        }
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
        open={dialog === 'delete'}
        title="Supprimer ce projet ?"
      />
      {(['description', 'context'] as const).map((key) => (
        <MarkdownDocumentDialog
          description={documents[key].description}
          error={dialog === key ? dialogError('Impossible d’enregistrer le document.') : null}
          isPending={update.isPending}
          key={key}
          limit={documents[key].limit}
          onOpenChange={(open) => {
            if (!open) closeDialog();
          }}
          onSave={(value) =>
            update.mutate(
              {
                id: project.id,
                input: key === 'description' ? { description: value } : { context: value },
              },
              { onSuccess: closeDialog },
            )
          }
          open={dialog === key}
          placeholder={documents[key].placeholder}
          title={documents[key].title}
          value={project[key] ?? ''}
        />
      ))}
    </>
  );
}
