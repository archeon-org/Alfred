import type { ExecutionStreamEvent } from '@alfred/contracts';
import type { Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { ExecutionsController } from '@api/modules/executions/api/executions.controller';
import type { ExecutionsService } from '@api/modules/executions/application/executions.service';
import { REQUIRED_FEATURE_FLAGS_KEY } from '@api/modules/feature-flags/requires-feature.decorator';
import { principal } from '../../../../support/project-fixtures';

const execution = {
  conversation: undefined,
  conversationId: '3f2e1d0c-9b8a-4765-8321-fedcba987654',
  createdAt: new Date('2026-09-11T09:00:00.000Z'),
  error: null,
  finishedAt: null,
  id: '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d',
  runtimeRunId: null,
  runtimeThreadId: 'thread-1',
  startedAt: null,
  status: 'pending' as const,
  updatedAt: new Date('2026-09-11T09:00:00.000Z'),
};

function fakeResponse() {
  const chunks: string[] = [];
  const listeners = new Map<string, () => void>();
  const end = vi.fn();
  const flushHeaders = vi.fn();
  const response = {
    destroyed: false,
    end,
    flushHeaders,
    on: vi.fn((event: string, listener: () => void) => listeners.set(event, listener)),
    setHeader: vi.fn(),
    status: vi.fn(),
    writableEnded: false,
    write: vi.fn((chunk: string) => chunks.push(chunk)),
  };
  return { chunks, end, flushHeaders, listeners, response: response as unknown as Response };
}

function fakeService(overrides: Record<string, unknown> = {}) {
  const start = vi.fn().mockResolvedValue({ execution, message: 'Salut' });
  const stream = vi.fn();
  const listMessages = vi.fn();
  const service = { listMessages, start, stream, ...overrides } as unknown as ExecutionsService;
  return { listMessages, service, start, stream };
}

describe('ExecutionsController', () => {
  it('is hidden behind the agentRuntime capability flag', () => {
    expect(Reflect.getMetadata(REQUIRED_FEATURE_FLAGS_KEY, ExecutionsController)).toEqual([
      'agentRuntime',
    ]);
  });

  it('authorizes first, then streams the execution and native events over SSE', async () => {
    const native: ExecutionStreamEvent[] = [{ data: { run_id: 'r' }, event: 'metadata' }];
    const { service, start } = fakeService({
      stream: vi.fn(function* () {
        yield* native;
      }),
    });
    const controller = new ExecutionsController(service);
    const { chunks, end, listeners, response } = fakeResponse();

    await controller.start(principal, execution.conversationId, { message: 'Salut' }, response);

    expect(start).toHaveBeenCalledWith(principal, execution.conversationId, 'Salut');
    expect(chunks[0]).toContain('event: execution\ndata: {');
    expect(chunks[0]).toContain('"status":"pending"');
    expect(chunks[0]).not.toContain('runtimeThreadId');
    expect(chunks[1]).toBe('event: metadata\ndata: {"run_id":"r"}\n\n');
    expect(listeners.has('close')).toBe(true);
    expect(end).toHaveBeenCalledOnce();
  });

  it('propagates ownership errors before any stream header is written', async () => {
    const { service, stream } = fakeService({
      start: vi.fn().mockRejectedValue(new Error('conversation_not_found')),
    });
    const controller = new ExecutionsController(service);
    const { flushHeaders, response } = fakeResponse();

    await expect(
      controller.start(principal, execution.conversationId, { message: 'Salut' }, response),
    ).rejects.toThrow('conversation_not_found');
    expect(flushHeaders).not.toHaveBeenCalled();
    expect(stream).not.toHaveBeenCalled();
  });

  it('lists the stored transcript in a success envelope', async () => {
    const { service } = fakeService({
      listMessages: vi.fn().mockResolvedValue([{ id: 'm1' }]),
    });
    const controller = new ExecutionsController(service);
    await expect(controller.listMessages(principal, execution.conversationId)).resolves.toEqual({
      data: { items: [{ id: 'm1' }] },
      success: true,
    });
  });
});
