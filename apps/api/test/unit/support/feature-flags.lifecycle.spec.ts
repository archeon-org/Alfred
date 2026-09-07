import type { INestApplication } from '@nestjs/common';
import { FEATURE_FLAG_NAMES } from '@alfred/contracts';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { runFeatureState } from '../../support/feature-flag-state';
import { expectFeatureRouteHidden } from '../../support/feature-flags';

const key = 'FEATURE_GOOGLE_OAUTH_ENABLED';
let previous: string | undefined;

beforeEach(() => {
  previous = process.env[key];
});

afterEach(() => {
  if (previous === undefined) delete process.env[key];
  else process.env[key] = previous;
  vi.unstubAllGlobals();
});

function fixture() {
  const app = {
    getUrl: vi.fn<INestApplication['getUrl']>().mockResolvedValue('http://127.0.0.1:12345'),
    close: vi.fn<INestApplication['close']>().mockResolvedValue(undefined),
  };
  const fetchMock = vi.fn(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          success: true,
          data: Object.fromEntries(
            FEATURE_FLAG_NAMES.map((flag) => [
              flag,
              flag === 'googleOAuth' && process.env[key] === 'true',
            ]),
          ),
        }),
        { status: 200 },
      ),
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  return {
    app,
    fetchMock,
    buildApp: vi
      .fn<() => Promise<INestApplication>>()
      .mockResolvedValue(app as unknown as INestApplication),
  };
}

test('builds each state afresh, awaits callbacks and restores the caller env', async () => {
  process.env[key] = 'caller-value';
  const { app, buildApp } = fixture();
  const states: string[] = [];
  const recordState = async () => {
    await Promise.resolve();
    states.push(process.env[key] ?? 'missing');
  };
  expect(buildApp).not.toHaveBeenCalled();
  expect(states).toEqual([]);
  for (const enabled of [true, false]) {
    await runFeatureState('googleOAuth', enabled, buildApp, recordState);
    expect(process.env[key]).toBe('caller-value');
  }
  expect(states).toEqual(['true', 'false']);
  expect(buildApp).toHaveBeenCalledTimes(2);
  expect(app.close).toHaveBeenCalledTimes(2);
});

test('closes the app and restores an absent env key when an async case fails', async () => {
  delete process.env[key];
  const { app, buildApp } = fixture();
  await expect(
    runFeatureState('googleOAuth', true, buildApp, () => Promise.reject(new Error('case failed'))),
  ).rejects.toThrow('case failed');
  expect(app.close).toHaveBeenCalledOnce();
  expect(process.env).not.toHaveProperty(key);
});

test('restores env when building fails before an app is returned', async () => {
  process.env[key] = 'caller-value';
  await expect(
    runFeatureState(
      'googleOAuth',
      true,
      () => Promise.reject(new Error('build failed')),
      () => undefined,
    ),
  ).rejects.toThrow('build failed');
  expect(process.env[key]).toBe('caller-value');
});

test('restores env even when closing fails', async () => {
  process.env[key] = 'caller-value';
  const { app, buildApp } = fixture();
  app.close.mockRejectedValue(new Error('close failed'));
  await expect(runFeatureState('googleOAuth', true, buildApp, () => undefined)).rejects.toThrow(
    'close failed',
  );
  expect(process.env[key]).toBe('caller-value');
});

test.each([true, false])(
  'rejects a manifest inconsistent with configured state %s',
  async (enabled) => {
    const { app, buildApp, fetchMock } = fixture();
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            data: Object.fromEntries(
              FEATURE_FLAG_NAMES.map((flag) => [flag, flag === 'googleOAuth' && !enabled]),
            ),
          }),
        ),
      ),
    );
    const runCase = vi.fn();
    await expect(runFeatureState('googleOAuth', enabled, buildApp, runCase)).rejects.toThrow();
    expect(runCase).not.toHaveBeenCalled();
    expect(app.close).toHaveBeenCalledOnce();
  },
);

test.each([
  { status: 503, body: { success: false } },
  { status: 200, body: { success: true, data: { googleOAuth: true } } },
])('rejects unavailable or incomplete manifests ($status)', async ({ status, body }) => {
  const { app, buildApp, fetchMock } = fixture();
  fetchMock.mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify(body), { status })),
  );
  await expect(runFeatureState('googleOAuth', true, buildApp, vi.fn())).rejects.toThrow();
  expect(app.close).toHaveBeenCalledOnce();
});

test.each([
  { status: 404, code: 'HTTP_404', valid: true },
  { status: 200, code: 'HTTP_404', valid: false },
  { status: 404, code: 'resource_not_found', valid: false },
])(
  'requires both HTTP 404 and the standard error code ($status/$code)',
  async ({ status, code, valid }) => {
    const { app, fetchMock } = fixture();
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ success: false, error: { code } }), { status }),
      ),
    );
    const result = expectFeatureRouteHidden(
      app as unknown as INestApplication,
      'DELETE',
      '/api/example',
    );
    if (valid) await result;
    else await expect(result).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:12345/api/example',
      expect.objectContaining({ method: 'DELETE', redirect: 'manual' }),
    );
  },
);
