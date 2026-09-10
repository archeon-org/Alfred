import type { ContextDocument, ContextDocumentKind } from '@alfred/contracts';
import type { ContextScope } from './context-document';

/** Semantic product boundary; no file paths or runtime namespaces cross this port. */
export interface ContextRepository {
  read(scope: ContextScope, kind: ContextDocumentKind): Promise<ContextDocument | null>;
  save(
    scope: ContextScope,
    kind: ContextDocumentKind,
    content: string,
    expectedRevision: number,
  ): Promise<ContextDocument>;
}
