/** Query keys are scoped by account so a different login never reads another user's cache. */
export const projectKeys = {
  all: (userId: string) => ['projects', userId] as const,
  detail: (userId: string, projectId: string) => ['projects', userId, 'detail', projectId] as const,
  list: (userId: string) => ['projects', userId, 'list'] as const,
};

export const conversationKeys = {
  all: (userId: string) => ['conversations', userId] as const,
  detail: (userId: string, conversationId: string) =>
    ['conversations', userId, 'detail', conversationId] as const,
  list: (userId: string, projectId: string | null) =>
    ['conversations', userId, 'list', projectId ?? 'recent'] as const,
};
