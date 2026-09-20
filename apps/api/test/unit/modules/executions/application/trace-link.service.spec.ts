import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';

import { ApiException } from '@api/common/errors/api.exception';
import { buildTraceUrl, traceLinkFitsEveryRun } from '@api/config/trace-link';
import type { ExecutionsService } from '@api/modules/executions/application/executions.service';
import { TraceLinkService } from '@api/modules/executions/application/trace-link.service';

const principal = { id: 'user-1', sessionId: 'session-1' } as never;
const config = new ConfigService({
  TRACE_LINK_UI_URL: 'https://smith.langchain.com',
  TRACE_LINK_ORGANIZATION_ID: '0f1e2d3c-org',
  TRACE_LINK_PROJECT_ID: 'a1b2c3d4-project',
});

describe('buildTraceUrl', () => {
  it('builds the console address of a run as the LangSmith SDKs do', () => {
    expect(
      buildTraceUrl({
        uiUrl: 'https://smith.langchain.com',
        organizationId: 'org',
        projectId: 'proj',
        runId: '11111111-1111-4111-8111-111111111111',
      }),
    ).toBe(
      'https://smith.langchain.com/o/org/projects/p/proj/r/11111111-1111-4111-8111-111111111111?poll=true',
    );
  });

  it('encodes every segment and keeps a self-hosted base path', () => {
    expect(
      buildTraceUrl({
        uiUrl: 'https://observability.internal/langsmith/',
        organizationId: 'org/../admin',
        projectId: 'p?x=1',
        runId: 'run#1',
      }),
    ).toBe(
      'https://observability.internal/langsmith/o/org%2F..%2Fadmin/projects/p/p%3Fx%3D1/r/run%231?poll=true',
    );
  });
});

describe('buildTraceUrl credentials', () => {
  it('never emits a link that carries credentials', () => {
    expect(() =>
      buildTraceUrl({
        uiUrl: 'https://user:secret@smith.langchain.com',
        organizationId: 'org',
        projectId: 'proj',
        runId: 'run',
      }),
    ).toThrow(/credentials/u);
  });
});

describe('traceLinkFitsEveryRun', () => {
  it('reserves room for the widest run identifier the store can hold', () => {
    const target = { organizationId: 'org', projectId: 'proj' };
    // 31 + 800 + 25 fixed characters + 1 152 for a 128-character encoded run id + 10 = 2 018.
    expect(
      traceLinkFitsEveryRun({
        ...target,
        uiUrl: `https://observability.internal/${'p'.repeat(800)}`,
      }),
    ).toBe(true);
    expect(
      traceLinkFitsEveryRun({
        ...target,
        uiUrl: `https://observability.internal/${'p'.repeat(900)}`,
      }),
    ).toBe(false);
    expect(
      buildTraceUrl({ ...target, uiUrl: 'https://smith.langchain.com', runId: '€'.repeat(128) }),
    ).toHaveLength(31 + 25 - 4 + 1_152 + 10);
  });
});

describe('TraceLinkService', () => {
  it('links an observable execution to the trace of its runtime run', async () => {
    const getObservation = vi.fn().mockResolvedValue({ runtimeRunId: 'run-42' });
    const executions = { getObservation } as unknown as ExecutionsService;
    const service = new TraceLinkService(executions, config);
    await expect(service.linkFor(principal, 'exec-1')).resolves.toEqual({
      url: 'https://smith.langchain.com/o/0f1e2d3c-org/projects/p/a1b2c3d4-project/r/run-42?poll=true',
    });
    expect(getObservation).toHaveBeenCalledWith(principal, 'exec-1');
  });

  it('answers not found while the execution has no runtime run yet', async () => {
    const executions = {
      getObservation: vi.fn().mockResolvedValue({ runtimeRunId: null }),
    } as unknown as ExecutionsService;
    const service = new TraceLinkService(executions, config);
    await expect(service.linkFor(principal, 'exec-1')).rejects.toMatchObject({
      status: 404,
      code: 'trace_unavailable',
    });
    await expect(service.linkFor(principal, 'exec-1')).rejects.toBeInstanceOf(ApiException);
  });

  it('refuses a link the contract would reject instead of serving it', async () => {
    const executions = {
      getObservation: vi.fn().mockResolvedValue({ runtimeRunId: 'é'.repeat(128) }),
    } as unknown as ExecutionsService;
    const service = new TraceLinkService(
      executions,
      new ConfigService({
        TRACE_LINK_UI_URL: `https://observability.internal/${'p'.repeat(1_300)}`,
        TRACE_LINK_ORGANIZATION_ID: 'org',
        TRACE_LINK_PROJECT_ID: 'proj',
      }),
    );
    await expect(service.linkFor(principal, 'exec-1')).rejects.toMatchObject({
      status: 500,
      code: 'trace_link_invalid',
    });
  });

  it('propagates the observation authorization failures untouched', async () => {
    const denied = new ApiException(404, 'execution_not_found', 'Execution not found.');
    const executions = {
      getObservation: vi.fn().mockRejectedValue(denied),
    } as unknown as ExecutionsService;
    const service = new TraceLinkService(executions, config);
    await expect(service.linkFor(principal, 'exec-1')).rejects.toBe(denied);
  });
});
