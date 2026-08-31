import { describe, expect, it } from 'vitest';

import { parseEnvironment } from '../../src/config/environment';

const validEnvironment = Object.freeze({
  API_CORS_ORIGINS: 'http://localhost:5173,https://app.alfred.dev',
  API_HOST: '127.0.0.1',
  API_PORT: '3100',
  API_PREFIX: '/v1/',
  DATABASE_URL: 'postgresql://alfred:local-password@localhost:5432/alfred_api?schema=public',
  NODE_ENV: 'test',
});

describe('parseEnvironment', () => {
  it('returns an immutable, normalized and typed configuration', () => {
    const environment = parseEnvironment(validEnvironment);

    expect(environment).toEqual({
      API_CORS_ORIGINS: ['http://localhost:5173', 'https://app.alfred.dev'],
      API_HOST: '127.0.0.1',
      API_PORT: 3100,
      API_PREFIX: 'v1',
      DATABASE_URL: 'postgresql://alfred:local-password@localhost:5432/alfred_api?schema=public',
      NODE_ENV: 'test',
    });
    expect(Object.isFrozen(environment)).toBe(true);
    expect(Object.isFrozen(environment.API_CORS_ORIGINS)).toBe(true);
  });

  it('fails fast when DATABASE_URL is absent', () => {
    const withoutDatabaseUrl = Object.fromEntries(
      Object.entries(validEnvironment).filter(([key]) => key !== 'DATABASE_URL'),
    );

    expect(() => parseEnvironment(withoutDatabaseUrl)).toThrow(/DATABASE_URL/u);
  });

  it('accepts only PostgreSQL connection URLs', () => {
    expect(() =>
      parseEnvironment({
        ...validEnvironment,
        DATABASE_URL: 'mysql://alfred:password@localhost:3306/alfred',
      }),
    ).toThrow(/DATABASE_URL/u);
  });

  it('rejects a wildcard CORS origin in production', () => {
    expect(() =>
      parseEnvironment({
        ...validEnvironment,
        API_CORS_ORIGINS: '*',
        NODE_ENV: 'production',
      }),
    ).toThrow(/API_CORS_ORIGINS/u);
  });
});
