import { Link, useLocation, useParams } from 'react-router-dom';

import { buttonVariants } from '@/components/ui/button';
import { ConversationPanel } from '@/components/workspace/conversation/conversation-panel';
import { WorkspaceNotice } from '@/components/workspace/workspace-notice';
import { useConversationQuery } from '@/hooks/conversations/use-conversations-query';
import { useWorkspaceOutlet } from '@/hooks/workspace/use-workspace-outlet';
import { describeApiError } from '@/lib/workspace/api-error-message';

function draftFrom(state: unknown): string | undefined {
  if (typeof state !== 'object' || state === null || !('draft' in state)) return undefined;
  return typeof state.draft === 'string' ? state.draft : undefined;
}

/** `/app/conversations/:conversationId`: the chat itself; sending waits for the runtime bridge. */
export function ConversationScreen() {
  const { conversationId } = useParams();
  const { conversationRef, isLoading } = useWorkspaceOutlet();
  const location = useLocation();
  const query = useConversationQuery(conversationId);

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
      draft={draftFrom(location.state)}
      prompts={[]}
      isLoading={isLoading || query.status === 'loading'}
      onPrompt={() => undefined}
    />
  );
}
