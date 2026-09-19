import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import type { DataSource } from 'typeorm';
import { ExecutionObservationService } from '@api/modules/executions/application/execution-observation.service';
import type { ExecutionsService } from '@api/modules/executions/application/executions.service';
import type { ConversationsService } from '@api/modules/conversations/application/conversations.service';
import type { MessageAttachmentsService } from '@api/modules/files/application/message-attachments.service';
import {
  emptyProjection,
  projectRuntimeEvent,
} from '@api/modules/executions/infrastructure/langgraph/runtime-projection';
import { principal } from '../../../../support/project-fixtures';

const currentKey = 'current-cursor-key-synthetic-1234567890';
const previousKey = 'previous-cursor-key-synthetic-1234567890';
function fixture() {
  const row = {
    id: randomUUID(),
    invocationId: randomUUID(),
    bindingGeneration: randomUUID(),
    conversationId: randomUUID(),
    createdAt: new Date(),
    startedAt: null,
    finishedAt: null,
    status: 'running',
    error: null,
    reducerState: {},
    sourceWatermark: null as string | null,
    projectionRevision: 0,
    publicText: '',
  };
  const getObservation = vi.fn().mockResolvedValue(row);
  const config = new ConfigService({
    EXECUTION_CURSOR_KEY: currentKey,
    EXECUTION_CURSOR_KEY_PREVIOUS: previousKey,
  });
  const service = new ExecutionObservationService(
    { getObservation } as unknown as ExecutionsService,
    {
      get: vi.fn().mockResolvedValue({ id: row.conversationId }),
    } as unknown as ConversationsService,
    {
      getRepository: () => ({ findOne: vi.fn().mockResolvedValue({ content: 'Hello' }) }),
    } as unknown as DataSource,
    config,
  );
  return { service, row, config, getObservation };
}
describe('coherent public execution snapshots', () => {
  it('never exposes native binding identifiers in the public snapshot', async () => {
    const { service, row } = fixture();
    const snapshot = await service.snapshot(principal, row.id);
    expect(snapshot.userMessage).toBe('Hello');
    expect(JSON.stringify(snapshot)).not.toContain(row.invocationId);
    expect(JSON.stringify(snapshot)).not.toContain(row.bindingGeneration);
    expect(snapshot.cursor).toMatch(/^v1\./);
  });
  it('returns the text and watermark from the exact same durable projection', async () => {
    const { service, row } = fixture();
    const state = projectRuntimeEvent(
      emptyProjection(),
      {
        id: 'native-1',
        event: 'messages-tuple',
        data: [{ type: 'AIMessageChunk', id: 'message', content: 'Answer' }, {}],
      },
      row.invocationId,
    );
    Object.assign(row, {
      reducerState: state,
      sourceWatermark: state.sourceId,
      projectionRevision: state.sequence,
      publicText: 'Answer',
    });
    const snapshot = await service.snapshot(principal, row.id);
    expect(snapshot).toMatchObject({ assistantText: 'Answer', revision: 1 });
    await expect(service.load(principal, row.id, snapshot.cursor!)).resolves.toHaveProperty(
      'state',
      state,
    );
  });
  it('rejects a cursor minted for another execution even under the same owner', async () => {
    const one = fixture();
    const two = fixture();
    const snapshot = await one.service.snapshot(principal, one.row.id);
    await expect(two.service.load(principal, two.row.id, snapshot.cursor!)).rejects.toMatchObject({
      code: 'invalid_cursor',
    });
  });
  it('supports the previous cursor key during bounded rotation', async () => {
    const { service, row, config } = fixture();
    config.set('EXECUTION_CURSOR_KEY', previousKey);
    const snapshot = await service.snapshot(principal, row.id);
    config.set('EXECUTION_CURSOR_KEY', currentKey);
    await expect(service.load(principal, row.id, snapshot.cursor!)).resolves.toHaveProperty(
      'row',
      row,
    );
  });
  it('rejects corrupted stored checkpoint state rather than silently replaying from an invented position', async () => {
    const { service, row } = fixture();
    row.sourceWatermark = 'native-1';
    await expect(service.snapshot(principal, row.id)).rejects.toMatchObject({
      code: 'runtime_recovery_required',
    });
  });
  it('reads the files of a turn once: an observer that already holds them is not charged again', async () => {
    const { row } = fixture();
    const file = { fileId: 'file', name: 'a.pdf' };
    const forMessage = vi.fn().mockResolvedValue([file]);
    const service = new ExecutionObservationService(
      { getObservation: vi.fn().mockResolvedValue(row) } as unknown as ExecutionsService,
      {
        get: vi.fn().mockResolvedValue({ id: row.conversationId }),
      } as unknown as ConversationsService,
      {
        getRepository: () => ({
          findOne: vi.fn().mockResolvedValue({ id: 'user-turn', content: 'Hello' }),
        }),
      } as unknown as DataSource,
      new ConfigService({ EXECUTION_CURSOR_KEY: currentKey }),
      { forMessage } as unknown as MessageAttachmentsService,
    );

    const first = await service.load(principal, row.id);
    expect(first.attachments).toEqual([file]);
    expect(forMessage).toHaveBeenCalledExactlyOnceWith('user-turn');

    // What every 500 ms poll of a stream does: no further attachment query, same files.
    const polled = await service.load(principal, row.id, undefined, first.attachments);
    expect(polled.attachments).toBe(first.attachments);
    expect(forMessage).toHaveBeenCalledOnce();
  });
  it('does authorization before examining an attacker cursor', async () => {
    const { service, row, getObservation } = fixture();
    getObservation.mockRejectedValue(new Error('denied'));
    await expect(service.load(principal, row.id, 'garbage')).rejects.toThrow('denied');
  });
});
