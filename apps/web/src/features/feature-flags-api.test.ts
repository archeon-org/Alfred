import { afterEach, describe, expect, it, vi } from 'vitest';

import { getFeatureFlags } from './feature-flags-api';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('feature flag API contract', () => {
  it('loads the complete server-controlled manifest', async () => {
    const flags = {
      agentRuntime: false,
      agUiStreaming: false,
      fileUploads: false,
      generativeUi: false,
      googleOAuth: false,
      mcpApps: false,
      runtimeMemory: false,
      skills: false,
      teams: false,
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: flags, success: true }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(getFeatureFlags()).resolves.toEqual(flags);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/features$/u),
      expect.objectContaining({ credentials: 'include', method: 'GET' }),
    );
  });

  it('fails closed when one flag is absent or not boolean', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: { googleOAuth: true }, success: true }), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
      ),
    );

    await expect(getFeatureFlags()).rejects.toThrow(/feature flags/i);
  });
});
