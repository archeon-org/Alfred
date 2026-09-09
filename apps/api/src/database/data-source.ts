import 'reflect-metadata';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { parseDatabaseEnvironment } from './database-environment';
import {
  API_MIGRATIONS_TABLE,
  createPostgresConnectionExtra,
  POSTGRES_UUID_EXTENSION,
} from './database-options';
import { databaseMigrations } from './migrations';
import { databaseEntities } from './typeorm.options';

export { parseDatabaseEnvironment } from './database-environment';

export function createApplicationDataSourceOptions(
  input: Record<string, unknown>,
): DataSourceOptions {
  const environment = parseDatabaseEnvironment(input);

  return {
    type: 'postgres',
    url: environment.DATABASE_URL,
    entities: [...databaseEntities],
    installExtensions: false,
    migrations: [...databaseMigrations],
    migrationsRun: false,
    migrationsTableName: API_MIGRATIONS_TABLE,
    synchronize: false,
    ssl: environment.DATABASE_SSL ? { rejectUnauthorized: true } : false,
    extra: createPostgresConnectionExtra(environment.DATABASE_POOL_MAX),
    // With extension installation disabled, this selects gen_random_uuid() for TypeORM schema
    // diffs. PostgreSQL 17 provides that function in core; the API DB does not install pgcrypto.
    uuidExtension: POSTGRES_UUID_EXTENSION,
  } satisfies DataSourceOptions;
}

const applicationDataSource = new DataSource(createApplicationDataSourceOptions(process.env));

export default applicationDataSource;
