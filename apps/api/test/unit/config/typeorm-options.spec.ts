import type { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';

import { createTypeOrmOptions, databaseEntities } from '@api/database/typeorm.options';

function config(values: Readonly<Record<string, unknown>>): ConfigService {
  return {
    getOrThrow: vi.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

describe('createTypeOrmOptions', () => {
  it('uses a bounded pool and never mutates the schema at application startup', () => {
    const options = createTypeOrmOptions(
      config({
        DATABASE_POOL_MAX: 24,
        DATABASE_SSL: false,
        DATABASE_URL: 'postgresql://alfred:password@postgres:5432/alfred_app',
      }),
    );

    expect(options).toMatchObject({
      entities: [...databaseEntities],
      installExtensions: false,
      migrationsRun: false,
      migrationsTableName: 'api_migrations',
      retryAttempts: 5,
      ssl: false,
      synchronize: false,
      type: 'postgres',
      uuidExtension: 'pgcrypto',
    });
    expect(options.extra).toMatchObject({
      connectionTimeoutMillis: 10_000,
      lock_timeout: 5_000,
      max: 24,
      statement_timeout: 30_000,
    });
  });

  it('requires certificate validation when PostgreSQL TLS is enabled', () => {
    const options = createTypeOrmOptions(
      config({
        DATABASE_POOL_MAX: 10,
        DATABASE_SSL: true,
        DATABASE_URL: 'postgresql://alfred:password@postgres:5432/alfred_app',
      }),
    );

    expect(options).toMatchObject({ ssl: { rejectUnauthorized: true } });
  });
});
