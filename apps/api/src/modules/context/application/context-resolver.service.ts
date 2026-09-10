import type { ContextDocument, ContextDocumentKind } from '@alfred/contracts';
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AuthPrincipal } from '../../../common/auth/auth-principal';
import {
  contextFingerprint,
  emptyContextDocument,
  type ContextScope,
} from '../domain/context-document';
import { TypeOrmContextRepository } from '../infrastructure/typeorm-context.repository';
import { ContextScopeService } from './context-scope.service';

export interface ResolvedContextSource extends ContextDocument {
  readonly scope: 'personal' | 'project';
  readonly scopeId: string;
  readonly plane: 'directive' | 'evidence';
}
export interface ResolvedConversationContext {
  readonly conversationId: string;
  readonly projectId: string;
  readonly fingerprint: string;
  readonly sources: readonly ResolvedContextSource[];
}

/** Internal product service only. Never accepts an assembled browser context or grants authority. */
@Injectable()
export class ContextResolverService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly scopes: ContextScopeService,
  ) {}
  async resolve(
    principal: AuthPrincipal,
    conversationId: string,
  ): Promise<ResolvedConversationContext> {
    // One MVCC snapshot covers authorization, the current conversation FK and all four sources.
    // A concurrent transfer yields the complete pre-transfer or post-transfer state, never a hybrid.
    return this.dataSource.transaction('REPEATABLE READ', async (manager) => {
      const personal = await this.scopes.authorize(manager, principal);
      const project = await this.scopes.conversation(manager, principal, conversationId);
      const repository = new TypeOrmContextRepository(manager);
      const inputs: readonly [ContextScope, ContextDocumentKind][] = [
        [personal, 'instructions'],
        [personal, 'preferences'],
        [project, 'context'],
        [project, 'preferences'],
      ];
      const sources: ResolvedContextSource[] = [];
      for (const [scope, kind] of inputs) {
        sources.push({
          ...((await repository.read(scope, kind)) ?? emptyContextDocument(kind)),
          scope: scope.type,
          scopeId: scope.id,
          plane: kind === 'context' ? 'evidence' : 'directive',
        });
      }
      return {
        conversationId,
        projectId: project.id,
        sources,
        fingerprint: contextFingerprint(sources),
      };
    });
  }
}
