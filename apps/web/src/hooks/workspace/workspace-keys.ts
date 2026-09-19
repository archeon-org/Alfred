/** Query keys are scoped by account so a different login never reads another user's cache. */
export const projectKeys = {
  all: (userId: string) => ['projects', userId] as const,
  detail: (userId: string, projectId: string) => ['projects', userId, 'detail', projectId] as const,
  list: (userId: string, scope: 'pinned' | 'recent') =>
    ['projects', userId, 'list', scope] as const,
};

export const messageKeys = {
  list: (userId: string, conversationId: string) => ['messages', userId, conversationId] as const,
};

export const executionKeys = {
  work: (userId: string, executionId: string) => ['execution-work', userId, executionId] as const,
};

export const conversationKeys = {
  lists: (userId: string) => ['conversations', userId, 'list'] as const,
  all: (userId: string) => ['conversations', userId] as const,
  detail: (userId: string, conversationId: string) =>
    ['conversations', userId, 'detail', conversationId] as const,
  list: (userId: string, projectId: string | null) =>
    ['conversations', userId, 'list', projectId ?? 'standalone'] as const,
};

export const workspaceKeys = {
  membership: (userId: string) => ['workspace', userId, 'membership'] as const,
};

/** The personal file library. `lists` covers every filtered list, so one invalidation refreshes them. */
export const fileKeys = {
  all: (userId: string) => ['files', userId] as const,
  lists: (userId: string) => ['files', userId, 'list'] as const,
  list: (userId: string, filters: object) => ['files', userId, 'list', filters] as const,
  detail: (userId: string, fileId: string) => ['files', userId, 'detail', fileId] as const,
  preview: (userId: string, fileId: string) => ['files', userId, 'preview', fileId] as const,
  quota: (userId: string) => ['files', userId, 'quota'] as const,
  folders: (userId: string) => ['files', userId, 'folders'] as const,
};
