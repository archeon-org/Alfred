import type { ContextDocument, ContextDocumentKind } from '@alfred/contracts';
import type { EntityManager } from 'typeorm';
import { ProjectEntity } from '../../projects/infrastructure/persistence/project.entity';
import { contentHash, nextContextRevision, type ContextScope } from '../domain/context-document';
import type { ContextRepository } from '../domain/context-repository';
import { ContextDocumentEntity } from './context-document.entity';

/** Caller holds the authorized parent lock for writes, including first-time creation. */
export class TypeOrmContextRepository implements ContextRepository {
  constructor(private readonly manager: EntityManager) {}
  async read(scope: ContextScope, kind: ContextDocumentKind): Promise<ContextDocument | null> {
    const row = await this.manager
      .getRepository(ContextDocumentEntity)
      .findOneBy(this.where(scope, kind));
    return row ? this.dto(row) : null;
  }
  async save(
    scope: ContextScope,
    kind: ContextDocumentKind,
    content: string,
    expectedRevision: number,
  ): Promise<ContextDocument> {
    const current = await this.read(scope, kind);
    const revision = nextContextRevision(current, content, expectedRevision);
    if (current && current.revision === revision) return current;
    const repository = this.manager.getRepository(ContextDocumentEntity);
    const values = { content, contentHash: contentHash(content), revision };
    if (current) {
      await repository.update(this.where(scope, kind), values);
    } else {
      await repository.insert({ ...this.where(scope, kind), ...values });
    }
    if (scope.type === 'project' && kind === 'context') {
      // Read-only legacy API mirror, maintained in the same transaction as canonical writes.
      await this.manager
        .getRepository(ProjectEntity)
        .update(scope.id, { context: content === '' ? null : content });
    }
    return (await this.read(scope, kind))!;
  }
  private where(scope: ContextScope, kind: ContextDocumentKind) {
    return scope.type === 'personal' ? { userId: scope.id, kind } : { projectId: scope.id, kind };
  }
  private dto(row: ContextDocumentEntity): ContextDocument {
    return {
      kind: row.kind,
      content: row.content,
      revision: row.revision,
      contentHash: row.contentHash,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
