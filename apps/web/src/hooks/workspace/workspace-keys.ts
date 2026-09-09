/** Query keys are scoped by account so a different login never reads another user's cache. */
export const projectKeys = {
  all: (userId: string) => ['projects', userId] as const,
  detail: (userId: string, projectId: string) => ['projects', userId, 'detail', projectId] as const,
  list: (userId: string, scope: 'pinned' | 'recent') =>
    ['projects', userId, 'list', scope] as const,
};

export const conversationKeys = {
  lists: (userId: string) => ['conversations', userId, 'list'] as const,
  all: (userId: string) => ['conversations', userId] as const,
  detail: (userId: string, conversationId: string) =>
    ['conversations', userId, 'detail', conversationId] as const,
  list: (userId: string, projectId: string | null) =>
    ['conversations', userId, 'list', projectId ?? 'standalone'] as const,
};
