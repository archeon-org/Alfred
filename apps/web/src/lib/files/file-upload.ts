import type { FileKind, StoredFile } from '@alfred/contracts';

/** `fetch` reports no progress: `uploading` covers the wait for a slot and the request itself. */
export type FileUploadStatus = 'validating' | 'uploading' | 'done' | 'failed';

/** Files imported into the library itself, as opposed to the chips of one composer. */
export const LIBRARY_UPLOADS = 'library';

export interface FileUploadItem {
  /** Generated once; every retry of this file sends it again. */
  readonly uploadId: string;
  /** Who asked: `LIBRARY_UPLOADS` or the scope of a composer. */
  readonly owner: string;
  readonly name: string;
  readonly kind: FileKind | null;
  readonly status: FileUploadStatus;
  /** The library file once the API answered. */
  readonly file: StoredFile | null;
  readonly error: string | null;
  readonly retryable: boolean;
}

export interface FileUploadOptions {
  readonly owner: string;
  /** Null or absent: the top level of the library. */
  readonly folderId?: string | null;
}

/** View model of the workspace's uploads; independent of React and of the hook behind it. */
export interface FileUploadManager {
  readonly items: readonly FileUploadItem[];
  /** Starts one upload per file and returns their ids, in order. */
  readonly add: (files: readonly File[], options: FileUploadOptions) => readonly string[];
  /** Sends a failed file again, under the same `uploadId`. */
  readonly retry: (uploadId: string) => void;
  /** Cancels an upload in flight, or forgets one that ended. */
  readonly remove: (uploadId: string) => void;
}

export type FileUploadAction =
  | { readonly type: 'reset' }
  | { readonly type: 'added'; readonly items: readonly FileUploadItem[] }
  | { readonly type: 'validated'; readonly uploadId: string; readonly kind: FileKind }
  | { readonly type: 'retried'; readonly uploadId: string }
  | { readonly type: 'done'; readonly uploadId: string; readonly file: StoredFile }
  | {
      readonly type: 'failed';
      readonly uploadId: string;
      readonly error: string;
      readonly retryable: boolean;
    }
  | { readonly type: 'removed'; readonly uploadId: string };

export function fileUploadReducer(
  items: readonly FileUploadItem[],
  action: FileUploadAction,
): readonly FileUploadItem[] {
  if (action.type === 'reset') return [];
  if (action.type === 'added') return [...items, ...action.items];
  if (action.type === 'removed') return items.filter((item) => item.uploadId !== action.uploadId);
  return items.map((item) => {
    if (item.uploadId !== action.uploadId) return item;
    if (action.type === 'validated') return { ...item, kind: action.kind, status: 'uploading' };
    if (action.type === 'retried')
      return { ...item, error: null, retryable: false, status: 'uploading' };
    if (action.type === 'done')
      return { ...item, file: action.file, kind: action.file.kind, status: 'done' };
    return { ...item, error: action.error, retryable: action.retryable, status: 'failed' };
  });
}
