import {
  messageAttachmentSchema,
  messageSchema,
  startExecutionInputSchema,
} from '@alfred/contracts';
import { describe, expect, it } from 'vitest';

const row = {
  id: '33333333-3333-4333-8333-333333333331',
  conversationId: '3f2e1d0c-9b8a-4765-8321-fedcba987654',
  executionId: null,
  role: 'user',
  content: 'Salut',
  createdAt: '2026-09-11T09:00:00.000Z',
};
const attachment = {
  fileId: '5a0f3b9e-1c2d-4e3f-8a4b-5c6d7e8f9a01',
  name: 'rapport.pdf',
  kind: 'pdf',
  mediaType: 'application/pdf',
  sizeBytes: 1024,
  available: false,
  delivery: 'unavailable',
  truncated: false,
};

describe('message attachments contract', () => {
  it('still reads a message of an older API, which carries no attachments', () => {
    const parsed = messageSchema.parse(row);
    expect(parsed.attachments).toBeUndefined();
  });

  it('reads the files a user row carried, including one deleted since', () => {
    const parsed = messageSchema.parse({ ...row, attachments: [attachment] });
    expect(parsed.attachments).toEqual([attachment]);
    expect(messageAttachmentSchema.safeParse({ ...attachment, kind: 'exe' }).success).toBe(false);
  });

  it('accepts a message that is its files alone, and refuses one that is empty', () => {
    const submissionId = '22222222-2222-4222-8222-222222222222';
    expect(
      startExecutionInputSchema.safeParse({
        message: '',
        submissionId,
        attachmentIds: [attachment.fileId],
      }).success,
    ).toBe(true);
    expect(startExecutionInputSchema.safeParse({ message: '  ', submissionId }).success).toBe(
      false,
    );
    expect(startExecutionInputSchema.safeParse({ message: 'Salut', submissionId }).success).toBe(
      true,
    );
  });
});
