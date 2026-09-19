import { useEffect } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';

import { buttonVariants } from '@/components/ui/button';
import { ConversationPanel } from '@/components/workspace/conversation/conversation-panel';
import { WorkspaceNotice } from '@/components/workspace/workspace-notice';
import { useConversationChat } from '@/hooks/conversations/use-conversation-chat';
import { useConversationQuery } from '@/hooks/conversations/use-conversations-query';
import { draftFrom, useStartConversation } from '@/hooks/conversations/use-start-conversation';
import { useFeatureFlagsQuery } from '@/hooks/feature-flags/use-feature-flags-query';
import { freshComposerScope } from '@/hooks/files/use-composer-attachments';
import { useProjectQuery } from '@/hooks/projects/use-projects-query';
import { useWorkspaceOutlet } from '@/hooks/workspace/use-workspace-outlet';
import { attachmentIdsFrom } from '@/lib/files/composer-attachments';
import { describeApiError } from '@/lib/workspace/api-error-message';
import { starterPrompts } from '@/lib/workspace/starter-prompts';

/**
 * The one chat screen. Without a conversation id (`/app`, `/app/conversations/new?projectId=…`)
 * it is a fresh chat whose first message creates the conversation; with an id it is that chat.
 */
export function ConversationScreen() {
  const { conversationId } = useParams();
  return conversationId === undefined ? (
    <FreshConversation />
  ) : (
    <ExistingConversation key={conversationId} conversationId={conversationId} />
  );
}

function FreshConversation() {
  const { conversationRef, isLoading, files } = useWorkspaceOutlet();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('projectId') ?? undefined;
  const projectQuery = useProjectQuery(projectId);
  const creation = useStartConversation(projectId);
  const { flags, status: flagsStatus } = useFeatureFlagsQuery();
  // Files picked before the chat exists wait under the scope of its creation target.
  const attachments =
    flagsStatus === 'ready' && flags.fileUploads
      ? files.attachments.forScope(freshComposerScope(projectId))
      : undefined;

  if (projectId !== undefined && projectQuery.status === 'error') {
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
  return (
    <ConversationPanel
      // Remount per target so a draft typed for one project never lands in another.
      key={projectId ?? 'standalone'}
      ref={conversationRef}
      title={
        projectId === undefined
          ? undefined
          : `Nouveau chat dans ${projectQuery.project?.name ?? 'le projet'}`
      }
      prompts={starterPrompts}
      isLoading={isLoading || (projectId !== undefined && projectQuery.status === 'loading')}
      isBusy={creation.isPending}
      notice={
        creation.error ? describeApiError(creation.error, 'Impossible d’ouvrir le chat.') : null
      }
      onPrompt={(prompt) => void creation.start(prompt.prompt)}
      onSend={creation.start}
      attachments={attachments}
    />
  );
}

function ExistingConversation({ conversationId }: { readonly conversationId: string }) {
  const { conversationRef, isLoading, files } = useWorkspaceOutlet();
  const location = useLocation();
  const query = useConversationQuery(conversationId);
  const { flags, status: flagsStatus } = useFeatureFlagsQuery();
  const bridgeAvailable = flagsStatus === 'ready' && flags.agentRuntime;
  const uploadsAvailable = flagsStatus === 'ready' && flags.fileUploads;
  const chat = useConversationChat(conversationId, bridgeAvailable);
  // Files of a first message that could not be sent arrive as ids, like its draft as text.
  const handedOver = attachmentIdsFrom(location.state).join(',');
  const { adopt } = files.attachments;
  useEffect(() => {
    if (uploadsAvailable && handedOver !== '') adopt(conversationId, handedOver.split(','));
  }, [adopt, conversationId, handedOver, uploadsAvailable]);

  if (query.status === 'error') {
    return (
      <WorkspaceNotice
        action={
          <Link className={buttonVariants({ variant: 'outline' })} to="/app">
            Retour à l’accueil
          </Link>
        }
        message={describeApiError(query.error, 'Cette conversation est introuvable.')}
        ref={conversationRef}
        title="Conversation introuvable"
        tone="error"
      />
    );
  }
  return (
    <ConversationPanel
      ref={conversationRef}
      title={query.conversation?.title}
      // A first message that could not be sent (bridge unavailable) waits here as a draft.
      draft={draftFrom(location.state)}
      prompts={[]}
      // The stored history loads beside the composer; it never blocks writing the next message.
      isLoading={isLoading || query.status === 'loading'}
      notice={
        chat.status === 'error'
          ? describeApiError(chat.error, 'L’historique de la conversation est indisponible.')
          : null
      }
      onPrompt={(prompt) => void chat.send(prompt.prompt)}
      messages={chat.messages}
      sessions={chat.sessions}
      failure={chat.failure}
      debugEvents={chat.debug.events}
      debugError={chat.debug.error}
      traceLinksEnabled={flagsStatus === 'ready' && flags.traceLinks}
      onSend={bridgeAvailable ? chat.send : undefined}
      attachments={uploadsAvailable ? files.attachments.forScope(conversationId) : undefined}
      blockedReason={
        chat.isDiscovering
          ? 'Vérification des exécutions en cours…'
          : chat.discoveryFailed
            ? 'Vérifiez la connexion avant d’envoyer un nouveau message.'
            : null
      }
      onReconnect={chat.reload}
      recoveryAvailable={chat.discoveryFailed || chat.live?.connection === 'disconnected'}
      isStreaming={chat.isStreaming}
      onStop={chat.stop}
    />
  );
}
