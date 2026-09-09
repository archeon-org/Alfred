import type { AuthPrincipal } from '@api/common/auth/auth-principal';
import type { OwnerScope } from '@api/common/ownership/owner-scope';
import type { TenantsService } from '@api/modules/tenants/tenants.service';
import type { ProjectEntity } from '@api/modules/projects/infrastructure/persistence/project.entity';
import type { ConversationEntity } from '@api/modules/conversations/infrastructure/persistence/conversation.entity';
import { vi } from 'vitest';

export const principal: AuthPrincipal = Object.freeze({
  email: 'ada@example.test',
  id: '21dd1aaa-d564-4a45-9a07-dbc5777d25d5',
  role: 'user',
  sessionId: 'session-1',
});

export const scope: OwnerScope = Object.freeze({
  ownerUserId: principal.id,
  tenantId: '7c1d4d6e-2c3a-4d5e-8f90-1a2b3c4d5e6f',
});

/** Built per test: the vitest `mockReset` option clears module-level mock implementations. */
export function tenantsService(): TenantsService {
  return {
    defaultTenantId: vi.fn().mockResolvedValue(scope.tenantId),
    scopeFor: vi.fn().mockResolvedValue(scope),
  } as unknown as TenantsService;
}

export function projectRow(overrides: Partial<ProjectEntity> = {}): ProjectEntity {
  return {
    archivedAt: null,
    context: null,
    createdAt: new Date('2026-09-09T10:00:00.000Z'),
    description: 'Un espace pour penser la prochaine version.',
    id: '0b6e1a9e-0a7f-4c26-9f5b-2f1a2c3d4e5f',
    kind: 'named',
    name: 'Refonte du portail',
    owner: undefined as unknown as ProjectEntity['owner'],
    status: 'active',
    tenant: undefined as unknown as ProjectEntity['tenant'],
    updatedAt: new Date('2026-09-09T11:00:00.000Z'),
    ...scope,
    ...overrides,
  };
}

export function conversationRow(overrides: Partial<ConversationEntity> = {}): ConversationEntity {
  return {
    archivedAt: null,
    createdAt: new Date('2026-09-09T12:00:00.000Z'),
    id: '3f2e1d0c-9b8a-4765-8321-fedcba987654',
    lastActivityAt: null,
    project: undefined as unknown as ConversationEntity['project'],
    projectId: projectRow().id,
    title: 'Analyse de l’existant',
    titleSource: 'user',
    updatedAt: new Date('2026-09-09T12:00:00.000Z'),
    ...overrides,
  };
}

/** Minimal chainable TypeORM query-builder double. */
export function queryBuilder(result: unknown = null) {
  const builder = {
    andWhere: vi.fn(),
    getOne: vi.fn().mockResolvedValue(result),
    setLock: vi.fn(),
    where: vi.fn(),
  };
  builder.where.mockReturnValue(builder);
  builder.andWhere.mockReturnValue(builder);
  builder.setLock.mockReturnValue(builder);
  return builder;
}
