import { afterEach, describe, expect, it, vi } from 'vitest';

import { getGoogleLoginUrl, logoutSession, refreshSession, safeReturnTo } from './auth-api';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('auth API contract', () => {
  it('returns no session for rejected refresh cookies', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    await expect(refreshSession()).resolves.toBeNull();
  });

  it.each([403, 503])(
    'keeps a refresh HTTP %s failure distinct from an anonymous session',
    async (status) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status })));

      await expect(refreshSession()).rejects.toThrow(/session ne peut pas être restaurée/u);
    },
  );

  it('rejects incomplete session payloads instead of accepting an unusable identity', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              accessToken: 'signed-token',
              user: { displayName: '', email: 'ada@example.test', id: 'user-id', role: 'user' },
            },
            success: true,
          }),
          { headers: { 'content-type': 'application/json' }, status: 200 },
        ),
      ),
    );

    await expect(refreshSession()).rejects.toThrow(/utilisateur de session/u);
  });

  it('treats an already-invalidated remote session as logged out', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    await expect(logoutSession()).resolves.toBeUndefined();
  });

  it('keeps OAuth return targets inside the application', () => {
    expect(safeReturnTo('/app?from=login')).toBe('/app?from=login');
    expect(safeReturnTo('//attacker.example')).toBe('/app');
    expect(safeReturnTo('/\\attacker.example')).toBe('/app');
    expect(safeReturnTo('/\t//attacker.example')).toBe('/app');
    expect(safeReturnTo('https://attacker.example')).toBe('/app');
    expect(getGoogleLoginUrl()).toBe('/api/auth/google/start?returnTo=%2Fapp');
  });
});
