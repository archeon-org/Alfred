import { FILE_MAX_ATTACHMENTS_PER_MESSAGE, FILE_MAX_IMAGES_PER_MESSAGE } from '@alfred/contracts';
import { describe, expect, it } from 'vitest';

import {
  attachmentsOf,
  attachmentStoreReducer,
  EMPTY_ATTACHMENT_STORE,
  type AttachmentStoreAction,
} from '@/lib/files/attachment-store';
import {
  attachmentFromStoredFile,
  attachmentIdsFrom,
  attachmentLimitReason,
  attachmentsBlockReason,
  sendableAttachments,
  type ComposerAttachment,
} from '@/lib/files/composer-attachments';
import { fileUploadReducer, type FileUploadItem } from '@/lib/files/file-upload';
import { FILE_ID, SECOND_FILE_ID, storedFile } from '../../../support/files-api';

const chip = (overrides: Partial<ComposerAttachment> = {}): ComposerAttachment => ({
  error: null,
  fileId: FILE_ID,
  kind: 'pdf',
  localId: 'chip-1',
  name: 'rapport.pdf',
  retryable: false,
  status: 'ready',
  ...overrides,
});
const upload = (overrides: Partial<FileUploadItem> = {}): FileUploadItem => ({
  error: null,
  file: null,
  kind: 'pdf',
  name: 'rapport.pdf',
  owner: 'composer:c1',
  retryable: false,
  status: 'uploading',
  uploadId: 'u1',
  ...overrides,
});
const reduce = (actions: readonly AttachmentStoreAction[]) =>
  actions.reduce(attachmentStoreReducer, EMPTY_ATTACHMENT_STORE);

describe('composer attachment rules', () => {
  it('follows the readiness of a library file, with the reason of a failure', () => {
    expect(attachmentFromStoredFile(storedFile(), 'x')).toMatchObject({
      status: 'ready',
      error: null,
    });
    expect(
      attachmentFromStoredFile(storedFile({ readiness: 'failed', failureCode: 'timeout' }), 'x'),
    ).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('trop de temps') as unknown,
    });
  });

  it('bounds the files and the images of one message', () => {
    const full = Array.from({ length: FILE_MAX_ATTACHMENTS_PER_MESSAGE }, () => chip());
    expect(attachmentLimitReason(full, 'pdf')).toContain(`${FILE_MAX_ATTACHMENTS_PER_MESSAGE}`);
    const images = Array.from({ length: FILE_MAX_IMAGES_PER_MESSAGE }, () =>
      chip({ kind: 'image' }),
    );
    expect(attachmentLimitReason(images, 'image')).toContain(
      `${FILE_MAX_IMAGES_PER_MESSAGE} images`,
    );
    expect(attachmentLimitReason(images, 'pdf')).toBeNull();
    expect(attachmentLimitReason([], null)).toBeNull();
  });

  it('holds the message back while a file travels, is analysed, or has failed', () => {
    expect(attachmentsBlockReason([])).toBeNull();
    expect(attachmentsBlockReason([chip()])).toBeNull();
    expect(attachmentsBlockReason([chip({ status: 'uploading' })])).toContain('prêts');
    expect(attachmentsBlockReason([chip({ status: 'processing' })])).toContain('prêts');
    expect(attachmentsBlockReason([chip(), chip({ status: 'failed' })])).toContain('échec');
  });

  it('sends the ready files only, in chip order', () => {
    expect(
      sendableAttachments([
        chip({ localId: 'a' }),
        chip({ fileId: null, localId: 'b', status: 'uploading' }),
        chip({ fileId: SECOND_FILE_ID, kind: 'image', localId: 'c', name: 'photo.png' }),
      ]),
    ).toEqual([
      { fileId: FILE_ID, kind: 'pdf', localId: 'a', name: 'rapport.pdf' },
      { fileId: SECOND_FILE_ID, kind: 'image', localId: 'c', name: 'photo.png' },
    ]);
  });

  it('reads attachment ids from router state and nothing else', () => {
    expect(attachmentIdsFrom(null)).toEqual([]);
    expect(attachmentIdsFrom({ draft: 'x' })).toEqual([]);
    expect(attachmentIdsFrom({ attachmentIds: 'abc' })).toEqual([]);
    expect(attachmentIdsFrom({ attachmentIds: [FILE_ID, 4, '', SECOND_FILE_ID] })).toEqual([
      FILE_ID,
      SECOND_FILE_ID,
    ]);
    expect(
      attachmentIdsFrom({ attachmentIds: Array.from({ length: 20 }, (_, i) => `id-${i}`) }),
    ).toHaveLength(FILE_MAX_ATTACHMENTS_PER_MESSAGE);
  });
});

describe('attachment store', () => {
  const library = {
    fileId: FILE_ID,
    localId: FILE_ID,
    snapshot: storedFile(),
    source: 'library' as const,
  };

  it('keeps chips per composer and the same file once', () => {
    const state = reduce([
      { type: 'added', scope: 'c1', entries: [library], notice: 'joint' },
      { type: 'added', scope: 'c1', entries: [library], notice: null },
      { type: 'added', scope: 'c2', entries: [library], notice: null },
    ]);
    expect(attachmentsOf(state, 'c1', [])).toHaveLength(1);
    expect(attachmentsOf(state, 'c2', [])).toHaveLength(1);
    expect(attachmentsOf(state, 'other', [])).toEqual([]);
    expect(state.notices.c1).toBeNull();
  });

  it('shows an upload as it travels, then the library file it became', () => {
    const state = reduce([
      { type: 'added', scope: 'c1', entries: [{ localId: 'u1', source: 'upload' }], notice: null },
    ]);
    expect(attachmentsOf(state, 'c1', [upload()])[0]).toMatchObject({
      status: 'uploading',
      fileId: null,
    });
    expect(
      attachmentsOf(state, 'c1', [
        upload({ status: 'failed', error: 'Refusé.', retryable: true }),
      ])[0],
    ).toMatchObject({ status: 'failed', error: 'Refusé.', retryable: true });
    const done = upload({ status: 'done', file: storedFile({ readiness: 'processing' }) });
    expect(attachmentsOf(state, 'c1', [done])[0]).toMatchObject({
      status: 'processing',
      fileId: FILE_ID,
    });
    // An upload the manager forgot (account change) takes its chip with it.
    expect(attachmentsOf(state, 'c1', [])).toEqual([]);
  });

  it('follows the latest answer about a file, whichever chip shows it', () => {
    const processing = storedFile({ readiness: 'processing' });
    const state = reduce([
      {
        type: 'added',
        scope: 'c1',
        entries: [{ ...library, snapshot: processing }],
        notice: null,
      },
      {
        type: 'settled',
        file: storedFile({ name: 'renommé.pdf', updatedAt: '2026-09-18T10:00:00.000Z' }),
      },
    ]);
    expect(attachmentsOf(state, 'c1', [])[0]).toMatchObject({
      status: 'ready',
      name: 'renommé.pdf',
    });
  });

  it('names an adopted id once the API answers, or says why it cannot', () => {
    const adopted = { ...library, snapshot: null };
    const waiting = reduce([{ type: 'added', scope: 'c1', entries: [adopted], notice: null }]);
    expect(attachmentsOf(waiting, 'c1', [])[0]).toMatchObject({
      status: 'processing',
      name: 'Fichier',
    });
    const gone = attachmentStoreReducer(waiting, {
      type: 'unavailable',
      fileId: FILE_ID,
      error: 'Ce fichier n’est plus disponible.',
    });
    expect(attachmentsOf(gone, 'c1', [])[0]).toMatchObject({
      status: 'failed',
      error: 'Ce fichier n’est plus disponible.',
    });
  });

  it('drops the chips of a deleted file everywhere, removes on request and resets', () => {
    const second = {
      ...library,
      fileId: SECOND_FILE_ID,
      localId: SECOND_FILE_ID,
      snapshot: storedFile({ id: SECOND_FILE_ID }),
    };
    const state = reduce([
      { type: 'added', scope: 'c1', entries: [library, second], notice: null },
      { type: 'forgotten', fileIds: [FILE_ID] },
    ]);
    expect(attachmentsOf(state, 'c1', []).map((item) => item.fileId)).toEqual([SECOND_FILE_ID]);
    const removed = attachmentStoreReducer(state, {
      type: 'removed',
      scope: 'c1',
      localIds: [SECOND_FILE_ID],
    });
    expect(attachmentsOf(removed, 'c1', [])).toEqual([]);
    const noticed = attachmentStoreReducer(removed, { type: 'noticed', scope: 'c1', notice: 'n' });
    expect(noticed.notices.c1).toBe('n');
    expect(attachmentStoreReducer(noticed, { type: 'reset' })).toBe(EMPTY_ATTACHMENT_STORE);
  });
});

describe('upload items', () => {
  it('moves an item through its states and forgets it on removal', () => {
    let items = fileUploadReducer([], {
      type: 'added',
      items: [upload({ status: 'validating' })],
    });
    items = fileUploadReducer(items, { type: 'validated', uploadId: 'u1', kind: 'image' });
    expect(items[0]).toMatchObject({ status: 'uploading', kind: 'image' });
    items = fileUploadReducer(items, {
      type: 'failed',
      uploadId: 'u1',
      error: 'x',
      retryable: true,
    });
    expect(items[0]).toMatchObject({ status: 'failed', error: 'x', retryable: true });
    items = fileUploadReducer(items, { type: 'retried', uploadId: 'u1' });
    expect(items[0]).toMatchObject({ status: 'uploading', error: null });
    items = fileUploadReducer(items, { type: 'done', uploadId: 'u1', file: storedFile() });
    expect(items[0]).toMatchObject({ status: 'done', kind: 'pdf' });
    expect(fileUploadReducer(items, { type: 'removed', uploadId: 'u1' })).toEqual([]);
    expect(fileUploadReducer(items, { type: 'reset' })).toEqual([]);
  });
});
