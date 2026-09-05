import type { ConfigService } from '@nestjs/config';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { OauthLoginStateEntity } from '../modules/auth/infrastructure/persistence/entities/oauth-login-state.entity';
import { RefreshSessionEntity } from '../modules/auth/infrastructure/persistence/entities/refresh-session.entity';
import { UserEntity } from '../modules/users/user.entity';
import { UserIdentityEntity } from '../modules/users/user-identity.entity';
import { createPostgresConnectionExtra, POSTGRES_UUID_EXTENSION } from './database-options';

export const databaseEntities = [
  UserEntity,
  UserIdentityEntity,
  RefreshSessionEntity,
  OauthLoginStateEntity,
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
    retryAttempts: 5,
    retryDelay: 3000,
    ssl: ssl ? { rejectUnauthorized: true } : false,
    extra: createPostgresConnectionExtra(config.getOrThrow<number>('DATABASE_POOL_MAX')),
    uuidExtension: POSTGRES_UUID_EXTENSION,
  };
}
