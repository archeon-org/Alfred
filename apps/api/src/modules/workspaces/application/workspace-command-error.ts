const commandMessages = {
  WORKSPACE_INVALID_ARGUMENTS: 'Invalid workspace command arguments.',
  WORKSPACE_TENANT_UNAVAILABLE: 'Active tenant not found',
  WORKSPACE_UNAVAILABLE: 'Active workspace not found in tenant',
  WORKSPACE_USER_UNAVAILABLE: 'User not found in tenant',
  WORKSPACE_LAST_MEMBERSHIP: 'The last workspace membership cannot be removed',
  WORKSPACE_DEFAULT_ARCHIVE_FORBIDDEN: 'The default workspace cannot be archived',
  WORKSPACE_OCCUPIED: 'An occupied workspace cannot be archived',
} as const;

export class WorkspaceCommandError extends Error {
  constructor(readonly code: keyof typeof commandMessages) {
    super(commandMessages[code]);
    this.name = 'WorkspaceCommandError';
  }
}
