import { useContext } from 'react';

import { ChatSessionContext } from '@/contexts/chat-session/chat-session-context';

export function useChatSession() {
  const session = useContext(ChatSessionContext);
  if (session === null) {
    throw new Error('useChatSession doit être utilisé dans ChatSessionProvider.');
  }
  return session;
}
