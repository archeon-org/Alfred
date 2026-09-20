import { EXECUTION_JSON_PROFILE } from '@alfred/contracts';
import { describe, expect, it, vi } from 'vitest';
import { ExecutionsController } from '@api/modules/executions/api/executions.controller';
import type { ExecutionsService } from '@api/modules/executions/application/executions.service';
import type { ExecutionObservationService } from '@api/modules/executions/application/execution-observation.service';
import { principal } from '../../../../support/project-fixtures';

const id = '3f2e1d0c-9b8a-4765-8321-fedcba987654';
const submissionId = '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d';
function fixture() {
  const start = vi.fn().mockResolvedValue({ execution: { id } });
  const active = vi.fn().mockResolvedValue(null);
  const listMessages = vi.fn().mockResolvedValue([]);
  const snapshot = vi.fn().mockResolvedValue({ execution: { id } });
  const controller = new ExecutionsController(
    { start, active, listMessages } as unknown as ExecutionsService,
    { snapshot } as unknown as ExecutionObservationService,
  );
  return { controller, start, snapshot, active };
}
describe('durable execution submission', () => {
  it('commits an idempotent command and returns a safe snapshot without attaching the runtime', async () => {
    const { controller, start, snapshot } = fixture();
    await expect(
      controller.start(principal, id, { message: 'Hello', submissionId }, EXECUTION_JSON_PROFILE),
    ).resolves.toEqual({ success: true, data: { snapshot: { execution: { id } } } });
    expect(start).toHaveBeenCalledWith(principal, id, 'Hello', {
      submissionId,
      profile: 'snapshot-v1',
    });
    expect(snapshot).toHaveBeenCalledWith(principal, id);
  });
  it('rejects unsupported native streaming profiles before creating work', async () => {
    const { controller, start } = fixture();
    await expect(
      controller.start(principal, id, { message: 'Hello', submissionId }, 'text/event-stream'),
    ).rejects.toMatchObject({ code: 'execution_profile_unsupported' });
    expect(start).not.toHaveBeenCalled();
  });
  it('propagates denied ownership without reading a snapshot', async () => {
    const { controller, start, snapshot } = fixture();
    start.mockRejectedValue(new Error('denied'));
    await expect(
      controller.start(principal, id, { message: 'Hello', submissionId }, EXECUTION_JSON_PROFILE),
    ).rejects.toThrow('denied');
    expect(snapshot).not.toHaveBeenCalled();
  });
  it('discovers no active run without fabricating one', async () => {
    const { controller } = fixture();
    await expect(controller.active(principal, id)).resolves.toEqual({
      success: true,
      data: { snapshot: null },
    });
  });
});
