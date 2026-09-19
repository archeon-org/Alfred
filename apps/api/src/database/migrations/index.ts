import { DurableRuntimeExecutions1789400000000 } from './1789400000000-durable-runtime-executions';
import { CreateRuntimeExecutions1789310000000 } from './1789310000000-create-runtime-executions';
import { WorkspaceMemberships1789290000000 } from './1789290000000-workspace-memberships';
import { CreateWorkspaces1789280000000 } from './1789280000000-create-workspaces';
import { RemoveConversationSkills1789270000000 } from './1789270000000-remove-conversation-skills';
import { SkillRollbackPointer1789260000000 } from './1789260000000-skill-rollback-pointer';
import { SkillLifecycle1789250000000 } from './1789250000000-skill-lifecycle';
import { CreateSkills1789240000000 } from './1789240000000-create-skills';
import { CreateContextDocuments1789160000000 } from './1789160000000-create-context-documents';
import { AddConversationPin1789080000000 } from './1789080000000-add-conversation-pin';
import { CreateIdempotencyKeys1788739200000 } from './1788739200000-create-idempotency-keys';
import { CreateIdentityFoundation1788464265141 } from './1788464265141-create-identity-foundation';
import { IndexRefreshSessionReplacement1788515667301 } from './1788515667301-index-refresh-session-replacement';
import { GeneralizeOauthLoginState1788527000000 } from './1788527000000-generalize-oauth-login-state';
import { PrefixApiTables1788979000000 } from './1788979000000-prefix-api-tables';
import { CreateTenants1789000000000 } from './1789000000000-create-tenants';
import { CreateProjects1789000100000 } from './1789000100000-create-projects';
import { CreateConversations1789000200000 } from './1789000200000-create-conversations';
import { AddProjectPin1789000300000 } from './1789000300000-add-project-pin';

export const databaseMigrations = Object.freeze([
  CreateIdentityFoundation1788464265141,
  IndexRefreshSessionReplacement1788515667301,
  GeneralizeOauthLoginState1788527000000,
  CreateIdempotencyKeys1788739200000,
  PrefixApiTables1788979000000,
  CreateTenants1789000000000,
  CreateProjects1789000100000,
  CreateConversations1789000200000,
  AddProjectPin1789000300000,
  AddConversationPin1789080000000,
  CreateContextDocuments1789160000000,
  CreateSkills1789240000000,
  SkillLifecycle1789250000000,
  SkillRollbackPointer1789260000000,
  RemoveConversationSkills1789270000000,
  CreateWorkspaces1789280000000,
  WorkspaceMemberships1789290000000,
  CreateRuntimeExecutions1789310000000,
  DurableRuntimeExecutions1789400000000,
] as const);
