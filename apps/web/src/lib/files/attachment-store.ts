import type { StoredFile } from '@alfred/contracts';

import {
  attachmentFromStoredFile,
  type ComposerAttachment,
} from '@/lib/files/composer-attachments';
import type { FileUploadItem } from '@/lib/files/file-upload';

/** One chip as the store remembers it: an upload it follows, or a file of the library. */
export type AttachmentEntry =
  | { readonly source: 'upload'; readonly localId: string }
  | {
      readonly source: 'library';
      readonly localId: string;
      readonly fileId: string;
      /** Null for an id handed over by the router until the API names the file. */
      readonly snapshot: StoredFile | null;
    };

export interface AttachmentStoreState {
  /** Chips per composer, in the order they were added. */
  readonly scopes: Readonly<Record<string, readonly AttachmentEntry[]>>;
  /** The latest state the API gave for a file, whatever chip shows it. */
  readonly known: Readonly<Record<string, StoredFile>>;
  readonly notices: Readonly<Record<string, string | null>>;
  /** Files deleted from the library during this session: their chips leave every composer. */
  readonly deleted: readonly string[];
  /** Files the API stopped serving, with the reason their chips show. */
  readonly unavailable: Readonly<Record<string, string>>;
}

export const EMPTY_ATTACHMENT_STORE: AttachmentStoreState = Object.freeze({
  deleted: [],
  known: {},
  unavailable: {},
  notices: {},
  scopes: {},
});

export type AttachmentStoreAction =
  | { readonly type: 'reset' }
  | {
      readonly type: 'added';
      readonly scope: string;
      readonly entries: readonly AttachmentEntry[];
      readonly notice: string | null;
    }
  | { readonly type: 'noticed'; readonly scope: string; readonly notice: string | null }
  | { readonly type: 'removed'; readonly scope: string; readonly localIds: readonly string[] }
  | { readonly type: 'settled'; readonly file: StoredFile }
  | { readonly type: 'forgotten'; readonly fileIds: readonly string[] }
  | { readonly type: 'unavailable'; readonly fileId: string; readonly error: string };

const fileIdOf = (entry: AttachmentEntry) => (entry.source === 'library' ? entry.fileId : null);

export function attachmentStoreReducer(
  state: AttachmentStoreState,
  action: AttachmentStoreAction,
): AttachmentStoreState {
  if (action.type === 'reset') return EMPTY_ATTACHMENT_STORE;
  if (action.type === 'noticed')
    return { ...state, notices: { ...state.notices, [action.scope]: action.notice } };
  if (action.type === 'added') {
    const current = state.scopes[action.scope] ?? [];
    // Two clicks in one frame both passed the caller's check: the same file is kept once.
    const fresh = action.entries.filter(
      (entry) =>
        !current.some(
          (known) =>
            known.localId === entry.localId ||
            (fileIdOf(entry) !== null && fileIdOf(known) === fileIdOf(entry)),
        ),
    );
    return {
      ...state,
      notices: { ...state.notices, [action.scope]: action.notice },
      scopes: { ...state.scopes, [action.scope]: [...current, ...fresh] },
    };
  }
  if (action.type === 'removed') {
    const current = state.scopes[action.scope] ?? [];
    return {
      ...state,
      notices: { ...state.notices, [action.scope]: null },
      scopes: {
        ...state.scopes,
        [action.scope]: current.filter((entry) => !action.localIds.includes(entry.localId)),
      },
    };
  }
  if (action.type === 'settled')
    return { ...state, known: { ...state.known, [action.file.id]: action.file } };
  if (action.type === 'forgotten')
    return { ...state, deleted: [...new Set([...state.deleted, ...action.fileIds])] };
  return { ...state, unavailable: { ...state.unavailable, [action.fileId]: action.error } };
}

/** Of two states of one file, the one the API wrote last. */
function latest(first: StoredFile | null, second: StoredFile | undefined): StoredFile | null {
  if (first === null) return second ?? null;
  if (second === undefined) return first;
  return second.updatedAt >= first.updatedAt ? second : first;
}

/** The chips of one composer, resolved against the uploads and the latest known files. */
export function attachmentsOf(
  state: AttachmentStoreState,
  scope: string,
  uploads: readonly FileUploadItem[],
): readonly ComposerAttachment[] {
  /** A chip whose library file is known by id; its state comes from the latest answer. */
  const stored = (localId: string, fileId: string, snapshot: StoredFile | null) => {
    if (state.deleted.includes(fileId)) return [];
    const file = latest(snapshot, state.known[fileId]);
    const error = state.unavailable[fileId];
    const chip: ComposerAttachment =
      file === null
        ? {
            error: null,
            fileId,
            kind: null,
            localId,
            name: 'Fichier',
            retryable: false,
            status: 'processing',
          }
        : attachmentFromStoredFile(file, localId);
    return [error === undefined ? chip : { ...chip, error, status: 'failed' as const }];
  };
  return (state.scopes[scope] ?? []).flatMap((entry): ComposerAttachment[] => {
    if (entry.source === 'library') return stored(entry.localId, entry.fileId, entry.snapshot);
    const upload = uploads.find((item) => item.uploadId === entry.localId);
    // The upload was forgotten (account change): its chip goes with it.
    if (upload === undefined) return [];
    if (upload.file !== null) return stored(entry.localId, upload.file.id, upload.file);
    return [
      {
        error: upload.error,
        fileId: null,
        kind: upload.kind,
        localId: entry.localId,
        name: upload.name,
        retryable: upload.retryable,
        status: upload.status === 'done' ? 'processing' : upload.status,
      },
    ];
  });
}
