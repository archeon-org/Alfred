const DATABASE_LOCK_TIMEOUT_MS = 5_000;
const DATABASE_CONNECTION_TIMEOUT_MS = 10_000;
const DATABASE_STATEMENT_TIMEOUT_MS = 30_000;

export const POSTGRES_UUID_EXTENSION = 'pgcrypto' as const;

// Every API-owned table, including the TypeORM ledger, is prefixed so the API can share one
// PostgreSQL database with the LangGraph runtime without name collisions.
export const API_TABLE_PREFIX = 'api_' as const;
export const API_MIGRATIONS_TABLE = `${API_TABLE_PREFIX}migrations` as const;

export interface PostgresConnectionExtra {
  readonly connectionTimeoutMillis: number;
  readonly lock_timeout: number;
  readonly max: number;
  readonly statement_timeout: number;
}

export function createPostgresConnectionExtra(max: number): PostgresConnectionExtra {
  return Object.freeze({
    connectionTimeoutMillis: DATABASE_CONNECTION_TIMEOUT_MS,
    lock_timeout: DATABASE_LOCK_TIMEOUT_MS,
    max,
    statement_timeout: DATABASE_STATEMENT_TIMEOUT_MS,
  });
}
