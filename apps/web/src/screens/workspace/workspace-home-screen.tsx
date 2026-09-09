import { useNavigate } from 'react-router-dom';

import { ConversationPanel } from '@/components/workspace/conversation/conversation-panel';
import { useCreateConversation } from '@/hooks/conversations/use-conversation-mutations';
import { useWorkspaceOutlet } from '@/hooks/workspace/use-workspace-outlet';
import { describeApiError } from '@/lib/workspace/api-error-message';
import { deriveConversationTitle } from '@/lib/workspace/derive-title';
import { starterPrompts } from '@/lib/workspace/starter-prompts';

/** `/app`: a fresh draft; a starter opens a standalone chat and carries its text as a draft. */
export function WorkspaceHomeScreen() {
  const { conversationRef, isLoading } = useWorkspaceOutlet();
  const navigate = useNavigate();
  const create = useCreateConversation();
  return (
    <ConversationPanel
      ref={conversationRef}
      title={undefined}
      prompts={starterPrompts}
      isLoading={isLoading}
      isBusy={create.isPending}
      notice={
        create.isError ? describeApiError(create.error, 'Impossible d’ouvrir le chat.') : null
      }
      onPrompt={(prompt) =>
        create.mutate(
          { title: deriveConversationTitle(prompt.prompt) },
          {
            onSuccess: (conversation) => {
              void navigate(`/app/conversations/${conversation.id}`, {
                state: { draft: prompt.prompt },
              });
            },
          },
        )
      }
    />
  );
}
