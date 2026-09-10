import { createHash } from 'node:crypto';
import type { ContextDocument, ContextDocumentKind } from '@alfred/contracts';
import { ApiException } from '../../../common/errors/api.exception';

export type ContextScope = Readonly<{ type: 'personal' | 'project'; id: string }>;
export interface ContextFingerprintSource {
  readonly scope: string;
  readonly scopeId: string;
  readonly kind: string;
  readonly revision: number;
  readonly contentHash: string;
}
export function contentHash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}
export function normalizeContextContent(content: string, maxBytes: number): string {
  if (content.includes('\0') || /[\uD800-\uDFFF]/u.test(content)) {
    throw new ApiException(
      400,
      'invalid_content',
      'Content must be valid Unicode text without NUL.',
    );
  }
  const normalized = content.replace(/\r\n?/gu, '\n');
  if (Buffer.byteLength(normalized, 'utf8') > maxBytes) {
    throw new ApiException(
      400,
      'context_content_too_large',
      'Context document exceeds its byte limit.',
      { maxBytes },
    );
  }
  return normalized;
}
export function nextContextRevision(
  current: Pick<ContextDocument, 'revision' | 'content'> | null,
  content: string,
  expectedRevision: number,
): number {
  if ((current?.revision ?? 0) !== expectedRevision) {
    throw new ApiException(
      409,
      'context_revision_conflict',
      'The document changed. Reload before saving.',
      { currentRevision: current?.revision ?? 0 },
    );
  }
  return current?.content === content ? current.revision : expectedRevision + 1;
}
export function emptyContextDocument(kind: ContextDocumentKind): ContextDocument {
  return { kind, content: '', revision: 0, contentHash: contentHash(''), updatedAt: null };
}
export function contextFingerprint(sources: readonly ContextFingerprintSource[]): string {
  return contentHash(
    JSON.stringify(
      sources.map(({ scope, scopeId, kind, revision, contentHash: hash }) => ({
        scope,
        scopeId,
        kind,
        revision,
        contentHash: hash,
      })),
    ),
  );
}
