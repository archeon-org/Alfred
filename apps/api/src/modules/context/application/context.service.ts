import type {
  ContextDocument,
  ContextDocumentKind,
  ContextDocumentSet,
  SaveContextDocumentInput,
} from '@alfred/contracts';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import type { AuthPrincipal } from '../../../common/auth/auth-principal';
import { ApiException } from '../../../common/errors/api.exception';
import { emptyContextDocument, normalizeContextContent } from '../domain/context-document';
import { TypeOrmContextRepository } from '../infrastructure/typeorm-context.repository';
import { ContextScopeService } from './context-scope.service';

@Injectable()
export class ContextService {
  private readonly logger = new Logger(ContextService.name);
  constructor(
    private readonly dataSource: DataSource,
    private readonly scopes: ContextScopeService,
    private readonly config: ConfigService,
  ) {}
  get maxBytes(): number {
    return this.config.get<number>('CONTEXT_DOCUMENT_MAX_BYTES', 65_536);
  }
  async list(principal: AuthPrincipal, projectId?: string): Promise<ContextDocumentSet> {
    return this.dataSource.transaction('REPEATABLE READ', async (manager) => {
      const scope = await this.scopes.authorize(manager, principal, projectId);
      const repository = new TypeOrmContextRepository(manager);
      const kinds: ContextDocumentKind[] =
        projectId === undefined ? ['instructions', 'preferences'] : ['context', 'preferences'];
      const documents: ContextDocument[] = [];
      for (const kind of kinds)
        documents.push((await repository.read(scope, kind)) ?? emptyContextDocument(kind));
      return { documents, maxBytes: this.maxBytes };
    });
  }
  async save(
    principal: AuthPrincipal,
    kind: ContextDocumentKind,
    input: SaveContextDocumentInput,
    projectId?: string,
  ): Promise<ContextDocument> {
    if (
      !(
        projectId === undefined ? ['instructions', 'preferences'] : ['context', 'preferences']
      ).includes(kind)
    ) {
      throw new ApiException(400, 'invalid_content', 'Invalid document kind for this scope.');
    }
    const content = normalizeContextContent(input.content, this.maxBytes);
    const result = await this.dataSource.transaction(async (manager) => {
      const scope = await this.scopes.authorize(manager, principal, projectId, true);
      return new TypeOrmContextRepository(manager).save(
        scope,
        kind,
        content,
        input.expectedRevision,
      );
    });
    this.logger.log({
      event: 'context_saved',
      actorId: principal.id,
      scope: projectId === undefined ? 'personal' : 'project',
      scopeId: projectId ?? principal.id,
      kind,
      revision: result.revision,
    });
    return result;
  }
}
