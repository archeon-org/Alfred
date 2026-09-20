import { EXECUTION_MESSAGE_MAX_LENGTH } from '@alfred/contracts';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { StartExecutionDto } from '@api/modules/executions/api/dto/start-execution.dto';

const SUBMISSION = '2f1c6d0e-5a57-4b52-9d0a-0f3b6a1c9e11';
const FILE = '9b0d7c2a-1e34-4f56-8a90-b1c2d3e4f5a6';

async function failures(body: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(plainToInstance(StartExecutionDto, body));
  return errors.flatMap((error) => Object.keys(error.constraints ?? {}));
}

describe('StartExecutionDto', () => {
  it('requires text when nothing is attached, and accepts a message of files only', async () => {
    expect(await failures({ submissionId: SUBMISSION, message: 'Bonjour' })).toEqual([]);
    expect(await failures({ submissionId: SUBMISSION, message: '   ' })).toEqual([
      'messageOrAttachments',
    ]);
    expect(await failures({ submissionId: SUBMISSION, message: '', attachmentIds: [] })).toEqual([
      'messageOrAttachments',
    ]);
    expect(
      await failures({ submissionId: SUBMISSION, message: '', attachmentIds: [FILE] }),
    ).toEqual([]);
  });

  it('keeps the type and the maximum length of the text when a file is attached', async () => {
    const attached = { submissionId: SUBMISSION, attachmentIds: [FILE] };

    expect(
      await failures({ ...attached, message: 'a'.repeat(EXECUTION_MESSAGE_MAX_LENGTH + 1) }),
    ).toContain('maxLength');
    expect(await failures({ ...attached, message: 123 })).toContain('isString');
    expect(await failures({ ...attached, message: { text: 'x' } })).toContain('isString');
    expect(await failures(attached)).toContain('isString');
  });
});
