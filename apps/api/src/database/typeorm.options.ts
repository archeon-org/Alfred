import type { ConfigService } from '@nestjs/config';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { WorkspaceMembershipEntity } from '../modules/workspaces/infrastructure/workspace-membership.entity';
import { WorkspaceEntity } from '../modules/workspaces/infrastructure/workspace.entity';
import { SkillEntity } from '../modules/skills/infrastructure/skill.entity';
import { SkillVersionEntity } from '../modules/skills/infrastructure/skill-version.entity';
import { SkillFileEntity } from '../modules/skills/infrastructure/skill-file.entity';
import { ContextDocumentEntity } from '../modules/context/infrastructure/context-document.entity';
import { IdempotencyKeyEntity } from '../common/idempotency/idempotency-key.entity';
import { OauthLoginStateEntity } from '../modules/auth/infrastructure/persistence/entities/oauth-login-state.entity';
import { RefreshSessionEntity } from '../modules/auth/infrastructure/persistence/entities/refresh-session.entity';
import { UserEntity } from '../modules/users/user.entity';
import { UserIdentityEntity } from '../modules/users/user-identity.entity';
import { TenantEntity } from '../modules/tenants/tenant.entity';
import { ProjectEntity } from '../modules/projects/infrastructure/persistence/project.entity';
import { ConversationEntity } from '../modules/conversations/infrastructure/persistence/conversation.entity';
import {
  API_MIGRATIONS_TABLE,
  createPostgresConnectionExtra,
  POSTGRES_UUID_EXTENSION,
} from './database-options';

export const databaseEntities = [
  TenantEntity,
  WorkspaceEntity,
  WorkspaceMembershipEntity,
  UserEntity,
  UserIdentityEntity,
  RefreshSessionEntity,
  OauthLoginStateEntity,
  IdempotencyKeyEntity,
  ProjectEntity,
  ConversationEntity,
  ContextDocumentEntity,
  SkillEntity,
  SkillVersionEntity,
  SkillFileEntity,
] as const;

export function createTypeOrmOptions(config: ConfigService): TypeOrmModuleOptions {
  const ssl = config.getOrThrow<boolean>('DATABASE_SSL');

  return {
    type: 'postgres',
    url: config.getOrThrow<string>('DATABASE_URL'),
    entities: [...databaseEntities],
    installExtensions: false,
    synchronize: false,
    migrationsRun: false,
    migrationsTableName: API_MIGRATIONS_TABLE,
    retryAttempts: 5,
    retryDelay: 3000,
    ssl: ssl ? { rejectUnauthorized: true } : false,
    extra: createPostgresConnectionExtra(config.getOrThrow<number>('DATABASE_POOL_MAX')),
    uuidExtension: POSTGRES_UUID_EXTENSION,
  };
}
