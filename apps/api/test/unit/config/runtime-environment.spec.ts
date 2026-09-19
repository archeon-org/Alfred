import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { parseEnvironment } from '@api/config/environment';

const baseline = {
  AUTH_JWT_SECRET: randomBytes(32).toString('hex'),
  DATABASE_URL: 'postgresql://user:password@localhost/alfred_test',
  NODE_ENV: 'test',
};
const configured = {
  ...baseline,
  FEATURE_AGENT_RUNTIME_ENABLED: true,
  AGENT_RUNTIME_URL: 'http://agents-api:8000',
};

describe('runtime startup compatibility and bounds', () => {
  it('starts with the existing native runtime configuration and no additional secrets', () => {
    const environment = parseEnvironment(configured);
    expect(environment.FEATURE_AGENT_RUNTIME_ENABLED).toBe(true);
    expect(environment.AGENT_RUNTIME_URL).toBe('http://agents-api:8000');
    expect(environment.EXECUTION_CURSOR_KEY).toMatch(/^[a-f0-9]{64}$/u);
    expect(environment).not.toHaveProperty('AGENT_RUNTIME_API_KEY');
    expect(environment).not.toHaveProperty('ALFRED_PRODUCT_API_KEY');
  });

  it('derives a stable private cursor key for replicas from the existing validated JWT secret', () => {
    const first = parseEnvironment(configured).EXECUTION_CURSOR_KEY;
    expect(parseEnvironment(configured).EXECUTION_CURSOR_KEY).toBe(first);
    expect(first).not.toBe(configured.AUTH_JWT_SECRET);
    expect(
      parseEnvironment({ ...configured, AUTH_JWT_SECRET: randomBytes(32).toString('hex') })
        .EXECUTION_CURSOR_KEY,
    ).not.toBe(first);
    expect(parseEnvironment({ ...configured, EXECUTION_CURSOR_KEY: '' }).EXECUTION_CURSOR_KEY).toBe(
      first,
    );
    expect(parseEnvironment(baseline).FEATURE_AGENT_RUNTIME_ENABLED).toBe(false);
  });

  it('preserves an optional explicit cursor key and previous key for rotation', () => {
    const current = randomBytes(32).toString('hex');
    const previous = randomBytes(32).toString('hex');
    expect(
      parseEnvironment({
        ...configured,
        EXECUTION_CURSOR_KEY: current,
        EXECUTION_CURSOR_KEY_PREVIOUS: previous,
      }),
    ).toMatchObject({ EXECUTION_CURSOR_KEY: current, EXECUTION_CURSOR_KEY_PREVIOUS: previous });
  });

  it.each(['EXECUTION_CURSOR_KEY', 'EXECUTION_CURSOR_KEY_PREVIOUS'] as const)(
    'validates optional %s without requiring it',
    (key) => {
      expect(() => parseEnvironment({ ...configured, [key]: 'short' })).toThrow(key);
      expect(() =>
        parseEnvironment({ ...configured, [key]: 'replace-with-at-least-32-random-characters' }),
      ).toThrow(key);
    },
  );

  it.each([undefined, '', 'short'])('still rejects an invalid existing JWT secret', (secret) => {
    expect(() => parseEnvironment({ ...configured, AUTH_JWT_SECRET: secret })).toThrow(
      'AUTH_JWT_SECRET',
    );
  });

  it('allows the existing private HTTP native runtime in production without changing browser policy', () => {
    const production = {
      ...configured,
      NODE_ENV: 'production',
      AUTH_COOKIE_SECURE: true,
      API_CORS_ORIGINS: 'https://alfred.example',
      WEB_APP_URL: 'https://alfred.example',
      FEATURE_RATE_LIMITING_ENABLED: false,
    };
    expect(parseEnvironment(production).AGENT_RUNTIME_URL).toBe('http://agents-api:8000');
    expect(() => parseEnvironment({ ...production, AUTH_COOKIE_SECURE: false })).toThrow(
      'AUTH_COOKIE_SECURE',
    );
    expect(() =>
      parseEnvironment({
        ...production,
        AUTH_JWT_SECRET: 'replace-with-at-least-32-random-characters',
      }),
    ).toThrow('AUTH_JWT_SECRET');
  });

  it('rejects non-HTTP targets and URL components that cannot identify the runtime origin', () => {
    for (const url of [
      'not-a-url',
      'file:///tmp/socket',
      'https://user:secret@runtime.internal',
      'https://runtime.internal/path',
      'https://runtime.internal?secret=foo',
      'https://runtime.internal#fragment',
    ]) {
      expect(() => parseEnvironment({ ...configured, AGENT_RUNTIME_URL: url })).toThrow(
        'AGENT_RUNTIME_URL',
      );
    }
  });

  it('does not disclose an invalid optional cursor credential in startup errors', () => {
    const secret = 'SYNTHETIC_PRIVATE_VALUE\n'.repeat(3);
    try {
      parseEnvironment({ ...configured, EXECUTION_CURSOR_KEY: secret });
      expect.fail('Expected startup rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect(error).toHaveProperty('name', 'ZodError');
      expect((error as Error).message).not.toContain('SYNTHETIC_PRIVATE_VALUE');
    }
  });

  it.each([
    'EXECUTION_DEADLINE_MS',
    'EXECUTION_LEASE_MS',
    'EXECUTION_WORKER_CONCURRENCY',
    'EXECUTION_MAX_ACTIVE_PER_USER',
    'EXECUTION_MAX_ACTIVE_GLOBAL',
    'EXECUTION_SSE_HEARTBEAT_MS',
    'EXECUTION_SSE_DRAIN_TIMEOUT_MS',
    'EXECUTION_SSE_MAX_FRAME_BYTES',
    'EXECUTION_SSE_MAX_BUFFERED_BYTES',
    'EXECUTION_MAX_OBSERVERS_PER_USER',
    'EXECUTION_MAX_OBSERVERS_PER_INSTANCE',
    'EXECUTION_OBSERVER_REAUTH_MS',
    'EXECUTION_CURSOR_TTL_MS',
    'EXECUTION_COMMIT_WINDOW_MS',
  ])('rejects nonpositive and unbounded %s', (key) => {
    expect(() => parseEnvironment({ ...baseline, [key]: 0 })).toThrow(key);
    expect(() => parseEnvironment({ ...baseline, [key]: Infinity })).toThrow(key);
  });

  it('keeps heartbeat plus drain handling below the 60-second ingress silence budget', () => {
    expect(() =>
      parseEnvironment({
        ...baseline,
        EXECUTION_SSE_HEARTBEAT_MS: 50_000,
        EXECUTION_SSE_DRAIN_TIMEOUT_MS: 10_000,
      }),
    ).toThrow('EXECUTION_SSE_HEARTBEAT_MS');
  });

  it('requires enough buffer space for a frame and consistent admission bounds', () => {
    expect(() => parseEnvironment({ ...baseline, EXECUTION_SSE_MAX_BUFFERED_BYTES: 1024 })).toThrow(
      'EXECUTION_SSE_MAX_BUFFERED_BYTES',
    );
    expect(() => parseEnvironment({ ...baseline, EXECUTION_MAX_ACTIVE_GLOBAL: 1 })).toThrow(
      'EXECUTION_MAX_ACTIVE_PER_USER',
    );
    expect(() =>
      parseEnvironment({ ...baseline, EXECUTION_MAX_OBSERVERS_PER_INSTANCE: 1 }),
    ).toThrow('EXECUTION_MAX_OBSERVERS_PER_USER');
  });
});
