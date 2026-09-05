import { describe, expect, it } from 'vitest';

import { parseDatabaseEnvironment } from '@api/database/data-source';

describe('parseDatabaseEnvironment', () => {
  it('accepts the database-only production environment used by the migration job', () => {
    expect(
      parseDatabaseEnvironment({
        DATABASE_POOL_MAX: '4',
        DATABASE_SSL: 'false',
        DATABASE_URL: 'postgresql://alfred:password@postgres:5432/alfred_app',
        NODE_ENV: 'production',
      }),
    ).toEqual({
      DATABASE_POOL_MAX: 4,
      DATABASE_SSL: false,
      DATABASE_URL: 'postgresql://alfred:password@postgres:5432/alfred_app',
      NODE_ENV: 'production',
    });
  });

  it('rejects non-PostgreSQL URLs and committed production placeholders', () => {
    expect(() =>
      parseDatabaseEnvironment({
        DATABASE_URL: 'mysql://alfred:password@database:3306/alfred',
      }),
    ).toThrow(/DATABASE_URL/u);

    expect(() =>
      parseDatabaseEnvironment({
        DATABASE_URL: 'postgresql://alfred:replace-with-a-random-password@postgres:5432/alfred_app',
        NODE_ENV: 'production',
      }),
    ).toThrow(/placeholder/u);
  });
});
