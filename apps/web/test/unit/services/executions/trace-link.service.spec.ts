import { afterEach, describe, expect, it, vi } from 'vitest';

import { getExecutionTraceLink } from '@/services/executions/executions.service';
import { ApiRequestError } from '@/services/http/api-json';
import { createHttpClient } from '@/services/http/http-client';
import { EXECUTION_ID } from '../../../support/executions-api';

afterEach(() => vi.unstubAllGlobals());

describe('getExecutionTraceLink', () => {
  it('reads the trace address of an execution', async () => {
    const url = `https://smith.langchain.com/o/org/projects/p/proj/r/${EXECUTION_ID}?poll=true`;
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ success: true, data: { url } })));
    vi.stubGlobal('fetch', fetch);
    await expect(getExecutionTraceLink(createHttpClient(), EXECUTION_ID)).resolves.toEqual({
      url,
    });
    expect(
      (fetch.mock.calls as [string, RequestInit][]).map(([path, init]) => [path, init.method]),
    ).toEqual([[expect.stringContaining(`/executions/${EXECUTION_ID}/trace-link`), 'GET']]);
  });

  it('rejects an address that is not a URL and surfaces the API refusal', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ success: true, data: { url: 'javascript:alert(1)' } })),
        ),
    );
    await expect(getExecutionTraceLink(createHttpClient(), EXECUTION_ID)).rejects.toThrow(
      'Le lien de trace est invalide.',
    );
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: false,
            error: { code: 'trace_unavailable', message: 'No trace.' },
          }),
          { status: 404 },
        ),
      ),
    );
    await expect(getExecutionTraceLink(createHttpClient(), EXECUTION_ID)).rejects.toBeInstanceOf(
      ApiRequestError,
    );
  });
});
