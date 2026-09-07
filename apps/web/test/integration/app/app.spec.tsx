import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '@/app/app';

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState({}, '', '/');
});

describe('App providers', () => {
  it('composes routing, query state and session hydration at the application root', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (url.endsWith('/features')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                data: {
                  agentRuntime: false,
                  agUiStreaming: false,
                  fileUploads: false,
                  generativeUi: false,
                  googleOAuth: false,
                  mcpApps: false,
                  outputStyles: false,
                  knowledgeScope: false,
                  conversationFeedback: false,
                  runtimeMemory: false,
                  skills: false,
                  teams: false,
                },
                success: true,
              }),
              { headers: { 'content-type': 'application/json' }, status: 200 },
            ),
          );
        }
        if (url.endsWith('/auth/providers')) {
          return Promise.resolve(
            new Response(JSON.stringify({ data: [], success: true }), {
              headers: { 'content-type': 'application/json' },
              status: 200,
            }),
          );
        }
        return Promise.resolve(new Response(null, { status: 401 }));
      }),
    );
    window.history.replaceState({}, '', '/login');

    render(<App />);

    expect(await screen.findByRole('heading', { name: /bienvenue sur Alfred/i })).toBeVisible();
  });
});
