import {
  type ArtifactContentStore,
  ContentStoreError,
  type StoredContent,
} from '../../domain/content-store.port';

/**
 * The store of a deployment whose upload capability is off. Every upload route is already hidden
 * by the feature guard; a consumer outside those routes gets a typed refusal rather than a
 * `null` it would dereference (ADR 0010: a disabled mode is explicit).
 */
export class DisabledContentStore implements ArtifactContentStore {
  put(): Promise<StoredContent> {
    return Promise.reject(new ContentStoreError('storage_unavailable'));
  }

  get(): Promise<Buffer | null> {
    return Promise.reject(new ContentStoreError('storage_unavailable'));
  }

  exists(): Promise<boolean> {
    return Promise.reject(new ContentStoreError('storage_unavailable'));
  }

  delete(): Promise<void> {
    return Promise.reject(new ContentStoreError('storage_unavailable'));
  }

  probe(): Promise<void> {
    return Promise.resolve();
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}
